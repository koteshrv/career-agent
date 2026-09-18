import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from .. import schemas, crud, auth, models, log_context
from ..database import get_db
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

def process_batch_background(payloads: List[schemas.ExtensionPayload], settings: schemas.Settings, user_id: int):
    log_context.set_current_user(user_id)
    db_gen = get_db()
    db = next(db_gen)

    jobs_to_evaluate = []
    for payload in payloads:
        try:
            location_tag = _extension_location_tag(payload.url)
            company = payload.company.strip() if payload.company else "Unknown Company"
            title = payload.title.strip() if payload.title else payload.page_title
            
            job = record_job(db, user_id, company, title, payload.url, location_tag)
            db.commit()
            db.refresh(job)
            
            update_data = {
                "description": payload.description,
                "location": location_tag,
                "company": company,
                "title": title
            }
            crud.update_job_status(db, user_id, job.id, schemas.JobUpdate(**update_data))
            db.commit()
            jobs_to_evaluate.append({"url": job.url})
        except Exception as e:
            logger.error(f"Failed background extension job: {e}")

    if jobs_to_evaluate:
        try:
            bulk_evaluate_jobs(db, user_id, jobs_to_evaluate)
        except Exception as e:
            logger.error(f"Failed to evaluate background jobs: {e}")
            
    try:
        next(db_gen)
    except StopIteration:
        pass

@router.post("/batch")
def save_from_extension_batch(payload: schemas.ExtensionBatchPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    settings = crud.get_settings(db, current_user.id)
    background_tasks.add_task(process_batch_background, payload.jobs, settings, current_user.id)
    return {"status": "processing"}

@router.get("/parse-title")
def parse_title_endpoint(page_title: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return {"company": "Unknown Company", "title": page_title}

@router.post("", response_model=schemas.Job)
def save_from_extension(payload: schemas.ExtensionPayload, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    location_tag = _extension_location_tag(payload.url)
    company = payload.company.strip() if payload.company else "Unknown Company"
    title = payload.title.strip() if payload.title else payload.page_title

    job = record_job(db, current_user.id, company, title, payload.url, location_tag)
    db.commit()
    db.refresh(job)

    update_data = {
        "description": payload.description,
        "location": location_tag,
        "company": company,
        "title": title
    }
    crud.update_job_status(db, current_user.id, job.id, schemas.JobUpdate(**update_data))
    db.commit()
    db.refresh(job)
    return job
