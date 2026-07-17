"""Scraper orchestration: dispatches each target to its source-specific scraper
(backend/sources/), then runs bulk AI evaluation on everything collected.

Every name imported below is re-exported from this module for backward
compatibility — main.py, scheduler.py, and tests/check_targets.py all import
scraper functions directly from `backend.scraper_core`.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List
from sqlalchemy.orm import Session

from . import models, ai_agent
from .sources.common import (
    LOCATIONS, DEFAULT_KEYWORDS,
    is_valid_candidate, check_keywords_and_location,
    load_keywords, load_targets, has_been_notified, record_job,
    get_active_companies, commit_jobs,
)
from .sources.greenhouse import process_greenhouse
from .sources.lever import process_lever
from .sources.api_post import process_api_post
from .sources.tech_mahindra import process_tech_mahindra
from .sources.zwayam import process_zwayam
from .sources.playwright_engine import (
    dismiss_popups, extract_playwright_jobs,
    fetch_job_descriptions_httpx, fetch_job_descriptions_batch,
    fetch_job_description, process_playwright,
)

logger = logging.getLogger(__name__)


def bulk_evaluate_jobs(db: Session, jobs: list):
    """
    Takes a list of job dicts, chunks them into batches of 10,
    fetches HTML, strips it, and sends to Gemini for match evaluation.
    Then saves the match back to the DB quietly.
    """
    if not jobs:
        return

    settings = db.query(models.Settings).first()
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else ai_agent.DEFAULT_MODEL_CHAIN

    resume_text = ai_agent.extract_resume_text() # Gets default resume
    if not resume_text:
        logger.info("No resume found. Skipping AI evaluation.")
        return

    logger.info(f"Bulk evaluating {len(jobs)} jobs in batches of 10...")

    batch_size = 10
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i+batch_size]

        # We need the real DB job IDs
        batch_urls = [j['url'] for j in batch]
        db_jobs = db.query(models.Job).filter(models.Job.url.in_(batch_urls)).all()

        if not db_jobs:
            continue

        ai_payload = []
        targets = load_targets()

        playwright_urls = []
        httpx_urls = []

        batch_jds = {}
        for db_job in db_jobs:
            if db_job.description and len(db_job.description) > 200:
                # Already populated (e.g. by the Chrome Extension)
                batch_jds[db_job.url] = db_job.description
                continue

            config = next((t for t in targets if t.get("company") == db_job.company), {})
            if config.get("use_playwright", False):
                playwright_urls.append(db_job.url)
            else:
                httpx_urls.append(db_job.url)

        # Always invoked from a synchronous context (scheduler job or background
        # task thread), so a fresh event loop via asyncio.run is safe and correct.
        if httpx_urls:
            logger.info(f"Fetching {len(httpx_urls)} JDs via fast HTTPx...")
            httpx_results = asyncio.run(fetch_job_descriptions_httpx(httpx_urls))
            batch_jds.update(httpx_results)

        if playwright_urls:
            logger.info(f"Fetching {len(playwright_urls)} JDs via Playwright (SPA mode)...")
            pw_results = asyncio.run(fetch_job_descriptions_batch(playwright_urls, True))
            batch_jds.update(pw_results)

        for db_job in db_jobs:
            raw_text = batch_jds.get(db_job.url, "")

            ai_payload.append({
                "id": db_job.id,
                "company": db_job.company,
                "title": db_job.title,
                "description": raw_text
            })

        logger.info(f"Sending {len(ai_payload)} jobs to AI in batches of {batch_size} concurrently...")
        eval_results = []

        def eval_chunk(chunk):
            return ai_agent.batch_evaluate_jobs(chunk, resume_text, api_key, model_name)

        chunks = [ai_payload[i:i + batch_size] for i in range(0, len(ai_payload), batch_size)]

        with ThreadPoolExecutor(max_workers=5) as executor:
            for res in executor.map(eval_chunk, chunks):
                eval_results.extend(res)

        settings = db.query(models.Settings).first()
        min_match_score = getattr(settings, "min_match_score", 50) if settings else 50

        # Process results
        for res in eval_results:
            job_id = res.get("id")
            score = res.get("match_score")
            reason = res.get("match_reason")

            db_job = next((j for j in db_jobs if j.id == job_id), None)
            if db_job:
                db_job.match_score = score
                db_job.match_reason = reason

                if score is not None and score < min_match_score:
                    db_job.status = "IGNORED"
                elif db_job.status == "NEW":
                    pass # Leave as NEW unless we need to change it


                ext_id = res.get("external_id")
                if ext_id:
                    db_job.external_id = ext_id

                yoe = res.get("yoe")
                if yoe:
                    db_job.yoe = yoe

                # Save the cleaned JD
                cleaned_jd = res.get("cleaned_job_description")
                if cleaned_jd:
                    db_job.description = cleaned_jd
                else:
                    db_job.description = next((p["description"] for p in ai_payload if p["id"] == job_id), None)
        db.commit()


def run_scraper(db: Session):
    logger.info("=" * 60)
    logger.info("Starting Backend Scraper Engine...")
    targets = load_targets()
    keywords = load_keywords(db)
    logger.info(f"Keywords: {keywords}")
    logger.debug(f"Loaded {len(targets)} total targets from targets.json")
    all_new_jobs = []
    new_jobs = []
    company_logs = []
    playwright_targets = []

    active = get_active_companies(db)
    if active:
        targets = [t for t in targets if t.get("company") in active]
        logger.info(f"Scraping {len(targets)} selected companies: {active}")
    else:
        logger.info(f"Scraping all {len(targets)} companies (no filter set)")

    for target in targets:
        t_type = target.get("type", "")
        company = target.get("company", "Unknown")
        if t_type != "playwright":
            logger.info(f"[{company}] Scraping via {t_type}...")

        if t_type == "greenhouse":
            process_greenhouse(db, target, keywords, LOCATIONS, new_jobs, company_logs)
        elif t_type == "lever":
            process_lever(db, target, keywords, LOCATIONS, new_jobs, company_logs)
        elif t_type == "api_post":
            process_api_post(db, target, keywords, new_jobs, company_logs)
        elif t_type == "tech_mahindra":
            process_tech_mahindra(db, target, keywords, new_jobs, company_logs)
        elif t_type == "zwayam":
            process_zwayam(db, target, keywords, LOCATIONS, new_jobs, company_logs)
        elif t_type == "playwright":
            playwright_targets.append(target)

        if company_logs and company_logs[-1].get("company") == company:
            status = company_logs[-1].get("status")
            links_found = company_logs[-1].get("jobs_found", 0)
            logger.info(f"[{company}] Done → {status}, {links_found} candidate links collected")

        if new_jobs:
            if commit_jobs(db, new_jobs):
                all_new_jobs.extend(new_jobs)
            else:
                # Don't count these as "found" — they were never actually persisted,
                # and bulk_evaluate_jobs would just silently skip them anyway.
                company_logs.append({"company": "Database commit", "status": "FAILED", "jobs_found": 0, "message": f"Failed to commit {len(new_jobs)} scraped job(s) to the database."})
            new_jobs.clear()

    if playwright_targets:
        try:
            asyncio.run(process_playwright(db, playwright_targets, keywords, new_jobs, company_logs))
        except Exception as e:
            # A browser-launch/Playwright failure should not abort the whole run or
            # discard jobs already collected from the API-based sources above.
            logger.error(f"Playwright stage failed, continuing with API-sourced jobs: {e}")
            company_logs.append({"company": "Playwright stage", "status": "FAILED", "jobs_found": 0, "message": str(e)})
        if new_jobs:
            if commit_jobs(db, new_jobs):
                all_new_jobs.extend(new_jobs)
            else:
                # Don't count these as "found" — they were never actually persisted,
                # and bulk_evaluate_jobs would just silently skip them anyway.
                company_logs.append({"company": "Database commit", "status": "FAILED", "jobs_found": 0, "message": f"Failed to commit {len(new_jobs)} scraped job(s) to the database."})
            new_jobs.clear()

    # BULK AI FILTERING & COMMIT
    logger.info(f"Total raw candidates collected across all companies: {len(all_new_jobs)}")

    # Phase 2: AI Bulk Evaluation
    try:
        if all_new_jobs:
            bulk_evaluate_jobs(db, all_new_jobs)
    except Exception as e:
        logger.error(f"Error during bulk AI evaluation: {e}")

    logger.info("=" * 60)
    return all_new_jobs, company_logs
