"""On-demand triggers for the crowdsourcing push/pull cycle that otherwise runs on a
10-minute background schedule (see backend/scheduler.py). Used by the temporary "Push"/
"Pull" buttons on the Job Applications page for testing without waiting on the interval."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crowdsourcing
from ..database import get_db

router = APIRouter(prefix="/api/crowdsource", tags=["Crowdsourcing"])

@router.post("/push")
def trigger_push(db: Session = Depends(get_db)):
    return crowdsourcing.push_jobs(db)

@router.post("/pull")
def trigger_pull(db: Session = Depends(get_db)):
    return crowdsourcing.pull_jobs(db)
