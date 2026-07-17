import json
from sqlalchemy.orm import Session
from . import models, schemas
from .crypto import encrypt_value, decrypt_value
from datetime import datetime, timedelta, timezone

def get_jobs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Job).filter(models.Job.status != 'FALSE_POSITIVE').order_by(models.Job.created_at.desc()).offset(skip).limit(limit).all()

def get_job(db: Session, job_id: int):
    return db.query(models.Job).filter(models.Job.id == job_id).first()

def create_job(db: Session, job: schemas.JobCreate):
    # Check if exists
    db_job = db.query(models.Job).filter(models.Job.url == job.url).first()
    if db_job:
        return db_job
    db_job = models.Job(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def update_job_status(db: Session, job_id: int, job_update: schemas.JobUpdate):
    db_job = get_job(db, job_id)
    if db_job:
        update_data = job_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_job, key, value)
        db.commit()
        db.refresh(db_job)
    return db_job

def delete_job(db: Session, job_id: int) -> bool:
    db_job = get_job(db, job_id)
    if db_job:
        db.delete(db_job)
        db.commit()
        return True
    return False

def delete_all_jobs(db: Session) -> int:
    count = db.query(models.Job).delete()
    db.commit()
    return count

def empty_trash(db: Session) -> int:
    count = db.query(models.Job).filter(models.Job.status == "TRASH").delete(synchronize_session=False)
    db.commit()
    return count

def clean_old_trash(db: Session, retention_days: int) -> int:
    from datetime import datetime, timedelta
    from sqlalchemy import func
    
    cutoff = datetime.now() - timedelta(days=retention_days)
    count = db.query(models.Job).filter(
        models.Job.status == "TRASH",
        # Fallback to created_at if updated_at is null (for older items)
        func.coalesce(models.Job.updated_at, models.Job.created_at) < cutoff
    ).delete(synchronize_session=False)
    db.commit()
    return count

def bulk_update_status(db: Session, ids: list, status: str) -> int:
    count = db.query(models.Job).filter(models.Job.id.in_(ids)).update(
        {models.Job.status: status}, synchronize_session=False)
    db.commit()
    return count

def bulk_delete_jobs(db: Session, ids: list) -> int:
    count = db.query(models.Job).filter(models.Job.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return count

# Settings fields stored encrypted at rest (Fernet). Decrypted on read, encrypted on write.
ENCRYPTED_FIELDS = {
    "telegram_bot_token", "gemini_api_key",
    "openai_api_key", "anthropic_api_key", "grok_api_key",
}

def get_settings(db: Session):
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)

    decrypted = schemas.Settings.model_validate(settings)
    for field in ENCRYPTED_FIELDS:
        value = getattr(decrypted, field, None)
        if value:
            setattr(decrypted, field, decrypt_value(value))
    return decrypted

def update_settings(db: Session, settings: schemas.SettingsBase):
    db_settings = db.query(models.Settings).first()
    if not db_settings:
        db_settings = models.Settings()
        db.add(db_settings)

    # Only touch fields the client actually sent, so a partial update (e.g. saving
    # just the company selection) doesn't reset other settings to their defaults.
    provided = settings.model_dump(exclude_unset=True)
    for key, value in provided.items():
        if value is None:
            continue
        if key in ENCRYPTED_FIELDS:
            value = encrypt_value(value)
        setattr(db_settings, key, value)

    db.commit()
    db.refresh(db_settings)
    return get_settings(db)

def has_running_scrape(db: Session) -> bool:
    """True if a scraper run is already in flight (cron and manual can otherwise overlap)."""
    return db.query(models.ScraperLog).filter(models.ScraperLog.status == "RUNNING").first() is not None

def get_scraper_logs(db: Session, limit: int = 50):
    return db.query(models.ScraperLog).order_by(models.ScraperLog.timestamp.desc()).limit(limit).all()

def create_scraper_log(db: Session, log: schemas.ScraperLogBase):
    db_log = models.ScraperLog(**log.model_dump())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def fail_orphaned_running_logs(db: Session) -> int:
    """Mark any lingering RUNNING logs as FAILED. A RUNNING log at startup means a
    previous process died mid-scrape, so it would otherwise hang forever."""
    orphans = db.query(models.ScraperLog).filter(models.ScraperLog.status == "RUNNING").all()
    for log in orphans:
        log.status = "FAILED"
        log.error_message = "Interrupted — the server restarted while this run was in progress."
    if orphans:
        db.commit()
    return len(orphans)

