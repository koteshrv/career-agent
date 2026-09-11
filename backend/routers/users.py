"""Multi-user identity: SSO login/approval and admin user management.

Local dashboard access still comes ONLY from POST /api/login (username/password from
backend/config.json) for the bootstrap admin — unchanged. Everyone else authenticates via
Google/GitHub through POST /api/auth/sso below, but only after the admin approves their
account: a first-time sign-in creates a PENDING User row and does NOT issue a token. See
CLAUDE.md's "two separate trust boundaries" note — this endpoint must never grant access
based on an unverified identity claim, which is why it calls crowdsourcing.verify_cloud_identity()
(asks career-agent-api to validate its own JWT) rather than decoding the token itself.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, crowdsourcing, crud, models, scheduler
from ..database import get_db

router = APIRouter(prefix="/api", tags=["Users"])


class SsoLoginRequest(BaseModel):
    cloud_token: str
    provider: str  # "google" | "github"


@router.post("/auth/sso")
def sso_login(req: SsoLoginRequest, db: Session = Depends(get_db)):
    email = crowdsourcing.verify_cloud_identity(req.cloud_token)
    if not email:
        raise HTTPException(status_code=401, detail="Could not verify identity.")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(email=email, auth_method="sso", sso_provider=req.provider,
                            role="USER", status="PENDING")
        db.add(user)
        db.commit()
        db.refresh(user)

    if user.status == "REJECTED":
        raise HTTPException(status_code=403, detail="Your access request was rejected.")
    if user.status == "PENDING":
        return {"status": "pending", "email": email}

    return {"status": "active", "token": auth.create_token(user)}


@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.post("/users/{user_id}/approve")
def approve_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "ACTIVE"
    user.approved_at = datetime.now(timezone.utc)
    db.commit()

    # Lazily creates this user's own Settings row, then installs their scrape cron +
    # crowdsource push/pull jobs immediately — no restart needed for approval to take effect.
    settings = crud.get_settings(db, user.id)
    scheduler.activate_user(user.id, settings.cron_schedule or "0 */12 * * *")
    return {"success": True}


@router.post("/users/{user_id}/reject")
def reject_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(auth.get_current_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "REJECTED"
    db.commit()
    return {"success": True}
