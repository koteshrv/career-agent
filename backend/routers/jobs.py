from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import logging
logger = logging.getLogger(__name__)
import asyncio

from .. import schemas, crud, auth, models
from ..database import get_db
from ..scraper_core import fetch_job_description
from .. import ai_agent

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])

@router.get("", response_model=List[schemas.Job])
def read_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    jobs = crud.get_jobs(db, current_user.id, skip=skip, limit=limit)
    return jobs

@router.delete("")
def clear_jobs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    count = crud.delete_all_jobs(db, current_user.id)
    return {"deleted": count}

@router.post("/bulk-status")
def bulk_status(req: schemas.BulkStatusRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    count = crud.bulk_update_status(db, current_user.id, req.ids, req.status)
    return {"updated": count}

@router.post("/bulk-delete")
def bulk_delete(req: schemas.BulkIdsRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    count = crud.bulk_delete_jobs(db, current_user.id, req.ids)
    return {"deleted": count}

@router.delete("/trash/empty")
def empty_trash(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    count = crud.empty_trash(db, current_user.id)
    return {"deleted": count}

@router.delete("/{job_id}")
def remove_job(job_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if not crud.delete_job(db, current_user.id, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"deleted": 1}

@router.put("/{job_id}", response_model=schemas.Job)
def update_job(job_id: int, job_update: schemas.JobUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_job = crud.update_job_status(db, current_user.id, job_id, job_update)
    if db_job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return db_job

@router.post("/{job_id}/fetch-jd")
async def fetch_jd(job_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_job = crud.get_job(db, current_user.id, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not db_job.url:
        raise HTTPException(status_code=400, detail="Job has no URL")

    try:
        description = await fetch_job_description(db_job.url)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    settings = crud.get_settings(db, current_user.id)
    api_key = settings.gemini_api_key if settings else None
    clean_desc = ai_agent.sanitize_job_description(description, api_key, current_user.id)

    db_job = crud.update_job_status(db, current_user.id, job_id, schemas.JobUpdate(description=clean_desc))
    return {"description": clean_desc}

from ..sources import global_scanner

@router.post("/global-search-test")
async def test_global_search(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    settings = crud.get_settings(db, current_user.id)
    if not settings.global_search_enabled:
        raise HTTPException(status_code=400, detail="Global Search is not enabled.")
        
    titles = [t.strip() for t in settings.global_search_titles.split(",")] if settings.global_search_titles else []
    locations = [l.strip() for l in settings.global_search_locations.split(",")] if settings.global_search_locations else []
    
    # Run the scan (limit to 5 companies per ATS for a quick test)
    jobs = await global_scanner.run_global_scan(titles, locations, limit_per_ats=5)
    
    return {"status": "success", "found_jobs": len(jobs), "sample": jobs[:5]}

from pydantic import BaseModel
class ExtractUrlRequest(BaseModel):
    url: str

@router.post("/extract")
async def extract_job_from_url(req: ExtractUrlRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Generic fallback scraper using Playwright Compact DOM + Gemini"""
    from ..sources import playwright_engine
    
    compact_text = await playwright_engine.fetch_job_description(req.url)
    
    settings = crud.get_settings(db, current_user.id)
    api_key = settings.gemini_api_key
    model_name = settings.gemini_model
    
    prompt = f"""You are a web scraper. I am providing you the visible text of a web page that contains a job posting.
Extract the job title and the full job description.

Respond ONLY with a JSON object containing exactly these two keys:
1. "title": The job title.
2. "description": The full job description text.

Web Page Text:
---
{compact_text}
---
"""
    response = await asyncio.to_thread(ai_agent._generate, prompt, api_key, model_name, current_user.id)
    
    import re
    cleaned_text = response.strip()
    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[7:]
    elif cleaned_text.startswith("```"):
        cleaned_text = cleaned_text[3:]
    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-3]
        
    try:
        import json
        data = json.loads(cleaned_text.strip())
        return data
    except Exception as e:
        logger.error(f"Failed to parse extraction: {e}")
        return {"title": "Unknown Title", "description": compact_text}

from pydantic import BaseModel
class AgentTestRequest(BaseModel):
    url: str
    keyword: str

@router.post("/agent-test")
async def test_agentic_scraper(req: AgentTestRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    from ..sources import agentic_scraper
    
    settings = crud.get_settings(db, current_user.id)
    if not settings.gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key required for Agent.")
        
    try:
        # Run it in the background thread if it is blocking, wait async_playwright is fully async so we can await it natively!
        jobs = await agentic_scraper.run_agent_loop(req.url, settings.gemini_api_key, ["gemma-4-31b-it", "gemma-4-26b-a4b-it"], req.keyword)
        return {"status": "success", "found_jobs": jobs}
    except Exception as e:
        logger.error(f"Agent failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