def update_scraper_log(db: Session, log_id: int, status: str = None, jobs_found: int = None, error_message: str = None, detailed_logs: str = None, raw_logs: str = None) -> models.ScraperLog:
    log = db.query(models.ScraperLog).filter(models.ScraperLog.id == log_id).first()
    if log:
        if status is not None:
            log.status = status
        if jobs_found is not None:
            log.jobs_found = jobs_found
        if error_message is not None:
            log.error_message = error_message
        if detailed_logs is not None:
            log.detailed_logs = detailed_logs
        if raw_logs is not None:
            log.raw_logs = raw_logs
        db.commit()
        db.refresh(log)
    return log

def delete_old_scraper_logs(db: Session, days: int = 14) -> int:
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    old_logs = db.query(models.ScraperLog).filter(models.ScraperLog.timestamp < cutoff_date).all()
    count = len(old_logs)
    if count > 0:
        for log in old_logs:
            db.delete(log)
        db.commit()
    return count

def delete_all_scraper_logs(db: Session) -> int:
    count = db.query(models.ScraperLog).delete()
    db.commit()
    return count

# A company needs this many consecutive SUCCESS-but-0-jobs runs, with a healthy history
# behind them, before we flag it as a likely *silent* failure (broken selector/schema
# drift) rather than a real dry spell. Exceptions already surface as consecutive_failures;
# this catches the failure mode that never throws at all — it just quietly returns nothing.
ZERO_STREAK_ALERT_THRESHOLD = 3

def get_target_health(db: Session, run_limit: int = 20) -> list:
    """Aggregate per-company scrape health across the most recent `run_limit` runs.

    With 40+ scraped targets, a site's markup silently breaking usually doesn't raise an
    exception at all — it just returns 0 jobs, which looks identical to "no openings today"
    everywhere downstream. This surfaces both failure modes: explicit FAILED streaks, and
    a run of SUCCESS-but-0-jobs for a company that normally finds some.
    """
    logs = (
        db.query(models.ScraperLog)
        .filter(models.ScraperLog.detailed_logs.isnot(None))
        .order_by(models.ScraperLog.timestamp.desc())
        .limit(run_limit)
        .all()
    )

    # company -> list of {timestamp, status, message, jobs_found}, newest run first
    history: dict = {}
    for log in logs:
        try:
            entries = json.loads(log.detailed_logs)
        except Exception:
            continue
        if not isinstance(entries, list):
            continue
        for entry in entries:
            company = entry.get("company")
            if not company:
                continue
            history.setdefault(company, []).append({
                "timestamp": log.timestamp,
                "status": entry.get("status"),
                "message": entry.get("message") or "",
                "jobs_found": entry.get("jobs_found") or 0,
            })

    results = []
    for company, runs in history.items():
        consecutive_failures = 0
        for run in runs:  # already newest-first
            if run["status"] == "FAILED":
                consecutive_failures += 1
            else:
                break

        successes = sum(1 for r in runs if r["status"] == "SUCCESS")
        last_success_at = next((r["timestamp"] for r in runs if r["status"] == "SUCCESS"), None)

        # Recent consecutive SUCCESS runs that found exactly 0 jobs.
        zero_streak = 0
        for run in runs:
            if run["status"] == "SUCCESS" and run["jobs_found"] == 0:
                zero_streak += 1
            else:
                break

        # Average jobs_found on the older SUCCESS runs, i.e. excluding the current zero
        # streak — this is "what did this company look like before it (maybe) broke".
        older_successes = [r["jobs_found"] for r in runs[zero_streak:] if r["status"] == "SUCCESS"]
        historical_avg_jobs_found = round(sum(older_successes) / len(older_successes), 1) if older_successes else 0.0

        possibly_silent_failure = (
            zero_streak >= ZERO_STREAK_ALERT_THRESHOLD and historical_avg_jobs_found >= 1
        )

        results.append({
            "company": company,
            "last_status": runs[0]["status"],
            "last_message": runs[0]["message"],
            "runs_seen": len(runs),
            "consecutive_failures": consecutive_failures,
            "success_rate": round(successes / len(runs), 2),
            "last_success_at": last_success_at,
            "zero_streak": zero_streak,
            "historical_avg_jobs_found": historical_avg_jobs_found,
            "possibly_silent_failure": possibly_silent_failure,
        })

    # Worst offenders first: explicit failure streaks, then possible silent failures,
    # then lowest success rate.
    results.sort(key=lambda r: (-r["consecutive_failures"], not r["possibly_silent_failure"], r["success_rate"]))
    return results
