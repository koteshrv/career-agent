import logging
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from .models import ScraperHealth, Settings
import urllib.parse
import urllib.request
import json

logger = logging.getLogger(__name__)

def _send_telegram_notification(token: str, chat_id: str, message: str):
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as response:
            pass
    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")

def update_health(db: Session, company_logs: list):
    """
    Parses the company_logs from a scraper run and updates the scraper_health table.
    Sends Telegram notifications if a provider transitions to BLOCKED or BROKEN.
    """
    settings = db.query(Settings).first()
    telegram_token = settings.telegram_bot_token if settings else None
    telegram_chat_id = settings.telegram_chat_id if settings else None

    for log in company_logs:
        company = log.get("company")
        if not company or company == "Database commit":
            continue
        
        status = log.get("status")
        message = log.get("message", "")
        
        health = db.query(ScraperHealth).filter(ScraperHealth.provider_name == company).first()
        if not health:
            health = ScraperHealth(provider_name=company)
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
                
            health.consecutive_failures += 1
            health.error_message = message
            
            # Send notification if it just started failing, or every 5 consecutive failures
            if previous_status == "OPERATIONAL" or health.consecutive_failures % 5 == 0:
                if telegram_token and telegram_chat_id:
                    alert_msg = f"🚨 *CareerAgent Alert* 🚨\n\nATS Provider *{company}* is currently `{health.status}`.\n\n*Error:* {message}\n*Consecutive Failures:* {health.consecutive_failures}"
                    _send_telegram_notification(telegram_token, telegram_chat_id, alert_msg)
                    
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

