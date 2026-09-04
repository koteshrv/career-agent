"""Regression tests for scraper health tracking and the BLOCKED cooldown.

Every bug covered here was silently broken in production behaviour while looking correct
on the page — the alerting path 404'd on an encrypted token, the 24h cooldown expired after
a single cycle, and the first failure a provider recorded raised TypeError. None of it threw
anywhere visible, because scraper_core wraps update_health in a bare `except Exception`.
"""
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

from backend import crud, health_manager, schemas
from backend.models import ScraperHealth


@pytest.fixture(autouse=True)
def _clear_notification_env_vars(monkeypatch):
    # Same rationale as tests/test_notifications.py: .env carries real Telegram values and
    # ai_agent's import-time load_dotenv() may or may not have run yet depending on
    # collection order. Force a deterministic slate.
    from backend import notifications
    for var in (notifications.ENV_TELEGRAM_BOT_TOKEN, notifications.ENV_TELEGRAM_CHAT_ID):
        monkeypatch.delenv(var, raising=False)


def _enable_telegram(db, token="123456:REAL-BOT-TOKEN"):
    crud.update_settings(db, schemas.SettingsBase(
        telegram_alerts_enabled=True,
        telegram_bot_token=token,
        telegram_chat_id="12345",
    ))


def _failure_log(company="Acme", message="500 internal error"):
    return [{"company": company, "status": "FAILED", "jobs_found": 0, "message": message}]


# ── Telegram token handling ─────────────────────────────────────────────────

def test_alert_uses_decrypted_bot_token(db_session):
    """Settings.telegram_bot_token is Fernet-encrypted at rest. Reading the model column
    directly would put the ciphertext in the API URL and every alert would 404."""
    _enable_telegram(db_session, token="123456:REAL-BOT-TOKEN")

    with patch("backend.notifications.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        health_manager.update_health(db_session, _failure_log())

    assert mock_post.called, "no alert was sent for a provider's first failure"
    url = mock_post.call_args[0][0]
    assert "123456:REAL-BOT-TOKEN" in url
    assert "gAAAAA" not in url, "alert was sent with the encrypted token"


def test_alert_respects_disabled_toggle(db_session):
    _enable_telegram(db_session)
    crud.update_settings(db_session, schemas.SettingsBase(telegram_alerts_enabled=False))

    with patch("backend.notifications.requests.post") as mock_post:
        health_manager.update_health(db_session, _failure_log())

    mock_post.assert_not_called()


def test_alert_survives_markdown_special_chars_in_error(db_session):
    """Scraper errors routinely contain _ * and ` (selectors, paths, config keys). Telegram
    rejects the whole message on unbalanced entities, so they must be escaped."""
    _enable_telegram(db_session)

    with patch("backend.notifications.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        health_manager.update_health(
            db_session, _failure_log(company="Acme_Corp", message="bad `no_results_text` *selector*")
        )

    text = mock_post.call_args[1]["json"]["text"]
    assert "\\_" in text and "\\*" in text and "\\`" in text


# ── First-failure bookkeeping ───────────────────────────────────────────────

def test_first_ever_failure_is_recorded(db_session):
    """Column defaults apply at INSERT, so a fresh unflushed row reads back None —
    `consecutive_failures += 1` used to raise TypeError here."""
    with patch("backend.notifications.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        health_manager.update_health(db_session, _failure_log())

    health = db_session.query(ScraperHealth).filter_by(provider_name="Acme").first()
    assert health is not None
    assert health.consecutive_failures == 1
    assert health.status == "BROKEN"


def test_one_provider_failing_does_not_abort_the_rest(db_session):
    """update_health is called once with every company's result; a raise partway through
    used to silently drop health for all remaining providers and skip the commit."""
    logs = _failure_log("Acme") + [
        {"company": "Globex", "status": "SUCCESS", "jobs_found": 4, "message": ""},
        {"company": "Initech", "status": "FAILED", "jobs_found": 0, "message": "timeout"},
    ]
    with patch("backend.notifications.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        health_manager.update_health(db_session, logs)

    names = {h.provider_name for h in db_session.query(ScraperHealth).all()}
    assert names == {"Acme", "Globex", "Initech"}


def test_blocked_keywords_classify_as_blocked(db_session):
    with patch("backend.notifications.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        health_manager.update_health(db_session, _failure_log(message="403 Access Denied by Cloudflare"))

    health = db_session.query(ScraperHealth).filter_by(provider_name="Acme").first()
    assert health.status == "BLOCKED"


# ── The 24-hour BLOCKED cooldown ────────────────────────────────────────────

def _block(db, company="Acme", hours_ago=4):
    health = ScraperHealth(
        provider_name=company,
        status="BLOCKED",
        consecutive_failures=1,
        last_run_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
    )
    db.add(health)
    db.commit()
    return health


def test_skipped_run_does_not_end_the_cooldown(db_session):
    """The core regression: scraper_core logs a cooldown skip, and feeding that back into
    update_health used to flip BLOCKED -> BROKEN (the skip message matches no BLOCKED
    keyword), after which is_provider_blocked stopped matching and the target was retried
    on the very next cycle instead of 24h later."""
    health = _block(db_session, hours_ago=4)
    blocked_at = health.last_run_at
    assert health_manager.is_provider_blocked(db_session, "Acme") is True

    health_manager.update_health(db_session, [
        {"company": "Acme", "status": "SKIPPED", "jobs_found": 0, "message": "BLOCKED (Cooldown active)"}
    ])
    db_session.refresh(health)

    assert health.status == "BLOCKED", "a skipped run must not reclassify the provider"
    assert health.consecutive_failures == 1, "a run that never happened must not count as a failure"
    assert health.last_run_at == blocked_at, "a skipped run must not restart the 24h window"
    assert health_manager.is_provider_blocked(db_session, "Acme") is True


def test_cooldown_expires_after_24_hours(db_session):
    _block(db_session, hours_ago=25)
    assert health_manager.is_provider_blocked(db_session, "Acme") is False


def test_skipped_runs_excluded_from_target_health(db_session):
    """get_target_health drives the alert thresholds and the health UI — counting skipped
    runs would drag down success_rate and break zero_streak on runs that never happened."""
    log = crud.create_scraper_log(
        db_session, schemas.ScraperLogBase(jobs_found=0, status="SUCCESS", trigger_source="CRON")
    )
    crud.update_scraper_log(db_session, log.id, detailed_logs=
        '[{"company":"Acme","status":"SKIPPED","jobs_found":0,"message":"BLOCKED (Cooldown active)"},'
        ' {"company":"Globex","status":"SUCCESS","jobs_found":3,"message":""}]')

    health = crud.get_target_health(db_session)
    companies = {h["company"] for h in health}
    assert companies == {"Globex"}, "skipped targets must not appear in target health"
