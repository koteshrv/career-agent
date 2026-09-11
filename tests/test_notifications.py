import pytest
from unittest.mock import patch, MagicMock

from backend import crud, notifications, schemas

USER = 1


def _enable_telegram(db, user_id=USER):
    crud.update_settings(db, user_id, schemas.SettingsBase(
        telegram_alerts_enabled=True,
        telegram_bot_token="fake-token",
        telegram_chat_id="12345",
    ))


# ── send_telegram_message ───────────────────────────────────────────────────

def test_send_skips_when_alerts_disabled(db_session):
    crud.update_settings(db_session, USER, schemas.SettingsBase(telegram_alerts_enabled=False))
    with patch("backend.notifications.requests.post") as mock_post:
        result = notifications.send_telegram_message(db_session, USER, "hello")
    assert result is False
    mock_post.assert_not_called()

def test_send_skips_when_not_configured(db_session):
    crud.update_settings(db_session, USER, schemas.SettingsBase(telegram_alerts_enabled=True))
    with patch("backend.notifications.requests.post") as mock_post:
        result = notifications.send_telegram_message(db_session, USER, "hello")
    assert result is False
    mock_post.assert_not_called()

def test_send_posts_to_telegram_when_configured(db_session):
    _enable_telegram(db_session)
    mock_resp = MagicMock(status_code=200)
    with patch("backend.notifications.requests.post", return_value=mock_resp) as mock_post:
        result = notifications.send_telegram_message(db_session, USER, "hello")
    assert result is True
    mock_post.assert_called_once()
    url = mock_post.call_args[0][0]
    assert "fake-token" in url
    assert mock_post.call_args[1]["json"]["chat_id"] == "12345"

def test_send_returns_false_on_non_200(db_session):
    _enable_telegram(db_session)
    mock_resp = MagicMock(status_code=401, text="Unauthorized")
    with patch("backend.notifications.requests.post", return_value=mock_resp):
        result = notifications.send_telegram_message(db_session, USER, "hello")
    assert result is False

def test_send_returns_false_on_network_error(db_session):
    _enable_telegram(db_session)
    with patch("backend.notifications.requests.post", side_effect=ConnectionError("boom")):
        result = notifications.send_telegram_message(db_session, USER, "hello")
    assert result is False

def test_send_uses_db_value(db_session):
    _enable_telegram(db_session)  # DB has "fake-token" / "12345"

    mock_resp = MagicMock(status_code=200)
    with patch("backend.notifications.requests.post", return_value=mock_resp) as mock_post:
        notifications.send_telegram_message(db_session, USER, "hello")
    url = mock_post.call_args[0][0]
    assert "fake-token" in url


# ── notify_scrape_run_failed ────────────────────────────────────────────────

def test_notify_scrape_run_failed_sends_message(db_session):
    _enable_telegram(db_session)
    mock_resp = MagicMock(status_code=200)
    with patch("backend.notifications.requests.post", return_value=mock_resp) as mock_post:
        notifications.notify_scrape_run_failed(db_session, USER, "Playwright crashed", "CRON")
    text = mock_post.call_args[1]["json"]["text"]
    assert "Scrape Run Failed" in text
    assert "CRON" in text
    assert "Playwright crashed" in text


# ── notify_broken_targets ───────────────────────────────────────────────────

def _make_scraper_log(db, days_ago, detailed_logs, user_id=USER):
    import json
    from datetime import datetime, timedelta, timezone
    from backend import models
    log = models.ScraperLog(
        user_id=user_id,
        timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago),
        jobs_found=0, status="SUCCESS", trigger_source="CRON",
        detailed_logs=json.dumps(detailed_logs),
    )
    db.add(log)
    db.commit()
    return log

def test_notify_broken_targets_alerts_exactly_at_threshold(db_session):
    _enable_telegram(db_session)
    # 3 consecutive failures = exactly TARGET_FAILURE_ALERT_THRESHOLD
    for days_ago in (3, 2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "Acme", "status": "FAILED", "message": "timeout"}])

    mock_resp = MagicMock(status_code=200)
    with patch("backend.notifications.requests.post", return_value=mock_resp) as mock_post:
        notifications.notify_broken_targets(db_session, USER)
    mock_post.assert_called_once()
    text = mock_post.call_args[1]["json"]["text"]
    assert "Acme" in text
    assert "3 runs failed in a row" in text

def test_notify_broken_targets_does_not_spam_past_threshold(db_session):
    _enable_telegram(db_session)
    # 4 consecutive failures — already past the threshold, should NOT re-alert.
    for days_ago in (4, 3, 2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "Acme", "status": "FAILED"}])

    with patch("backend.notifications.requests.post") as mock_post:
        notifications.notify_broken_targets(db_session, USER)
    mock_post.assert_not_called()

def test_notify_broken_targets_silent_when_nothing_broken(db_session):
    _enable_telegram(db_session)
    _make_scraper_log(db_session, 1, [{"company": "Acme", "status": "SUCCESS"}])

    with patch("backend.notifications.requests.post") as mock_post:
        notifications.notify_broken_targets(db_session, USER)
    mock_post.assert_not_called()

def test_notify_broken_targets_alerts_on_silent_zero_streak(db_session):
    _enable_telegram(db_session)
    # Healthy history, then a company quietly starts returning 0 jobs — no FAILED status
    # anywhere, so only the silent-failure signal should trigger this.
    for days_ago in (6, 5, 4):
        _make_scraper_log(db_session, days_ago, [{"company": "Wells Fargo", "status": "SUCCESS", "jobs_found": 10}])
    for days_ago in (3, 2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "Wells Fargo", "status": "SUCCESS", "jobs_found": 0}])

    mock_resp = MagicMock(status_code=200)
    with patch("backend.notifications.requests.post", return_value=mock_resp) as mock_post:
        notifications.notify_broken_targets(db_session, USER)
    mock_post.assert_called_once()
    text = mock_post.call_args[1]["json"]["text"]
    assert "Wells Fargo" in text
    assert "0 jobs" in text


# ── ping_healthcheck ─────────────────────────────────────────────────────────

def test_ping_healthcheck_skips_when_unset(db_session):
    with patch("backend.notifications.requests.get") as mock_get:
        notifications.ping_healthcheck(db_session, USER, True)
    mock_get.assert_not_called()

def test_ping_healthcheck_pings_bare_url_on_success(db_session):
    crud.update_settings(db_session, USER, schemas.SettingsBase(healthcheck_ping_url="https://hc-ping.com/some-uuid"))
    with patch("backend.notifications.requests.get") as mock_get:
        notifications.ping_healthcheck(db_session, USER, True)
    mock_get.assert_called_once_with("https://hc-ping.com/some-uuid", timeout=10)

def test_ping_healthcheck_appends_fail_suffix_on_failure(db_session):
    crud.update_settings(db_session, USER, schemas.SettingsBase(healthcheck_ping_url="https://hc-ping.com/some-uuid"))
    with patch("backend.notifications.requests.get") as mock_get:
        notifications.ping_healthcheck(db_session, USER, False)
    mock_get.assert_called_once_with("https://hc-ping.com/some-uuid/fail", timeout=10)

def test_ping_healthcheck_does_not_raise_on_network_error(db_session):
    crud.update_settings(db_session, USER, schemas.SettingsBase(healthcheck_ping_url="https://hc-ping.com/some-uuid"))
    with patch("backend.notifications.requests.get", side_effect=ConnectionError("boom")):
        notifications.ping_healthcheck(db_session, USER, True)  # must not raise
