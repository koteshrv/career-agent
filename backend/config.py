"""Bootstrap config — the handful of values needed before the DB/auth layer exists to hold
them (login credentials, token signing, the DB path itself). Everything else (API keys,
Telegram, healthcheck URL, crowdsourcing token) lives in the Settings table instead — see
backend/crud.py's ENCRYPTED_FIELDS.

Loaded from a JSON file, not the environment: mirrors backend/crypto.py's DATA_DIR handling
so the file persists across container restarts via the same Docker volume as .encryption_key.
Copy backend/config.example.json to get started.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path("/app/data")
_IN_DOCKER = DATA_DIR.exists()
CONFIG_FILE = (DATA_DIR if _IN_DOCKER else Path(__file__).parent) / "config.json"

_DEFAULTS = {
    "app_username": "admin",
    "app_password": "admin",
    "auth_secret": "",
    "auth_token_ttl": 7 * 24 * 3600,
    # Matches crypto.py's DATA_DIR handling — defaults to the mounted volume path in
    # Docker so the DB isn't silently written to the container's ephemeral filesystem.
    "database_url": "sqlite:////app/data/jobs.db" if _IN_DOCKER else "sqlite:///./jobs.db",
    "log_level": "INFO",
    "crowdsource_api_url": "https://career-agent-api.kotesh-rv.workers.dev",
}


def _load() -> dict:
    if not CONFIG_FILE.exists():
        logger.warning(
            f"{CONFIG_FILE} not found — using default (insecure) bootstrap config. "
            "Copy backend/config.example.json to that path and edit it before exposing this "
            "instance to anything but localhost."
        )
        return dict(_DEFAULTS)
    try:
        return {**_DEFAULTS, **json.loads(CONFIG_FILE.read_text())}
    except Exception as e:
        logger.error(f"Failed to parse {CONFIG_FILE}, falling back to defaults: {e}")
        return dict(_DEFAULTS)


config = _load()
