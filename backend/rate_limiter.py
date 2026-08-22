import time
import threading
import json
import logging
from collections import deque

logger = logging.getLogger(__name__)

# --- Precise Sliding Window Rate Limiter ---
_request_timestamps = deque()
_rate_limit_lock = threading.Lock()

def _enforce_rpm_limit_sync(rpm: int = 14):
    """Ensure we do not exceed 'rpm' requests per 60 seconds."""
    with _rate_limit_lock:
        now = time.time()
        # Remove timestamps older than 60 seconds
        while _request_timestamps and now - _request_timestamps[0] > 60:
            _request_timestamps.popleft()
            
        if len(_request_timestamps) >= rpm:
            sleep_time = 60 - (now - _request_timestamps[0])
            if sleep_time > 0:
                logger.info(f"[RateLimit] RPM sliding window full ({len(_request_timestamps)} reqs). Sleeping for {sleep_time:.2f}s...")
                time.sleep(sleep_time)
                # After sleeping, the oldest request falls out.
                _request_timestamps.popleft()
                _request_timestamps.append(time.time())
                return
        _request_timestamps.append(time.time())

# --- DB-backed rate limit state (for hard 429 penalties) ---
# Stores rate_limited_until (unix timestamp) inside model_telemetry JSON per model.
# Survives server restarts unlike an in-memory dict.

def _is_rate_limited(model: str) -> bool:
    """Check DB to see if this model is still in its rate-limit cooldown window."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings and settings.model_telemetry:
            telemetry = json.loads(settings.model_telemetry)
            entry = telemetry.get(model, {})
            until = entry.get("rate_limited_until", 0)
            if time.time() < until:
                remaining = int(until - time.time())
                logger.info(f"[RateLimit] {model} is DB-rate-limited for {remaining}s more.")
                return True
    except Exception:
        pass
    finally:
        db.close()
    return False

def _set_rate_limit(model: str, seconds: int = 60):
    """Persist a rate-limit cooldown for this model in DB model_telemetry."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings:
            telemetry = {}
            if settings.model_telemetry:
                try:
                    telemetry = json.loads(settings.model_telemetry)
                except Exception:
                    telemetry = {}
            if model not in telemetry:
                telemetry[model] = {}
            telemetry[model]["rate_limited_until"] = time.time() + seconds
            settings.model_telemetry = json.dumps(telemetry)
            db.commit()
            logger.info(f"[RateLimit] {model} marked rate-limited in DB for {seconds}s.")
    except Exception as e:
        logger.error(f"Failed to persist rate limit for {model}: {e}")
    finally:
        db.close()
