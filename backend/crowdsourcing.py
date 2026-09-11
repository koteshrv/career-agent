"""Sync with career-agent-api, the "Give-to-Get" crowdsourcing credit economy (a sibling
project — a Cloudflare Worker, not part of this backend). Two directions:

  - push: upload locally scraped jobs the API hasn't seen yet, earning credits.
  - pull: consume jobs other users have pushed, spending credits.

Auth is a career-agent-api-issued JWT (Settings.career_agent_cloud_token, Fernet-encrypted
at rest), obtained via the frontend's Google/GitHub SSO connect flow and stored here through
a PUT /api/settings call — see CLAUDE.md's "two separate trust boundaries" note. This token
is scoped ONLY to career-agent-api; it must never be treated as local-dashboard auth.

The token is a snapshot from whenever the user last connected and expires after 7 days
(career-agent-api's `expires_in: 604800`). There is no automatic refresh — that requires an
interactive SSO round-trip in the browser — so push/pull will start failing with 401 a week
after connecting until the user reconnects from the Login page.
"""
import logging

import requests
from sqlalchemy.orm import Session

from . import crud, models
from .config import config
from .sources.common import record_job
from .scraper_core import bulk_evaluate_jobs
from .tasks import task_manager

logger = logging.getLogger(__name__)

CROWDSOURCE_API_URL = config["crowdsource_api_url"] or "https://career-agent-api.kotesh-rv.workers.dev"

# career-agent-api caps a single push request at 1000 jobs (openapi.yaml).
PUSH_BATCH_LIMIT = 1000

REQUEST_TIMEOUT_SECONDS = 30


def _get_cloud_token(db: Session, user_id: int) -> str:
    settings = crud.get_settings(db, user_id)
    if settings and getattr(settings, 'crowdsourcing_enabled', True):
        return settings.career_agent_cloud_token
    return None


def _not_connected() -> dict:
    return {"success": False, "skipped": True, "reason": "Not connected — sign in with Google or GitHub on the Login page first."}


def _auth_error(resp: requests.Response) -> dict:
    return {
        "success": False,
        "skipped": False,
        "status_code": resp.status_code,
        "reason": "Crowdsourcing session expired or invalid — reconnect on the Login page." if resp.status_code == 401
        else f"career-agent-api returned {resp.status_code}: {resp.text[:200]}",
    }


