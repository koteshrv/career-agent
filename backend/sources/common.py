"""Shared helpers used across every scraper source: link filtering, dedup against
the DB, and the target/keyword config loaders."""
import json
import logging
import urllib.parse
from datetime import datetime, timedelta
from typing import List, Dict, Any

from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)

LOCATIONS = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]

DEFAULT_KEYWORDS = ["software", "engineer", "developer", "backend", "frontend", "python"]

# Tokens in a URL that strongly suggest it points to an actual individual job posting.
JOB_HREF_HINTS = (
    "requisition", "posting", "vacanc", "gh_jid", "opening",
    "/jobs/", "/job/", "/position/", "/role/", "/apply",
    "jobId", "job_id", "jid=", "id=", "req=", "reqid",
    "detail", "description", "profile",
)

# URL patterns that are definitely NOT individual job listings — exclude them.
EXCLUDED_HREF_PATTERNS = (
    # Auth / account pages
    "login", "signin", "sign-in", "logout", "register",
    "dashboard", "my-profile", "user/details", "applicant/",
    # Policy pages
    "privacy", "cookie", "terms", "legal",
    # Generic nav / non-job pages
    "about", "contact", "news", "blog", "press", "media",
    "investor", "alumni", "supplier",
    "accessibility", "sitemap", "faq",
    # Company life/culture/benefits
    "life-at", "culture", "benefits", "diversity", "inclusion",
    "early-careers", "business-divisions", "locations", "job-categories",
    "business_categories", "job_categories", "our-workplace",
    # Saved/My job dashboards
    "saved-jobs", "saved_jobs", "my-jobs", "talent-community", "join-talent",
    # Specific company non-job pages
    "amazon.jobs/en/search", "amazon.jobs/content/",
    "apple.com/in/", "apple.com/shop", "apple.com/careers/in", "jobs.apple.com/careers/", "jobs.apple.com/app/",
    "microsoft.com/en-us", "microsoft.com/software",
    "xbox.com", "azure.microsoft.com", "marketplace.microsoft.com",
    "wellsfargojobs.com/en/resources", "wellsfargojobs.com/en/well-life", "wellsfargojobs.com/en/ready-to-work", "wellsfargojobs.com/en/create-a-job-alert",
    # glassdoor (all TLDs e.g. .co.in), EEOC, shorteners, support
    "glassdoor", "eeoc.gov", "bit.ly", "goo.gl",
    "go.microsoft.com", "support.google.com", "support.microsoft.com", "support.apple.com",
    # nav anchors that are literally anchor links, not job pages
    "#main", "#top", "#footer", "#skip", "#collapse",
)

# Title text patterns that are definitely NOT job titles — exclude them.
EXCLUDED_TITLE_PATTERNS = (
    "saved jobs", "job search", "click here", "access application",
    "log in", "sign in", "register", "apply now",
    "privacy policy", "cookie", "terms",
    "life at ", "about us", "contact us",
    "view profile", "view all",
    "skip to", "join the network", "join our talent",
    "(english)", "(french)", "(german)", "(spanish)", "(portuguese)",
    "(japanese)", "(polish)", "(dutch)", "(slovak)",
)

def is_valid_candidate(href: str, title: str, strict_hints: bool = False) -> bool:
    """Pre-filter out obvious garbage links so the AI doesn't waste tokens or hallucinate."""
    if not href or not title: return False
    if len(title) < 3 or len(title) > 200: return False

    hl = href.lower()
    tl = title.lower()

    if any(p in hl for p in EXCLUDED_HREF_PATTERNS):
        return False
    if any(p in tl for p in EXCLUDED_TITLE_PATTERNS):
        return False

    if strict_hints:
        # Must satisfy at least ONE of:
        # 1. URL contains a known job-page keyword hint
        has_hint = any(h in hl for h in JOB_HREF_HINTS)

        # 2. Last path segment contains digits (job IDs like /12345, /req-9876)
        last_part = href.split('?')[0].strip('/').split('/')[-1]
        has_digits = any(char.isdigit() for char in last_part)

        # 3. URL is deeply nested (4+ non-empty path segments).
        #    Nav/social links are shallow (e.g. /about, /login).
        #    Job detail pages are deep (e.g. /company/careers/jobs/software-engineer)
        path_segments = [s for s in href.split('?')[0].split('/') if s]
        is_deep_path = len(path_segments) >= 4

        if not (has_hint or has_digits or is_deep_path):
            return False

    return True


def _find_jobs_in_json(data):
    jobs = []
    if isinstance(data, dict):
        title = data.get("title") or data.get("jobTitle") or data.get("reqTitle") or data.get("name") or data.get("postingTitle")
        link = data.get("url") or data.get("jobUrl") or data.get("link") or data.get("id") or data.get("jobId") or data.get("jobReqId") or data.get("postingId")
        if title and link and isinstance(title, str) and isinstance(link, (str, int)):
            if is_valid_candidate(str(link), title):
                jobs.append({"title": title, "href": str(link)})

        for v in data.values():
            if isinstance(v, (dict, list)):
                jobs.extend(_find_jobs_in_json(v))
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                jobs.extend(_find_jobs_in_json(item))
    return jobs

def _extract_jobs_from_text(text, base_url):
    try:
        data = json.loads(text)
        jobs = _find_jobs_in_json(data)
        for j in jobs:
            if not j["href"].startswith("http"):
                j["href"] = urllib.parse.urljoin(base_url, j["href"])
        if jobs:
            return jobs
    except Exception:
        pass

    soup = BeautifulSoup(text, "html.parser")
    jobs = []
    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        if title and len(title) >= 3:
            href = urllib.parse.urljoin(base_url, a["href"])
            if is_valid_candidate(href, title):
                jobs.append({"title": title, "href": href})
    return jobs


def load_keywords(db: Session = None) -> List[str]:
    # Prefer keywords configured in Settings, then keywords.json, then defaults.
    if db is not None:
        settings = db.query(models.Settings).first()
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
        with open("targets.json", "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load targets.json: {e}")
        return []

def has_been_notified(db: Session, url: str) -> bool:
    seven_days_ago = datetime.now() - timedelta(days=7)
    existing = db.query(models.Job).filter(models.Job.url == url, models.Job.created_at > seven_days_ago).first()
    if existing and existing.status in ["REJECTED", "TRASH", "IGNORED"]:
        return False
    return existing is not None

def record_job(db: Session, company: str, title: str, url: str, location: str = "") -> models.Job:
    existing = db.query(models.Job).filter(models.Job.url == url).first()
    if existing:
        if existing.status in ["REJECTED", "TRASH", "IGNORED"]:
            existing.status = "NEW"
            existing.match_score = None
            existing.match_reason = None
        return existing
    job = models.Job(company=company, title=title, url=url, location=location)
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

def get_active_companies(db: Session) -> List[str]:
    """Return the list of companies the user enabled in Settings, or [] for 'all'."""
    settings = db.query(models.Settings).first()
    if not settings or not settings.active_companies:
        return []
    try:
        active = json.loads(settings.active_companies)
        return active if isinstance(active, list) else []
    except Exception:
        return []

def commit_jobs(db: Session, jobs: list) -> bool:
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
        record_job(db, job["company"], job["title"], url, job.get("location", ""))

    try:
        db.commit()
        logger.info(f"Successfully committed {len(unique_jobs)} new jobs to the database.")
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit jobs: {e}")
        return False
