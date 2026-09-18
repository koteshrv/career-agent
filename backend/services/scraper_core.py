"""Scraper orchestration: dispatches each target to its source-specific scraper
(backend/sources/), then runs bulk AI evaluation on everything collected.

Every name imported below is re-exported from this module for backward
compatibility — main.py, scheduler.py, and tests/check_targets.py all import
scraper functions directly from `backend.scraper_core`.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from backend.services.tasks import task_manager
from typing import List
from sqlalchemy.orm import Session

from backend.database import models
from backend.services import ai_agent as agent
from backend.services.common import (
    LOCATIONS, DEFAULT_KEYWORDS,
    check_keywords_and_location,
    load_keywords, load_targets, has_been_notified, record_job,
    get_active_companies, commit_jobs, process_jobs,
)
from backend.services.universal_api import process_universal_api

logger = logging.getLogger(__name__)


def hamming_distance(hex1: str, hex2: str) -> int:
    """Compares two already-computed SimHash fingerprints (see
    backend/universal/process-content.mjs, which computes each one at fetch
    time) — pure integer arithmetic on two hex strings, not itself ATS/network
    processing, so it stays here rather than round-tripping through Node."""
    if not hex1 or not hex2:
        return 64
    return bin(int(hex1, 16) ^ int(hex2, 16)).count('1')

def bulk_evaluate_jobs(db: Session, user_id: int, jobs: list):
    """Takes a list of job dicts, chunks them into batches of 10, fetches HTML, strips it,
    and sends to Gemini for match evaluation. Then saves the match back to the DB quietly."""
    if not jobs:
        return
    task_id = task_manager.start_task("AI Evaluation", f"Evaluating {len(jobs)} jobs...", user_id)

    settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None

    resume_text = agent.extract_resume_text(user_id) # Gets this user's default resume
    if not resume_text:
        logger.info("No resume found. Skipping AI evaluation.")
        return

    logger.info(f"Bulk evaluating {len(jobs)} jobs in batches of 10...")

    batch_size = 10
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i+batch_size]
        task_manager.update_task(task_id, progress=int((i/len(jobs))*100), description=f"Evaluating {i}/{len(jobs)} jobs...")

        # We need the real DB job IDs
        batch_urls = [j['url'] for j in batch]
        db_jobs = db.query(models.Job).filter(
            models.Job.user_id == user_id, models.Job.url.in_(batch_urls)
        ).all()

        if not db_jobs:
            continue

        ai_payload = []

        # For a job whose description is already populated (e.g. by the Chrome
        # Extension, or a universal provider that returned it for free — see
        # backend/universal/providers), pass the known text through so
        # process-jobs.mjs fingerprints/classifies it without re-fetching;
        # `None` means "fetch this URL".
        items = {
            db_job.url: db_job.description if db_job.description and len(db_job.description) > 200 else None
            for db_job in db_jobs
        }

        # Always invoked from a synchronous context (scheduler job or background
        # task thread), so a fresh event loop via asyncio.run is safe and correct.
        processed = asyncio.run(process_jobs(items))

        for db_job in db_jobs:
            result = processed.get(db_job.url, {"text": "", "fingerprint": "", "liveness": "expired"})
            raw_text = result["text"]

            # Liveness Gate
            if result["liveness"] == "expired":
                logger.info(f"Skipping LLM eval for {db_job.url} - posting is DEAD.")
                db_job.status = "IGNORED"
                db_job.match_reason = "System detected the job posting is no longer available or closed."
                continue

            # SimHash Cross-Listing Dedup
            fp = result["fingerprint"]
            if fp:
                db_job.fingerprint = fp
                # Check for existing dupes in DB
                existing_jobs = db.query(models.Job).filter(models.Job.user_id == user_id, models.Job.fingerprint != None, models.Job.id != db_job.id).all()
                is_dupe = False
                for ej in existing_jobs:
                    if hamming_distance(fp, ej.fingerprint) <= 5:
                        logger.info(f"Cross-listing detected! {db_job.url} is a duplicate of {ej.url}")
                        db_job.status = "IGNORED"
                        db_job.match_reason = f"Cross-listing duplicate of {ej.company} - {ej.title}"
                        is_dupe = True
                        break
                if is_dupe:
                    continue

            ai_payload.append({
                "id": db_job.id,
                "company": db_job.company,
                "title": db_job.title,
                "description": raw_text
            })

        logger.info(f"Sending {len(ai_payload)} jobs to AI in batches of {batch_size} concurrently...")
        eval_results = []

        def eval_chunk(chunk):
            return agent.batch_evaluate_jobs(chunk, resume_text, api_key, model_name, user_id)

        chunks = [ai_payload[i:i + batch_size] for i in range(0, len(ai_payload), batch_size)]

        with ThreadPoolExecutor(max_workers=5) as executor:
            for res in executor.map(eval_chunk, chunks):
                eval_results.extend(res)

        settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
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
                db_job.score_match = str(res.get("score_match")) if res.get("score_match") else None
                db_job.score_north_star = str(res.get("score_north_star")) if res.get("score_north_star") else None
                db_job.score_comp = str(res.get("score_comp")) if res.get("score_comp") else None
                db_job.score_culture = str(res.get("score_culture")) if res.get("score_culture") else None
                db_job.score_red_flags = str(res.get("score_red_flags")) if res.get("score_red_flags") else None
                db_job.legitimacy_tier = str(res.get("legitimacy_tier")) if res.get("legitimacy_tier") else None

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
    task_manager.update_task(task_id, description=f"Evaluated {len(jobs)} jobs.", progress=100)
    task_manager.complete_task(task_id, success=True)


def run_scraper(db: Session, user_id: int, target_name: str = None, ignore_active_filter: bool = False):
    task_id = task_manager.start_task("Scraper Run", f"Scraping targets...", user_id)
    logger.info("=" * 60)
    logger.info("Starting Backend Scraper Engine...")
    targets = load_targets()
    keywords = load_keywords(db, user_id)
    logger.info(f"Keywords: {keywords}")
    logger.debug(f"Loaded {len(targets)} total targets from providers.json")
    all_new_jobs = []
    new_jobs = []
    company_logs = []

    if target_name:
        targets = [t for t in targets if t.get("company") == target_name]
        logger.info(f"Scraping SINGLE requested company: {target_name}")
    elif ignore_active_filter:
        logger.info("Health Check mode: Scraping ALL companies, bypassing active company filter.")
    else:
        active = get_active_companies(db, user_id)
        if active:
            targets = [t for t in targets if t.get("company") in active]
            logger.info(f"Scraping {len(targets)} selected companies: {active}")
        else:
            logger.info(f"Scraping all {len(targets)} companies (no filter set)")

    # Filter out BLOCKED targets for cooldown
    from backend.core.health_manager import is_provider_blocked, update_health
    filtered_targets = []
    for t in targets:
        company = t.get("company")
        if not target_name and is_provider_blocked(db, user_id, company):
            logger.warning(f"[{company}] Skipping target due to 24-hour BLOCKED cooldown.")
            # SKIPPED, not FAILED: this target never ran, so it must not count as a failure
            # in health state or target-health stats (see health_manager.update_health).
            company_logs.append({"company": company, "status": "SKIPPED", "jobs_found": 0, "message": "BLOCKED (Cooldown active)"})
        else:
            filtered_targets.append(t)
            
    targets = filtered_targets

    for target in targets:
        company = target.get("company", "Unknown")
        logger.info(f"[{company}] Scraping via {target.get('provider') or 'auto-detect'}...")
        process_universal_api(db, user_id, target, keywords, LOCATIONS, new_jobs, company_logs)

        if company_logs and company_logs[-1].get("company") == company:
            status = company_logs[-1].get("status")
            links_found = company_logs[-1].get("jobs_found", 0)
            logger.info(f"[{company}] Done → {status}, {links_found} candidate links collected")

        if new_jobs:
            if commit_jobs(db, user_id, new_jobs):
                all_new_jobs.extend(new_jobs)
            else:
                # Don't count these as "found" — they were never actually persisted,
                # and bulk_evaluate_jobs would just silently skip them anyway.
                company_logs.append({"company": "Database commit", "status": "FAILED", "jobs_found": 0, "message": f"Failed to commit {len(new_jobs)} scraped job(s) to the database."})
            new_jobs.clear()

    
    return all_new_jobs, company_logs
