"""Crowdsourcing (career-agent-api) endpoints. All routes here require the normal local
dashboard bearer token, like every other /api/* route — connecting a Google/GitHub account
happens from the frontend only after a real local login (see frontend/src/components/Login.tsx
and CLAUDE.md's "two separate trust boundaries" note). /connect takes ONLY a bare token, never
the general Settings schema, so it can set/replace which crowdsourcing account this instance
pushes/pulls as without touching any other setting (Gemini/Telegram/OpenAI keys, etc.).

/push and /pull are on-demand triggers for the push/pull cycle that otherwise runs on a
10-minute background schedule (see backend/scheduler.py) — used by the temporary "Push"/
"Pull" buttons on the Job Applications page for testing without waiting on the interval.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, crowdsourcing, crud, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/crowdsource", tags=["Crowdsourcing"])

class CloudTokenRequest(BaseModel):
    token: str | None = None
    email: str | None = None

@router.post("/connect")
def connect(req: CloudTokenRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    email = req.email or ""
    if req.token and not email:
        import jwt
        try:
            decoded = jwt.decode(req.token, options={"verify_signature": False})
            email = decoded.get("email") or ""
        except Exception:
            pass

    crud.update_settings(db, current_user.id, schemas.SettingsBase(
        career_agent_cloud_token=req.token or "",
        career_agent_account_email=email
    ))
    return {"success": True, "email": email}

@router.post("/push")
def trigger_push(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crowdsourcing.push_jobs(db, current_user.id)

@router.post("/pull")
def trigger_pull(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crowdsourcing.pull_jobs(db, current_user.id)

@router.get("/me")
def get_account_info(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crowdsourcing.get_account_info(db, current_user.id)

class ReportRequest(BaseModel):
    job_id: str
    reason: str

@router.post("/report")
def report_job(req: ReportRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crowdsourcing.report_job(db, current_user.id, req.job_id, req.reason)
