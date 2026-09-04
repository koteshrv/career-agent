import logging
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from .models import ScraperHealth
from .notifications import send_telegram_message, escape_md

logger = logging.getLogger(__name__)

def update_health(db: Session, company_logs: list):
    """
    Parses the company_logs from a scraper run and updates the scraper_health table.
    Sends Telegram notifications if a provider transitions to BLOCKED or BROKEN.

    Alerts go through notifications.send_telegram_message so they get the decrypted bot
    token (Settings.telegram_bot_token is Fernet-encrypted at rest) and honour the
    telegram_alerts_enabled toggle. Reading the model column directly here would send the
    ciphertext as the bot token and every alert would 404.
    """
    for log in company_logs:
        company = log.get("company")
        if not company or company == "Database commit":
            continue

        status = log.get("status")
        message = log.get("message", "")

        # A target skipped by the BLOCKED cooldown never ran, so it must not touch health
        # state. Recording it would refresh last_run_at (restarting the 24h window on a
        # non-run), inflate consecutive_failures, and — since "BLOCKED (Cooldown active)"
        # matches none of the BLOCKED keywords below — flip the status to BROKEN, which
        # makes is_provider_blocked() stop matching and ends the cooldown after one cycle.
        if status == "SKIPPED":
            continue

        health = db.query(ScraperHealth).filter(ScraperHealth.provider_name == company).first()
        if not health:
            # Column defaults are applied at INSERT, so a not-yet-flushed row reads back None
            # for every unset field. Without these explicit values the first failure a
            # provider ever records raises TypeError on `consecutive_failures += 1` (aborting
            # health updates for every remaining company in the run), and previous_status
            # would be None rather than "OPERATIONAL", suppressing the first-failure alert.
            health = ScraperHealth(provider_name=company, status="OPERATIONAL", consecutive_failures=0)
            db.add(health)

        previous_status = health.status
        health.last_run_at = datetime.now(timezone.utc)
        
        if status == "SUCCESS":
            health.status = "OPERATIONAL"
            health.last_success_at = datetime.now(timezone.utc)
            health.consecutive_failures = 0
            health.error_message = None
        else:
            # It's a failure. Determine if it's BLOCKED or BROKEN.
            msg_lower = message.lower() if message else ""
            if "timeout" in msg_lower or "403" in msg_lower or "captcha" in msg_lower or "cloudflare" in msg_lower or "access denied" in msg_lower:
                health.status = "BLOCKED"
            else:
                health.status = "BROKEN"
                
            # `or 0` also repairs any pre-existing row that was persisted with a NULL count.
            health.consecutive_failures = (health.consecutive_failures or 0) + 1
            health.error_message = message
            
            # Send notification if it just started failing, or every 5 consecutive failures
            if previous_status == "OPERATIONAL" or health.consecutive_failures % 5 == 0:
                alert_msg = (
                    f"🚨 *CareerAgent Alert* 🚨\n\n"
                    f"ATS Provider *{escape_md(company)}* is currently `{health.status}`.\n\n"
                    f"*Error:* {escape_md(message)}\n"
                    f"*Consecutive Failures:* {health.consecutive_failures}"
                )
                send_telegram_message(db, alert_msg)
                    
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to commit health updates: {e}")
        db.rollback()

def is_provider_blocked(db: Session, provider_name: str) -> bool:
    """
    Checks if a provider is in a BLOCKED state and needs a 24-hour cooldown.
    """
    health = db.query(ScraperHealth).filter(ScraperHealth.provider_name == provider_name).first()
    if not health:
        return False
        
    if health.status == "BLOCKED" and health.last_run_at:
        # Check if 24 hours have passed
        # make sure it is offset-aware
        now = datetime.now(timezone.utc)
        last_run = health.last_run_at
        if last_run.tzinfo is None:
             last_run = last_run.replace(tzinfo=timezone.utc)
             
        if now - last_run < timedelta(hours=24):
            return True
            
    return False
