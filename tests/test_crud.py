import json
from datetime import datetime, timedelta, timezone

from backend import crud, models, schemas


def test_has_running_scrape_false_when_none_running(db_session):
    assert crud.has_running_scrape(db_session) is False

def test_has_running_scrape_true_when_one_is_running(db_session):
    crud.create_scraper_log(db_session, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
    assert crud.has_running_scrape(db_session) is True

def test_has_running_scrape_false_once_completed(db_session):
    log = crud.create_scraper_log(db_session, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
    crud.update_scraper_log(db_session, log.id, status="SUCCESS")
    assert crud.has_running_scrape(db_session) is False

def test_fail_orphaned_running_logs(db_session):
    crud.create_scraper_log(db_session, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="CRON"))
    n = crud.fail_orphaned_running_logs(db_session)
    assert n == 1
    assert crud.has_running_scrape(db_session) is False


# ── Settings secrets are encrypted at rest, decrypted on read ──────────────

def test_settings_secret_fields_are_encrypted_at_rest_and_decrypt_on_read(db_session):
    crud.update_settings(db_session, schemas.SettingsBase(
        gemini_api_key="gem-secret-123",
        openai_api_key="openai-secret-456",
        anthropic_api_key="anthropic-secret-789",
        grok_api_key="grok-secret-000",
    ))

    raw = db_session.query(models.Settings).first()
    for field in ("gemini_api_key", "openai_api_key", "anthropic_api_key", "grok_api_key"):
        assert getattr(raw, field).startswith("gAAAAA"), f"{field} was not stored encrypted"

    decrypted = crud.get_settings(db_session)
    assert decrypted.gemini_api_key == "gem-secret-123"
    assert decrypted.openai_api_key == "openai-secret-456"
    assert decrypted.anthropic_api_key == "anthropic-secret-789"
    assert decrypted.grok_api_key == "grok-secret-000"

def test_update_settings_only_touches_provided_fields(db_session):
    crud.update_settings(db_session, schemas.SettingsBase(min_match_score=70))
    crud.update_settings(db_session, schemas.SettingsBase(trash_retention_days=10))

    settings = crud.get_settings(db_session)
    assert settings.min_match_score == 70
    assert settings.trash_retention_days == 10


# ── get_target_health ───────────────────────────────────────────────────────

def _make_scraper_log(db, days_ago, detailed_logs):
    log = models.ScraperLog(
        timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago),
        jobs_found=0,
        status="SUCCESS",
        trigger_source="CRON",
        detailed_logs=json.dumps(detailed_logs),
    )
    db.add(log)
    db.commit()
    return log

def test_get_target_health_counts_consecutive_failures(db_session):
    # Oldest to newest: Acme succeeds once, then fails three times in a row.
    _make_scraper_log(db_session, 4, [{"company": "Acme", "status": "SUCCESS", "jobs_found": 3}])
    _make_scraper_log(db_session, 3, [{"company": "Acme", "status": "FAILED", "message": "timeout"}])
    _make_scraper_log(db_session, 2, [{"company": "Acme", "status": "FAILED", "message": "timeout"}])
    _make_scraper_log(db_session, 1, [{"company": "Acme", "status": "FAILED", "message": "selector not found"}])

    health = crud.get_target_health(db_session, run_limit=20)
    assert len(health) == 1
    acme = health[0]
    assert acme["company"] == "Acme"
    assert acme["last_status"] == "FAILED"
    assert acme["last_message"] == "selector not found"
    assert acme["consecutive_failures"] == 3
    assert acme["runs_seen"] == 4
    assert acme["success_rate"] == 0.25

def test_get_target_health_resets_streak_on_success(db_session):
    _make_scraper_log(db_session, 2, [{"company": "Beta", "status": "FAILED"}])
    _make_scraper_log(db_session, 1, [{"company": "Beta", "status": "SUCCESS"}])

    health = crud.get_target_health(db_session)
    beta = next(h for h in health if h["company"] == "Beta")
    assert beta["consecutive_failures"] == 0
    assert beta["last_status"] == "SUCCESS"

def test_get_target_health_sorts_worst_offenders_first(db_session):
    _make_scraper_log(db_session, 1, [
        {"company": "Healthy", "status": "SUCCESS"},
        {"company": "Broken", "status": "FAILED", "message": "down"},
    ])
    health = crud.get_target_health(db_session)
    assert [h["company"] for h in health] == ["Broken", "Healthy"]

def test_get_target_health_ignores_logs_without_detailed_logs(db_session):
    log = models.ScraperLog(timestamp=datetime.now(timezone.utc), jobs_found=0, status="FAILED", trigger_source="MANUAL")
    db_session.add(log)
    db_session.commit()
    assert crud.get_target_health(db_session) == []


# ── get_target_health: silent failures (SUCCESS status, suspiciously 0 jobs) ───

def test_get_target_health_flags_silent_failure_after_healthy_history(db_session):
    # A company that reliably found ~10 jobs, then quietly started returning 0 — no
    # exception anywhere, status stays SUCCESS throughout. This is the failure mode
    # consecutive_failures can never catch.
    for days_ago in (6, 5, 4):
        _make_scraper_log(db_session, days_ago, [{"company": "Wells Fargo", "status": "SUCCESS", "jobs_found": 10}])
    for days_ago in (3, 2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "Wells Fargo", "status": "SUCCESS", "jobs_found": 0}])

    health = crud.get_target_health(db_session)
    wf = next(h for h in health if h["company"] == "Wells Fargo")
    assert wf["consecutive_failures"] == 0  # never actually failed
    assert wf["zero_streak"] == 3
    assert wf["historical_avg_jobs_found"] == 10.0
    assert wf["possibly_silent_failure"] is True

def test_get_target_health_does_not_flag_a_company_with_no_healthy_history(db_session):
    # Always 0 jobs, no prior positive baseline — could just be a company that
    # rarely posts roles. Shouldn't be flagged as "silently broken".
    for days_ago in (3, 2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "SmallCo", "status": "SUCCESS", "jobs_found": 0}])

    health = crud.get_target_health(db_session)
    small = next(h for h in health if h["company"] == "SmallCo")
    assert small["zero_streak"] == 3
    assert small["historical_avg_jobs_found"] == 0.0
    assert small["possibly_silent_failure"] is False

def test_get_target_health_does_not_flag_below_zero_streak_threshold(db_session):
    for days_ago in (5, 4, 3):
        _make_scraper_log(db_session, days_ago, [{"company": "Acme", "status": "SUCCESS", "jobs_found": 8}])
    # Only 2 zero-runs — below ZERO_STREAK_ALERT_THRESHOLD (3).
    for days_ago in (2, 1):
        _make_scraper_log(db_session, days_ago, [{"company": "Acme", "status": "SUCCESS", "jobs_found": 0}])

    health = crud.get_target_health(db_session)
    acme = next(h for h in health if h["company"] == "Acme")
    assert acme["zero_streak"] == 2
    assert acme["possibly_silent_failure"] is False
