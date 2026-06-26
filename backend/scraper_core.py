import json
import logging
import requests
import asyncio
import urllib.parse
import re
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from . import models, schemas
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

LOCATIONS = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]

DEFAULT_KEYWORDS = ["software", "engineer", "developer", "backend", "frontend", "python"]

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
    return db.query(models.Job).filter(models.Job.url == url, models.Job.created_at > seven_days_ago).first() is not None

def record_job(db: Session, company: str, title: str, url: str, location: str = "") -> models.Job:
    existing = db.query(models.Job).filter(models.Job.url == url).first()
    if existing:
        return existing
    job = models.Job(company=company, title=title, url=url, location=location)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def check_keywords_and_location(title: str, location: str, keywords: List[str], locations: List[str]) -> bool:
    title_lower = title.lower() if title else ""
    loc_lower = location.lower() if location else ""
    if any(x in title_lower for x in ["intern", "manager", "director", "vp", "president", "principal"]):
        return False
    keyword_match = any(k in title_lower for k in keywords)
    location_match = any(l in loc_lower for l in locations) or not location 
    return keyword_match and location_match

def process_greenhouse(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            for job in r.json().get("jobs", []):
                title = job.get("title", "")
                location = job.get("location", {}).get("name", "")
                job_url = job.get("absolute_url", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        record_job(db, company, title, job_url, location)
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
    except Exception as e:
        logger.error(f"Error processing Greenhouse {company}: {e}")

def process_lever(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://api.lever.co/v0/postings/{board_token}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            for job in r.json():
                title = job.get("text", "")
                location = job.get("categories", {}).get("location", "")
                job_url = job.get("hostedUrl", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        record_job(db, company, title, job_url, location)
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
    except Exception as e:
        logger.error(f"Error processing Lever {company}: {e}")

def process_api_post(db: Session, target: dict, keywords: List[str], new_jobs: list):
    company = target.get("company")
    url = target.get("url")
    headers = target.get("headers", {})
    payload_template = target.get("payload", "")
    no_results_text = target.get("no_results_text", "0").lower()
    
    for keyword in keywords:
        try:
            kw_val = urllib.parse.quote(keyword) if "x-www-form-urlencoded" in headers.get("Content-Type", "").lower() else keyword
            payload = payload_template.replace("{keyword}", kw_val)
            r = requests.post(url, headers=headers, data=payload.encode('utf-8'), timeout=15)
            if r.status_code == 200:
                if no_results_text not in r.text.lower():
                    title = f"{keyword.capitalize()} Role"
                    if not has_been_notified(db, url):
                        record_job(db, company, title, url)
                        new_jobs.append({"company": company, "title": title, "url": url, "location": ""})
        except Exception as e:
            logger.error(f"Error processing API POST {company}: {e}")

def process_tech_mahindra(db: Session, target: dict, keywords: List[str], new_jobs: list):
    company = target.get("company", "Tech Mahindra")
    url = target.get("url", "https://careers.techmahindra.com/")
    no_results_text = target.get("no_results_text", "0 results").lower()
    
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
    }

    matched_keywords = []
    for keyword in keywords:
        try:
            session = requests.Session()
            get_r = session.get(url, timeout=15)
            if get_r.status_code != 200: continue
            
            viewstate = re.search(r'id="__VIEWSTATE"\s+value="(.*?)"', get_r.text).group(1)
            viewstategen = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="(.*?)"', get_r.text).group(1)
            eventval = re.search(r'id="__EVENTVALIDATION"\s+value="(.*?)"', get_r.text).group(1)
            
            payload_dict = {
                "ctl00$ContentPlaceHolder1$ScriptManager1": "ctl00$ContentPlaceHolder1$ctl04|ctl00$ContentPlaceHolder1$btnFreeSearch",
                "ctl00$ContentPlaceHolder1$RblList": "IT",
                "ctl00$ContentPlaceHolder1$txtAdvanceSearch": keyword,
                "ctl00$ContentPlaceHolder1$txtFirstName": "",
                "ctl00$ContentPlaceHolder1$txtLastName": "",
                "ctl00$ContentPlaceHolder1$ddlNationality": "IND",
                "ctl00$ContentPlaceHolder1$ddlTotExpYears": "Select Experience *",
                "ctl00$ContentPlaceHolder1$txtUserName": "",
                "ctl00$ContentPlaceHolder1$ddlType": "Select",
                "ctl00$ContentPlaceHolder1$txtSkills": "",
                "ctl00$ContentPlaceHolder1$ddlcountrycode": "Select country code *",
                "ctl00$ContentPlaceHolder1$txt_MobileNumber": "",
                "__EVENTTARGET": "",
                "__EVENTARGUMENT": "",
                "__LASTFOCUS": "",
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstategen,
                "__VIEWSTATEENCRYPTED": "",
                "__EVENTVALIDATION": eventval,
                "__ASYNCPOST": "true",
                "ctl00$ContentPlaceHolder1$btnFreeSearch": "Search"
            }
            
            post_r = session.post(url, headers=headers, data=urllib.parse.urlencode(payload_dict), timeout=15)
            if post_r.status_code == 200 and no_results_text not in post_r.text.lower():
                matched_keywords.append(keyword)
        except Exception as e:
            logger.error(f"Error Tech Mahindra {company}: {e}")

    # Dedupe: one entry per company per run, listing all matched keywords, on a
    # stable URL (the careers home page) so re-runs within 7 days don't pile up.
    if matched_keywords:
        if not has_been_notified(db, url):
            kw_label = ", ".join(k.capitalize() for k in matched_keywords)
            title = f"Matching roles ({kw_label})"
            record_job(db, company, title, url, kw_label)
            new_jobs.append({"company": company, "title": title, "url": url, "location": kw_label})

# Tokens in a URL that suggest it points to an actual job posting (used by the
# generic extractor to avoid recording nav/footer links).
JOB_HREF_HINTS = ("job", "career", "position", "requisition", "posting", "vacanc", "gh_jid", "/p/", "opening")

async def extract_playwright_jobs(page, keyword: str, selector: str = None) -> List[Dict[str, str]]:
    """Pull real job titles + links from a rendered page.

    If the target provides a CSS `job_selector`, each matched element is treated
    as a job listing. Otherwise a generic heuristic grabs anchors whose visible
    text contains the keyword and whose href looks like a job posting.
    """
    try:
        if selector:
            raw = await page.eval_on_selector_all(
                selector,
                "els => els.slice(0, 30).map(e => { const a = e.tagName === 'A' ? e : e.querySelector('a'); "
                "return { title: (e.innerText || '').trim().split('\\n')[0], href: a ? a.href : '' }; })",
            )
        else:
            raw = await page.eval_on_selector_all(
                "a",
                "(els, kw) => els.map(e => ({ title: (e.innerText || '').trim(), href: e.href }))"
                ".filter(x => x.title && x.href && x.title.toLowerCase().includes(kw)).slice(0, 100)",
                keyword.lower(),
            )
    except Exception:
        return []

    jobs, seen = [], set()
    for item in raw or []:
        title = (item.get("title") or "").strip()
        href = (item.get("href") or "").strip()
        if not title or not href or href in seen:
            continue
        if len(title) < 6 or len(title) > 140:
            continue
        # Without an explicit selector, only trust links that look job-related.
        if not selector and not any(h in href.lower() for h in JOB_HREF_HINTS):
            continue
        seen.add(href)
        jobs.append({"title": title, "href": href})
    return jobs[:25]

async def process_playwright(db: Session, targets: List[dict], keywords: List[str], new_jobs: list):
    if not targets: return
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        for target in targets:
            company = target.get("company")
            url_template = target.get("url")
            no_results_text = target.get("no_results_text", "0 results").lower()
            fallback_keywords = []

            for keyword in keywords:
                url = url_template.replace("{keyword}", urllib.parse.quote(keyword))
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(5000)
                    content = (await page.content()).lower()

                    if no_results_text not in content:
                        extracted = await extract_playwright_jobs(page, keyword, target.get("job_selector"))
                        if extracted:
                            # Record each real listing with its actual title + link.
                            for job in extracted:
                                if not has_been_notified(db, job["href"]):
                                    record_job(db, company, job["title"], job["href"])
                                    new_jobs.append({"company": company, "title": job["title"], "url": job["href"], "location": ""})
                        else:
                            # Couldn't parse listings — remember for a single deduped presence entry.
                            fallback_keywords.append(keyword)
                except Exception as e:
                    logger.error(f"Playwright error {company}: {e}")

            # Dedupe: one presence entry per company on a stable URL listing matched keywords.
            if fallback_keywords:
                stable_url = url_template.replace("{keyword}", "").rstrip("?&=")
                if not has_been_notified(db, stable_url):
                    kw_label = ", ".join(k.capitalize() for k in fallback_keywords)
                    title = f"Matching roles ({kw_label})"
                    record_job(db, company, title, stable_url, kw_label)
                    new_jobs.append({"company": company, "title": title, "url": stable_url, "location": kw_label})
        await browser.close()

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

def run_scraper(db: Session):
    logger.info("Starting Backend Scraper Engine...")
    targets = load_targets()
    keywords = load_keywords(db)
    new_jobs = []
    playwright_targets = []

    active = get_active_companies(db)
    if active:
        targets = [t for t in targets if t.get("company") in active]
        logger.info(f"Scraping {len(targets)} selected companies: {active}")

    for target in targets:
        t_type = target.get("type", "")
        if t_type == "greenhouse":
            process_greenhouse(db, target, keywords, LOCATIONS, new_jobs)
        elif t_type == "lever":
            process_lever(db, target, keywords, LOCATIONS, new_jobs)
        elif t_type == "api_post":
            process_api_post(db, target, keywords, new_jobs)
        elif t_type == "tech_mahindra":
            process_tech_mahindra(db, target, keywords, new_jobs)
        elif t_type == "playwright":
            playwright_targets.append(target)
            
    if playwright_targets:
        # run_scraper is always invoked from a sync context (FastAPI BackgroundTasks
        # runs sync functions in a worker thread), so there is never a running loop here.
        asyncio.run(process_playwright(db, playwright_targets, keywords, new_jobs))

    return new_jobs
