"""Crowdsourcing (career-agent-api) endpoints.

/connect is deliberately public (see main.py's PUBLIC_PATHS) — connecting a Google/GitHub
account to the crowdsourcing economy happens from the Login page, before the user has a
local dashboard session, by design (see CLAUDE.md's "two separate trust boundaries" note).
It takes ONLY a bare token, never the general Settings schema, so an unauthenticated caller
can set/replace which crowdsourcing account this instance pushes/pulls as, but cannot touch
any other setting (Gemini/Telegram/OpenAI keys, etc.).

/push and /pull are on-demand triggers for the push/pull cycle that otherwise runs on a
10-minute background schedule (see backend/scheduler.py) — used by the temporary "Push"/
"Pull" buttons on the Job Applications page for testing without waiting on the interval.
These stay behind normal local-dashboard auth like every other /api/* route.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import crowdsourcing, crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/crowdsource", tags=["Crowdsourcing"])

class CloudTokenRequest(BaseModel):
    token: str

@router.post("/connect")
def connect(req: CloudTokenRequest, db: Session = Depends(get_db)):
    crud.update_settings(db, schemas.SettingsBase(career_agent_cloud_token=req.token))
    return {"success": True}

@router.post("/push")
def trigger_push(db: Session = Depends(get_db)):
    return crowdsourcing.push_jobs(db)

@router.post("/pull")
def trigger_pull(db: Session = Depends(get_db)):
    return crowdsourcing.pull_jobs(db)
