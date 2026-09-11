"""Telegram push alerts + healthchecks.io dead-man's-switch ping for scrape-run outcomes.

Settings already has telegram_bot_token/telegram_chat_id (encrypted at rest) and a
telegram_alerts_enabled toggle, but nothing previously called the Telegram Bot API —
this module is that missing piece.

A notification failure must never break the scrape run it's reporting on, so every
public function here catches its own exceptions and returns/logs rather than raising.
"""
import logging
import requests
from sqlalchemy.orm import Session

from . import crud

logger = logging.getLogger(__name__)

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"

# Telegram's legacy Markdown parser rejects the whole message (HTTP 400 "can't parse
# entities") on an unbalanced _ * ` or [. Scraper errors routinely contain all of these —
# selectors, file paths, config keys like no_results_text — so any interpolated dynamic
# value MUST go through escape_md(), or the alert silently never arrives.
_MARKDOWN_SPECIALS = ("_", "*", "`", "[")


def escape_md(text: str) -> str:
    """Escape Telegram legacy-Markdown control characters in dynamic content."""
    if not text:
        return ""
    for ch in _MARKDOWN_SPECIALS:
        text = text.replace(ch, "\\" + ch)
    return text

# How many consecutive FAILED runs a target needs before we alert on it. Kept as a code
# constant rather than a Settings column since there's nothing for the user to tune here.
TARGET_FAILURE_ALERT_THRESHOLD = 3


def send_telegram_message(db: Session, user_id: int, text: str) -> bool:
    """Send a message via the user's configured Telegram bot.
    Returns False (not an exception) if alerts are disabled, unconfigured, or the send fails."""
    try:
        settings = crud.get_settings(db, user_id)
    except Exception as e:
        logger.error(f"[Telegram] Failed to load settings: {e}")
        return False

    if not settings or not settings.telegram_alerts_enabled:
        return False

    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        return False

    url = TELEGRAM_API_URL.format(token=token)
    try:
        resp = requests.post(
            url,
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
        if resp.status_code == 200:
            return True

        # A 400 here is almost always a Markdown parse failure on interpolated content.
        # Delivering the alert as plain text beats dropping it, so retry unformatted.
        if resp.status_code == 400:
            logger.warning(f"[Telegram] Markdown rejected ({resp.text[:200]}); retrying as plain text.")
            retry = requests.post(url, json={"chat_id": chat_id, "text": text}, timeout=10)
            if retry.status_code == 200:
                return True
            logger.warning(f"[Telegram] Plain-text retry failed ({retry.status_code}): {retry.text[:200]}")
            return False

        logger.warning(f"[Telegram] Send failed ({resp.status_code}): {resp.text[:200]}")
        return False
    except Exception as e:
        logger.warning(f"[Telegram] Send failed: {e}")
        return False


def notify_scrape_run_failed(db: Session, user_id: int, error_message: str, trigger_source: str) -> None:
    """Alert on a full scrape-run crash (an exception that escaped run_scraper entirely) —
    the "cron silently died" failure mode, which per-target health can't detect."""
    text = (
        f"🚨 *CareerAgent — Scrape Run Failed* ({escape_md(trigger_source)})\n\n"
        f"`{escape_md(error_message[:500])}`"
    )
    send_telegram_message(db, user_id, text)


def notify_broken_targets(db: Session, user_id: int) -> None:
    """Alert once per break-streak when a target either:
      - crosses TARGET_FAILURE_ALERT_THRESHOLD consecutive explicit failures, or
      - crosses ZERO_STREAK_ALERT_THRESHOLD consecutive SUCCESS-but-0-jobs runs after a
        healthy history (crud.get_target_health's possibly_silent_failure signal) — the
        failure mode that never raises an exception, so the first check alone can't see it.

    Must be called AFTER the current run's ScraperLog.detailed_logs has been persisted —
    get_target_health reads from the DB, so calling this before that write would evaluate
    on stale, one-run-old data.
    """
    try:
        health = crud.get_target_health(db, user_id, run_limit=20)
    except Exception as e:
        logger.error(f"[Telegram] Failed to compute target health for alerting: {e}")
        return

    failed = [h for h in health if h["consecutive_failures"] == TARGET_FAILURE_ALERT_THRESHOLD]
    silently_broken = [
        h for h in health
        if h["possibly_silent_failure"] and h["zero_streak"] == crud.ZERO_STREAK_ALERT_THRESHOLD
    ]
    if not failed and not silently_broken:
        return

    lines = [
        f"• *{escape_md(h['company'])}*: {h['consecutive_failures']} runs failed in a row"
        + (f"\n  _{escape_md(h['last_message'][:150])}_" if h.get("last_message") else "")
        for h in failed
    ]
    lines += [
        f"• *{escape_md(h['company'])}*: {h['zero_streak']} runs in a row found 0 jobs "
        f"(normally averages {h['historical_avg_jobs_found']}) — likely a broken selector, not a real dry spell"
        for h in silently_broken
    ]
    text = "⚠️ *CareerAgent — Target Health Alert*\n\n" + "\n".join(lines)
    send_telegram_message(db, user_id, text)


def ping_healthcheck(db: Session, user_id: int, success: bool) -> None:
    """Ping a healthchecks.io-compatible dead-man's-switch after a *scheduled* scrape run.

    This exists for a failure mode nothing else here can catch: if the scheduler itself
    dies (process crash, APScheduler silently stops), no Python code runs at all — there's
    no run to log, no exception to alert on. Healthchecks.io instead notices the ping
    stopped arriving on schedule and alerts from the outside.

    Deliberately not called from the manual "Run Scraper" trigger — the point is to verify
    the *automated* schedule specifically; a manual run resetting the timer would mask a
    dead cron job.
    """
    try:
        ping_url = crud.get_settings(db, user_id).healthcheck_ping_url
    except Exception as e:
        logger.error(f"[Healthcheck] Failed to load settings: {e}")
        return
    if not ping_url:
        return
    url = ping_url if success else f"{ping_url.rstrip('/')}/fail"
    try:
        requests.get(url, timeout=10)
    except Exception as e:
        logger.warning(f"[Healthcheck] Ping failed: {e}")