def push_jobs(db: Session, user_id: int) -> dict:
    """Push jobs never previously pushed."""
    task_id = task_manager.start_task("Crowdsource Push", "Uploading local jobs...", user_id)
    token = _get_cloud_token(db, user_id)
    if not token:
        task_manager.complete_task(task_id, success=False, error="Not connected")
        return _not_connected()

    unpushed = crud.get_unpushed_jobs(db, user_id, limit=PUSH_BATCH_LIMIT)
    if not unpushed:
        task_manager.update_task(task_id, description="Nothing new to push.")
        task_manager.complete_task(task_id, success=True)
        return {"success": True, "skipped": False, "jobs_sent": 0, "message": "Nothing new to push."}

    payload = {
        "jobs": [
            {"company": j.company, "title": j.title, "location": j.location or "", "url": j.url}
            for j in unpushed
        ]
    }

    try:
        resp = requests.post(
            f"{CROWDSOURCE_API_URL}/v1/jobs/push",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except Exception as e:
        logger.warning(f"[Crowdsource] Push request failed: {e}")
        task_manager.complete_task(task_id, success=False, error=str(e))
        return {"success": False, "skipped": False, "reason": str(e)}

    if resp.status_code != 200:
        logger.warning(f"[Crowdsource] Push rejected ({resp.status_code}): {resp.text[:200]}")
        task_manager.complete_task(task_id, success=False, error="Auth Error")
        return _auth_error(resp)

    data = resp.json()
    crud.mark_jobs_crowdsource_pushed(db, user_id, [j.id for j in unpushed])
    logger.info(f"[Crowdsource] Pushed {len(unpushed)} jobs — {data.get('credits_earned', 0)} credits earned.")
    task_manager.update_task(task_id, description=f"Pushed {len(unpushed)} jobs, earned {data.get('credits_earned', 0)} credits.")
    task_manager.complete_task(task_id, success=True)
    return {"success": True, "skipped": False, "jobs_sent": len(unpushed), **data}


def pull_jobs(db: Session, user_id: int, limit: int = 100) -> dict:
    """Pull jobs from the shared pool."""
    task_id = task_manager.start_task("Crowdsource Pull", "Pulling shared jobs...", user_id)
    token = _get_cloud_token(db, user_id)
    if not token:
        task_manager.complete_task(task_id, success=False, error="Not connected")
        return _not_connected()

    try:
        resp = requests.get(
            f"{CROWDSOURCE_API_URL}/v1/jobs/pull",
            params={"limit": limit},
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except Exception as e:
        logger.warning(f"[Crowdsource] Pull request failed: {e}")
        task_manager.complete_task(task_id, success=False, error=str(e))
        return {"success": False, "skipped": False, "reason": str(e)}

    if resp.status_code != 200:
        logger.warning(f"[Crowdsource] Pull rejected ({resp.status_code}): {resp.text[:200]}")
        task_manager.complete_task(task_id, success=False, error="Auth Error")
        return _auth_error(resp)

    data = resp.json()
    pulled = [j for j in data.get("jobs", []) if j.get("company") and j.get("title") and j.get("url")]
    pulled_urls = [j["url"] for j in pulled]

    # record_job dedupes by URL but returns the existing row either way (so scrapers can
    # revive a REJECTED/TRASH'd job), so "how many are actually new" has to be determined
    # before inserting, not from record_job's return value.
    already_known = {
        row[0] for row in db.query(models.Job.url).filter(
            models.Job.user_id == user_id, models.Job.url.in_(pulled_urls)
        ).all()
    }

    newly_added_jobs = []
    for job in pulled:
        db_job = record_job(db, user_id, job["company"], job["title"], job["url"], job.get("location") or "")
        if job.get("id"):
            db_job.external_id = job["id"]
        if job["url"] not in already_known:
            newly_added_jobs.append(job)

    db.commit()
    jobs_added = len(newly_added_jobs)
    logger.info(f"[Crowdsource] Pulled {len(pulled)} jobs from the shared pool ({jobs_added} new).")

    if newly_added_jobs:
        logger.info(f"[Crowdsource] Passing {jobs_added} new jobs to AI for evaluation...")
        bulk_evaluate_jobs(db, user_id, newly_added_jobs)
    task_manager.update_task(task_id, description=f"Pulled {jobs_added} new jobs ({len(pulled)} checked).")
    task_manager.complete_task(task_id, success=True)
    return {
        "success": True, "skipped": False,
        "jobs_received": len(pulled), "jobs_added": jobs_added,
        **{k: v for k, v in data.items() if k != "jobs"},
    }

def verify_cloud_identity(token: str) -> str | None:
    """Confirms a career-agent-api JWT is genuine — by asking career-agent-api itself to
    validate it, never by decoding it client/server-side without checking the signature —
    and returns the verified email, or None. This gates real local-dashboard sessions (see
    routers/users.py's /api/auth/sso), unlike the display-only decode in Login.tsx, so it
    must not be skipped or replaced with an unverified decode."""
    try:
        resp = requests.get(
            f"{CROWDSOURCE_API_URL}/v1/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except Exception as e:
        logger.warning(f"[Crowdsource] Identity verification failed: {e}")
        return None
    if resp.status_code != 200:
        logger.warning(f"[Crowdsource] Identity verification rejected ({resp.status_code}): {resp.text[:200]}")
        return None
    # career-agent-api's /v1/me response uses "cloud_email" (confirmed by the frontend's
    # own demo-mode mock for this same endpoint, get_account_info() passes it through
    # unmodified) — "email" kept as a fallback in case that ever changes upstream.
    data = resp.json()
    return data.get("cloud_email") or data.get("email") or None


def get_account_info(db: Session, user_id: int) -> dict:
    token = _get_cloud_token(db, user_id)
    if not token:
        return _not_connected()

    try:
        resp = requests.get(
            f"{CROWDSOURCE_API_URL}/v1/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except Exception as e:
        return {"success": False, "skipped": False, "reason": str(e)}

    if resp.status_code != 200:
        return _auth_error(resp)

    data = resp.json()
    return {"success": True, "skipped": False, **data}


def report_job(db: Session, user_id: int, job_id: str, reason: str) -> dict:
    token = _get_cloud_token(db, user_id)
    if not token:
        return _not_connected()

    try:
        resp = requests.post(
            f"{CROWDSOURCE_API_URL}/v1/jobs/report",
            json={"job_id": job_id, "reason": reason},
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except Exception as e:
        return {"success": False, "skipped": False, "reason": str(e)}

    if resp.status_code != 200:
        return _auth_error(resp)

    data = resp.json()
    return {"success": True, "skipped": False, **data}
