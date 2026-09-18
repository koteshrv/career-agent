from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import crud
from backend.core import auth
from backend.database import models
from backend.database.database import get_db
from backend.services.followups import compute_follow_up_state, is_follow_up_eligible

router = APIRouter(prefix="/api/followups", tags=["Follow-ups"])


@router.get("")
def get_followups(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Every tracked job whose status is follow-up-eligible, grouped by urgency.
    Purely computed on read — see backend/followups.py."""
    jobs = (
        db.query(models.Job)
        .filter(models.Job.user_id == current_user.id, models.Job.status.in_(["APPLIED", "INTERVIEWING"]))
        .all()
    )

    groups = {"overdue": [], "due": [], "upcoming": []}
    for job in jobs:
        if not is_follow_up_eligible(job):
            continue
        state = compute_follow_up_state(job)
        if state.urgency not in groups:
            continue
        groups[state.urgency].append({
            "id": job.id,
            "company": job.company,
            "title": job.title,
            "status": job.status,
            "applied_at": job.applied_at,
            "follow_up_count": job.follow_up_count or 0,
            "due_date": state.due_date,
            "reason": state.reason,
        })

    for bucket in groups.values():
        bucket.sort(key=lambda j: j["due_date"] or datetime.min.replace(tzinfo=timezone.utc))

    return groups


class SnoozeRequest(BaseModel):
    until: datetime


@router.post("/{job_id}/log")
def log_follow_up(job_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    job = crud.log_follow_up(db, current_user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job.id, "follow_up_count": job.follow_up_count, "last_follow_up_at": job.last_follow_up_at}


@router.post("/{job_id}/snooze")
def snooze_follow_up(job_id: int, req: SnoozeRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    job = crud.snooze_follow_up(db, current_user.id, job_id, req.until)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job.id, "follow_up_snoozed_until": job.follow_up_snoozed_until}
