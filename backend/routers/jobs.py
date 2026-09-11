from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from .. import schemas, crud, auth, models
from ..database import get_db
from ..scraper_core import fetch_job_description
from ..ai_agent import sanitize_job_description

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
    clean_desc = sanitize_job_description(description, api_key, current_user.id)

    db_job = crud.update_job_status(db, current_user.id, job_id, schemas.JobUpdate(description=clean_desc))
    return {"description": clean_desc}
