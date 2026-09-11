import hmac
import json
import time
import base64
import hashlib
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import config
from .database import get_db
from . import models

# Credentials are configured via backend/config.json (see config.example.json). Defaults
# are intentionally weak and should be overridden before exposing this past localhost.
APP_USERNAME = config["app_username"]
APP_PASSWORD = config["app_password"]
TOKEN_TTL = int(config["auth_token_ttl"])

def _secret() -> bytes:
    """HMAC signing secret. Prefer auth_secret from config; otherwise reuse the persistent
    encryption key file so tokens survive restarts without extra config."""
    s = config.get("auth_secret")
    if s:
        return s.encode()
    try:
        from .crypto import KEY_FILE
        return Path(KEY_FILE).read_bytes()
    except Exception:
        return b"insecure-default-secret-change-me"

def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")

def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def create_token(user: "models.User") -> str:
    payload = {"uid": user.id, "u": user.username or user.email, "role": user.role,
               "exp": int(time.time()) + TOKEN_TTL}
    body = _b64e(json.dumps(payload).encode())
    sig = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"

def decode_token(token: str) -> dict | None:
    """Return the full token payload if valid, unexpired, and current-format, else None.

    "Current-format" matters because tokens survive up to TOKEN_TTL (7 days by default) in
    the browser's localStorage: create_token() used to sign {"u": username, "exp": ...} with
    no "uid", and that signature is still valid against the same secret, so a pre-existing
    token from before that change passes the HMAC check here. Every caller (AuthMiddleware,
    get_current_user, websocket_logs) indexes payload["uid"] unconditionally, so silently
    returning such a payload crashes the request with an unhandled KeyError instead of just
    failing auth — checking here, once, is enough for all of them.
    """
    try:
        body, sig = token.split(".")
        expected = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64d(body))
        if "uid" not in payload:
            return None
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

def check_credentials(username: str, password: str) -> bool:
    return hmac.compare_digest(username or "", APP_USERNAME) and hmac.compare_digest(password or "", APP_PASSWORD)

def get_current_user(request: Request, db: Session = Depends(get_db)) -> "models.User":
    """FastAPI dependency: the authenticated User for this request. Re-queries the row
    (rather than trusting the token's cached role) so a rejected/deactivated user loses
    access immediately instead of waiting out the token's TOKEN_TTL."""
    uid = getattr(request.state, "user_id", None)
    if uid is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user or user.status != "ACTIVE":
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

def get_current_admin(current_user: "models.User" = Depends(get_current_user)) -> "models.User":
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user
