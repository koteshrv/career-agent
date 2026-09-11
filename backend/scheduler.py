import functools
import logging
import json
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .database import SessionLocal
from . import crud, schemas, notifications, crowdsourcing, models, log_context
from .scraper_core import run_scraper

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()
CROWDSOURCE_INTERVAL_MINUTES = 10

# Used by main.py's startup handler for the process-wide log level (tied to the admin's
# own debug_logging_enabled setting, not to any particular request) — unrelated to the
# per-user scheduling below.
ADMIN_USER_ID = 1

class RunLogCaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []
        self.formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')

    def emit(self, record):
        try:
            self.logs.append(self.format(record))
        except Exception:
            pass


def _scheduled_scrape(user_id: int):
    """Run the scraper for one user from a self-managed DB session (no request context)."""
    log_context.set_current_user(user_id)
    db = SessionLocal()

    # A manual run (or a previous cron tick that's still going) can otherwise overlap
    # with this one and hit SQLite write contention / duplicate job commits. Per-user:
    # one user's scrape no longer blocks another's.
    if crud.has_running_scrape(db, user_id):
        logger.warning(f"Skipping scheduled scrape for user {user_id} — a scrape is already RUNNING.")
        db.close()
        return

    log = crud.create_scraper_log(db, user_id, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="CRON"))

    capture_handler = RunLogCaptureHandler()
    capture_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(capture_handler)

    try:
        settings = crud.get_settings(db, user_id)
        # Clean old trash before scraping
        if settings.trash_retention_days > 0:
            deleted_trash = crud.clean_old_trash(db, user_id, settings.trash_retention_days)
            if deleted_trash > 0:
                logger.info(f"Cleaned up {deleted_trash} old trash items for user {user_id}.")

        # Clean old scraper logs (14 days)
        deleted_logs = crud.delete_old_scraper_logs(db, user_id, 14)
        if deleted_logs > 0:
            logger.info(f"Cleaned up {deleted_logs} old scraper logs for user {user_id}.")

        new_jobs, company_logs = run_scraper(db, user_id)

        logger.info(f"Scheduled scrape complete for user {user_id}. Found {len(new_jobs)} new jobs.")
        raw_logs_str = "\n".join(capture_handler.logs)
        crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS", detailed_logs=json.dumps(company_logs), raw_logs=raw_logs_str)
        notifications.notify_broken_targets(db, user_id)
        notifications.ping_healthcheck(db, user_id, True)
    except Exception as e:
        raw_logs_str = "\n".join(capture_handler.logs)
        crud.update_scraper_log(db, log.id, status="FAILED", error_message=str(e), raw_logs=raw_logs_str)
        logger.error(f"Scheduled scrape failed for user {user_id}: {e}")
        notifications.notify_scrape_run_failed(db, user_id, str(e), "CRON")
        notifications.ping_healthcheck(db, user_id, False)
    finally:
        logging.getLogger().removeHandler(capture_handler)
        db.close()

def _scheduled_crowdsource_push(user_id: int):
    """Runs on its own DB session (no request context), like _scheduled_scrape. Errors are
    logged, never raised — a crowdsourcing hiccup must not affect anything else running on
    this scheduler."""
    log_context.set_current_user(user_id)
    db = SessionLocal()
    try:
        result = crowdsourcing.push_jobs(db, user_id)
        if not result.get("success") and not result.get("skipped"):
            logger.warning(f"[Crowdsource] Scheduled push failed for user {user_id}: {result.get('reason')}")
    except Exception as e:
        logger.error(f"[Crowdsource] Scheduled push crashed for user {user_id}: {e}")
    finally:
        db.close()


def _scheduled_crowdsource_pull(user_id: int):
    log_context.set_current_user(user_id)
    db = SessionLocal()
    try:
        result = crowdsourcing.pull_jobs(db, user_id)
        if not result.get("success") and not result.get("skipped"):
            logger.warning(f"[Crowdsource] Scheduled pull failed for user {user_id}: {result.get('reason')}")
    except Exception as e:
        logger.error(f"[Crowdsource] Scheduled pull crashed for user {user_id}: {e}")
    finally:
        db.close()


def reschedule(cron_expr: str, user_id: int) -> bool:
    """(Re)install this user's scrape cron job. Returns False if the expression is invalid."""
    if not cron_expr:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron_expr)
    except Exception as e:
        logger.error(f"Invalid cron expression '{cron_expr}' for user {user_id}: {e}")
        return False
    scheduler.add_job(functools.partial(_scheduled_scrape, user_id), trigger,
                       id=f"scheduled_scrape_{user_id}", name=f"scheduled_scrape_{user_id}", replace_existing=True)
    logger.info(f"Scheduled scraper for user {user_id} with cron '{cron_expr}'.")
    return True

def activate_user(user_id: int, cron_expr: str) -> None:
    """Installs the scrape cron + crowdsource push/pull jobs for one active user. Called
    both at server startup (for every already-approved user) and immediately when the
    admin approves a new one, so approval takes effect without a restart. Fixed
    CROWDSOURCE_INTERVAL_MINUTES, not user-configurable — both push/pull no-op immediately
    if this user has no crowdsourcing account connected (crowdsourcing._get_cloud_token
    returns None)."""
    reschedule(cron_expr, user_id)
    scheduler.add_job(
        functools.partial(_scheduled_crowdsource_push, user_id), IntervalTrigger(minutes=CROWDSOURCE_INTERVAL_MINUTES),
        id=f"crowdsource_push_{user_id}", name=f"crowdsource_push_{user_id}", replace_existing=True,
    )
    scheduler.add_job(
        functools.partial(_scheduled_crowdsource_pull, user_id), IntervalTrigger(minutes=CROWDSOURCE_INTERVAL_MINUTES),
        id=f"crowdsource_pull_{user_id}", name=f"crowdsource_pull_{user_id}", replace_existing=True,
    )

def start():
    """Start the scheduler and install jobs for every already-approved user."""
    if not scheduler.running:
        scheduler.start()
    db = SessionLocal()
    try:
        active_users = db.query(models.User).filter(models.User.status == "ACTIVE").all()
        for user in active_users:
            settings = crud.get_settings(db, user.id)
            activate_user(user.id, settings.cron_schedule or "0 */12 * * *")
        logger.info(
            f"Scheduled scrape + crowdsource push/pull for {len(active_users)} active user(s) "
            f"(crowdsourcing every {CROWDSOURCE_INTERVAL_MINUTES} min)."
        )
    finally:
        db.close()
