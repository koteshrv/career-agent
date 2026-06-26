import os
import hmac
import json
import time
import base64
import hashlib
from pathlib import Path

# Credentials are configured via environment variables (set them in docker-compose
# / .env). Defaults are intentionally weak and should be overridden in production.
APP_USERNAME = os.getenv("APP_USERNAME", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin")
TOKEN_TTL = int(os.getenv("AUTH_TOKEN_TTL", str(7 * 24 * 3600)))  # 7 days

def _secret() -> bytes:
    """HMAC signing secret. Prefer AUTH_SECRET; otherwise reuse the persistent
    encryption key file so tokens survive restarts without extra config."""
    s = os.getenv("AUTH_SECRET")
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

def create_token(username: str) -> str:
    payload = {"u": username, "exp": int(time.time()) + TOKEN_TTL}
    body = _b64e(json.dumps(payload).encode())
    sig = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"

def verify_token(token: str):
    """Return the username if the token is valid and unexpired, else None."""
    try:
        body, sig = token.split(".")
        expected = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64d(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload.get("u")
    except Exception:
        return None

def check_credentials(username: str, password: str) -> bool:
    return hmac.compare_digest(username or "", APP_USERNAME) and hmac.compare_digest(password or "", APP_PASSWORD)
