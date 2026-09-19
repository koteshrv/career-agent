"""Shared helpers used across every scraper source: link filtering against
already-scraped jobs, dedup against the DB, and the target/keyword config
loaders. Candidate-link validation and job-sniffing heuristics
(is_valid_candidate / _extract_jobs_from_text — filtering raw scraped ATS
content) now live in backend/universal/providers/_generic-extract.mjs; there
is no Python HTTP/HTML-parsing path left here."""
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

from sqlalchemy.orm import Session

from backend.database import models

logger = logging.getLogger(__name__)


def load_locations(db: Session, user_id: int) -> List[str]:
    default_locs = ["remote"]
    if db is not None:
        from backend.database import models
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.location_prefs:
            try:
                import json
                prefs = json.loads(user.location_prefs)
                inc = prefs.get("include", "")
                only = prefs.get("only", "")
                # We can construct a list of allowed locs
                combined = []
                if inc: combined.extend([x.strip().lower() for x in inc.split(",")])
                if only: combined.extend([x.strip().lower() for x in only.split(",")])
                if combined:
                    return combined
            except Exception:
                pass
    return default_locs


DEFAULT_KEYWORDS = ["software", "engineer", "developer", "backend", "frontend", "python"]

def load_keywords(db: Session, user_id: int) -> List[str]:
    # Prefer keywords configured in Settings, then keywords.json, then defaults.
    if db is not None:
        settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
        if settings and settings.search_keywords:
            try:
                parsed = json.loads(settings.search_keywords)
                kws = [k.strip() for k in parsed if k and k.strip()] if isinstance(parsed, list) else []
                if kws:
                    return kws
            except Exception:
                pass
    try:
        with open("keywords.json", "r") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_KEYWORDS

def load_targets() -> List[Dict[str, Any]]:
    try:
        with open("providers.json", "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load providers.json: {e}")
        return []

def has_been_notified(db: Session, user_id: int, url: str) -> bool:
    seven_days_ago = datetime.now() - timedelta(days=7)
    existing = db.query(models.Job).filter(
        models.Job.user_id == user_id, models.Job.url == url, models.Job.created_at > seven_days_ago
    ).first()
    if existing and existing.status in ["REJECTED", "TRASH", "IGNORED"]:
        return False
    return existing is not None

def record_job(db: Session, user_id: int, company: str, title: str, url: str, location: str = "") -> models.Job:
    existing = db.query(models.Job).filter(models.Job.user_id == user_id, models.Job.url == url).first()
    if existing:
        if existing.status in ["REJECTED", "TRASH", "IGNORED"]:
            existing.status = "NEW"
            existing.match_score = None
            existing.match_reason = None
        return existing
    job = models.Job(user_id=user_id, company=company, title=title, url=url, location=location)
    db.add(job)
    return job

def check_keywords_and_location(title: str, location: str, keywords: List[str], locations: List[str]) -> bool:
    title_lower = title.lower() if title else ""
    loc_lower = location.lower() if location else ""

    # We still locally drop obvious senior/non-target roles to save AI tokens
    if any(x in title_lower for x in ["intern", "manager", "director", "vp", "president", "principal", "lead", "head"]):
        return False

    # We NO LONGER require a strict substring match on keywords (e.g. "software").
    # If the title is "SDE", a strict keyword match fails. We let Gemini evaluate it.

    location_match = any(l in loc_lower for l in locations) or not location
    return location_match

def get_active_companies(db: Session, user_id: int) -> List[str]:
    """Return the list of companies the user enabled in Settings, or [] for 'all'."""
    settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
    if not settings or not settings.active_companies:
        return []
    try:
        active = json.loads(settings.active_companies)
        return active if isinstance(active, list) else []
    except Exception:
        return []

async def process_jobs(items: Dict[str, str]) -> Dict[str, dict]:
    """Fetch (for a URL mapped to `None`/empty) or reuse (for a URL already
    mapped to known text) job posting content, and return `{text, fingerprint,
    liveness}` per URL.

    Delegates entirely to backend/universal/process-jobs.mjs: fetching reuses
    the same hardened HTTP layer (_http.mjs: timeout, retry, redirect:'error')
    and entity decoder the job-listing providers use, and the SimHash
    fingerprint / liveness classification are career-ops's own
    fingerprint-core.mjs / liveness-core.mjs designs. There is no separate
    Python HTTP/HTML-parsing or content-processing path.
    """
    import asyncio
    from pathlib import Path

    empty = {"text": "", "fingerprint": "", "liveness": "expired"}
    results = {url: empty for url in items}
    if not items:
        return results

    script = Path(__file__).resolve().parents[2] / "backend" / "universal" / "process-jobs.mjs"
    proc = await asyncio.create_subprocess_exec(
        "node", str(script), json.dumps(items),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error(f"process-jobs.mjs failed: {stderr.decode(errors='ignore')}")
        return results

    try:
        results.update(json.loads(stdout.decode()))
    except Exception as e:
        logger.error(f"process-jobs.mjs returned unparseable output: {e}")
    return results


def commit_jobs(db: Session, user_id: int, jobs: list) -> bool:
    """Persist collected jobs. Returns False if the commit failed — jobs were NOT saved.

    Previously this swallowed the exception with only a log line, so a DB write failure
    (locked file, disk full) looked identical to success everywhere downstream: the caller
    still counted those jobs as "found" even though nothing was persisted.
    """
    if not jobs:
        return True
    unique_jobs = {}
    for job in jobs:
        unique_jobs[job["url"]] = job

    for url, job in unique_jobs.items():
        logger.debug(f"  Committing: [{job.get('company')}] {job.get('title', '(no title)')} -> {url[:80]}")
        record_job(db, user_id, job["company"], job["title"], url, job.get("location", ""))

    try:
        db.commit()
        logger.info(f"Successfully committed {len(unique_jobs)} new jobs to the database.")
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit jobs: {e}")
        return False


def load_scan_depth(db: Session, user_id: int) -> int:
    default_depth = 500
    if db is not None:
        from backend.database import models
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.location_prefs:
            try:
                import json
                prefs = json.loads(user.location_prefs)
                depth = prefs.get("scanDepth")
                if depth and isinstance(depth, int) and depth > 0:
                    return depth
            except Exception:
                pass
    return default_depth

