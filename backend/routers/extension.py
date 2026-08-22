import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from .. import schemas, crud
from ..database import get_db
from ..ai_agent import parse_job_page_title, sanitize_job_description, extract_job_details_from_description, batch_extract_job_details
from ..scraper_core import record_job, bulk_evaluate_jobs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs/extension", tags=["Extension"])

def _extension_location_tag(url: str) -> str:
    """Build the "Manual - Extension (Site)" source tag from a job URL's domain."""
    import urllib.parse
    try:
        domain = urllib.parse.urlparse(url).netloc
        parts = domain.replace("www.", "").split(".")
        site_name = parts[-2].capitalize() if len(parts) >= 2 else domain
    except Exception:
        site_name = "Extension"
    return f"Manual - Extension ({site_name})"

def process_batch_background(payloads: List[schemas.ExtensionPayload], settings: schemas.Settings):
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None

    # Get a fresh DB session for the background task
    db_gen = get_db()
    db = next(db_gen)

    jobs_to_evaluate = []

    chunk_size = 5
    for i in range(0, len(payloads), chunk_size):
        chunk = payloads[i:i + chunk_size]

        jobs_for_ai = [{"description": p.description, "url": p.url} for p in chunk]
        ai_results = batch_extract_job_details(jobs_for_ai, api_key, model_name)

        for j, payload in enumerate(chunk):
            try:
                location_tag = _extension_location_tag(payload.url)

                ai_company = ai_results[j].get("company", "Unknown Company")
                ai_title = ai_results[j].get("title", "Unknown Title")
                clean_desc = ai_results[j].get("clean_description", payload.description)
                
                company = payload.company.strip() if payload.company else ""
                title = payload.title.strip() if payload.title else ""
                
                if not company or company == "Unknown Company":
                    company = ai_company
                if not title or title == payload.page_title or title == "LinkedIn" or title == "Search":
                    title = ai_title
                    
                if not company: company = "Unknown Company"
                if not title: title = payload.page_title
                
                job = record_job(db, company, title, payload.url, location_tag)
                db.commit()
                db.refresh(job)
                
                update_data = {
                    "description": clean_desc, "location": location_tag,
                    "company": company, "title": title
                }
                job_update = schemas.JobUpdate(**update_data)
                crud.update_job_status(db, job.id, job_update)
                db.refresh(job)
                
                jobs_to_evaluate.append({"url": job.url})
            except Exception as e:
                logger.error(f"Failed background extension job: {e}")
                
    if jobs_to_evaluate:
        try:
            bulk_evaluate_jobs(db, jobs_to_evaluate)
        except Exception as e:
            logger.error(f"Failed to evaluate background jobs: {e}")
            
    try:
        next(db_gen)
    except StopIteration:
        pass

@router.post("/batch")
def save_from_extension_batch(payload: schemas.ExtensionBatchPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    settings = crud.get_settings(db)
    background_tasks.add_task(process_batch_background, payload.jobs, settings)
    return {"status": "processing"}

@router.get("/parse-title")
def parse_title_endpoint(page_title: str, db: Session = Depends(get_db)):
    """Used by Chrome extension to pre-parse the title before user saves it."""
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None
    parsed = parse_job_page_title(page_title, api_key, model_name)
    return parsed

@router.post("", response_model=schemas.Job)
def save_from_extension(payload: schemas.ExtensionPayload, db: Session = Depends(get_db)):
    """Receives a job scraped by the Chrome Extension."""
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None

    location_tag = _extension_location_tag(payload.url)

    # Clean description using AI
    clean_desc = sanitize_job_description(payload.description, api_key)

    company = payload.company.strip() if payload.company else ""
    title = payload.title.strip() if payload.title else ""
    
    if not company or company == "Unknown Company":
        parsed = parse_job_page_title(payload.page_title, api_key, model_name)
        company = parsed.get("company", "Unknown Company")
        if not title or title == payload.page_title:
            title = parsed.get("title", payload.page_title)
            
        # If it's still missing or we know it's a feed post, ask AI to parse the description
        if (company == "Unknown Company" or title == "LinkedIn" or title == "Search") and payload.description:
            parsed_desc = extract_job_details_from_description(payload.description, api_key, model_name)
            if parsed_desc:
                if company == "Unknown Company" and parsed_desc.get("company") and parsed_desc.get("company") != "Unknown Company":
                    company = parsed_desc.get("company")
                if (title == "LinkedIn" or title == "Search" or title == payload.page_title) and parsed_desc.get("title") and parsed_desc.get("title") != "Unknown Title":
                    title = parsed_desc.get("title")
            
    if not company:
        company = "Unknown Company"
    if not title:
        title = payload.page_title

    # Save to Kanban
    job = record_job(db, company, title, payload.url, location_tag)
    db.commit()
    db.refresh(job)
    
    # Always overwrite the card values with the latest parsed/user-edited values
    update_data = {
        "description": clean_desc,
        "location": location_tag,
        "company": company,
        "title": title
    }
    job_update = schemas.JobUpdate(**update_data)
    crud.update_job_status(db, job.id, job_update)
    db.refresh(job)
    return job
