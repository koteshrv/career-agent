from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
import asyncio
from contextlib import asynccontextmanager
from collections import deque
import json
import os
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import logging
import logging.handlers

# Enterprise Grade Logging Setup
_raw_level = os.environ.get("LOG_LEVEL", "INFO").upper()
_log_level = logging.DEBUG if _raw_level in ("DEBUG", "VERBOSE") else logging.INFO

root_logger = logging.getLogger()
root_logger.setLevel(_log_level)
root_logger.handlers = []

log_format = '%(asctime)s | %(levelname)-8s | [%(name)s:%(lineno)d] | %(message)s'
formatter = logging.Formatter(log_format)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

file_handler = logging.handlers.RotatingFileHandler('backend.log', maxBytes=10*1024*1024, backupCount=5)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

if _log_level == logging.DEBUG:
    logging.getLogger("httpx").setLevel(logging.INFO)
    logging.getLogger("google_genai").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from . import models, schemas, crud, scheduler, auth, notifications
from .database import engine, get_db, SessionLocal
from .scraper_core import run_scraper

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections = []
        self.log_buffer = deque(maxlen=10000)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        if self.log_buffer:
            await websocket.send_text("\n".join(self.log_buffer))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        self.log_buffer.append(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

class WebSocketLogHandler(logging.Handler):
    def __init__(self, manager: ConnectionManager, loop: asyncio.AbstractEventLoop):
        super().__init__()
        self.manager = manager
        self.loop = loop
        self.formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')

    def emit(self, record):
        try:
            msg = self.format(record)
            if self.loop.is_running():
                asyncio.run_coroutine_threadsafe(self.manager.broadcast(msg), self.loop)
        except Exception:
            pass

class RunLogCaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []
        self.formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')

    def emit(self, record):
        try:
            self.logs.append(self.format(record))
        except Exception:
            pass

models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        with SessionLocal() as db:
            settings = crud.get_settings(db)
            is_debug = getattr(settings, "debug_logging_enabled", False)
        logging.getLogger().setLevel(logging.DEBUG if is_debug else logging.INFO)

        loop = asyncio.get_running_loop()
        ws_handler = WebSocketLogHandler(manager, loop)
        ws_handler.setLevel(logging.DEBUG if is_debug else logging.INFO)
        logging.getLogger().addHandler(ws_handler)
    except Exception as e:
        logger.error(f"Failed to attach WS logger: {e}")

    try:
        with SessionLocal() as db:
            n = crud.fail_orphaned_running_logs(db)
            if n:
                logger.info(f"Marked {n} orphaned RUNNING log(s) as FAILED.")
    except Exception as e:
        logger.error(f"Failed to clean orphaned logs: {e}")

    try:
        scheduler.start()
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    yield

    if scheduler.scheduler.running:
        scheduler.scheduler.shutdown(wait=False)

app = FastAPI(title="Job Scraper ATS API", lifespan=lifespan)

@app.get("/healthz")
def health_check():
    return {"status": "ok"}

PUBLIC_PATHS = {"/api/login", "/api/ws/logs", "/healthz", "/api/auth/sso", "/api/crowdsource/connect"}

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api") or path in PUBLIC_PATHS:
            return await call_next(request)
        authz = request.headers.get("Authorization", "")
        token = authz[7:] if authz.startswith("Bearer ") else ""
        if not auth.verify_token(token):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        return await call_next(request)

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pydantic import BaseModel

class SSOLoginRequest(BaseModel):
    auth_code: str | None = None
    sso_provider: str

@app.post("/api/auth/sso")
def sso_login(req: SSOLoginRequest):
    """Exchanges a GitHub OAuth code for an access token, for the frontend to forward to
    the crowdsourcing API (career-agent-api). Does NOT grant local dashboard access —
    that stays gated by /api/login. Google SSO talks to career-agent-api directly from the
    browser and never reaches this endpoint."""
    if req.sso_provider == "github":
        if not req.auth_code:
            raise HTTPException(status_code=400, detail="auth_code required for GitHub SSO")
            
        client_id = os.getenv("GITHUB_CLIENT_ID")
        client_secret = os.getenv("GITHUB_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise HTTPException(status_code=500, detail="GitHub SSO is not configured on the server")
            
        token_res = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": req.auth_code,
            }
        )
        token_data = token_res.json()
        if "error" in token_data:
            raise HTTPException(status_code=401, detail=token_data.get("error_description", "Failed to exchange code"))
            
        access_token = token_data.get("access_token")
        
        user_res = requests.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to fetch GitHub profile")
            
        emails = user_res.json()
        primary_email = next((e["email"] for e in emails if e.get("primary")), None)
        if not primary_email:
            if emails:
                primary_email = emails[0]["email"]
            else:
                raise ValueError("No primary email found")
                
        return {"github_access_token": access_token, "email": primary_email}

    else:
        raise HTTPException(status_code=400, detail="Unsupported provider")
@app.post("/api/login")
def login(creds: schemas.LoginRequest):
    if not auth.check_credentials(creds.username, creds.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": auth.create_token(creds.username)}

def bg_scrape_task():
    db = SessionLocal()
    capture_handler = RunLogCaptureHandler()
    capture_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(capture_handler)
    try:
        log = crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
        try:
            deleted_logs = crud.delete_old_scraper_logs(db, 14)
            if deleted_logs > 0:
                logger.info(f"Cleaned up {deleted_logs} old scraper logs.")

            new_jobs, company_logs = run_scraper(db)

            logger.info(f"Background scrape completed successfully. Found {len(new_jobs)} new jobs.")
            raw_logs_str = "\n".join(capture_handler.logs)
            crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS", detailed_logs=json.dumps(company_logs), raw_logs=raw_logs_str)
            notifications.notify_broken_targets(db)
            
            # Send Telegram Success Notification
            from .notifications import send_telegram_message
            send_telegram_message(db, f"✅ Scrape completed successfully. Found {len(new_jobs)} new jobs.")
            
        except Exception as e:
            raw_logs_str = "\n".join(capture_handler.logs)
            crud.update_scraper_log(db, log.id, status="FAILED", error_message=str(e), raw_logs=raw_logs_str)
            logger.error(f"Background scrape failed: {e}")
            notifications.notify_scrape_run_failed(db, str(e), "MANUAL")
    finally:
        logging.getLogger().removeHandler(capture_handler)
        db.close()

@app.post("/api/run-scraper")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if crud.has_running_scrape(db):
        raise HTTPException(status_code=409, detail="A scrape is already running.")
    background_tasks.add_task(bg_scrape_task)
    return {"message": "Scraper started in background"}

@app.websocket("/api/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Include Modular Routers
from .routers import jobs, settings, generation, history, resumes, extension, knowledge
app.include_router(jobs.router)
app.include_router(settings.router)
app.include_router(generation.router)
app.include_router(history.router)
app.include_router(resumes.router)
app.include_router(extension.router)
app.include_router(knowledge.router)
from .routers import health
app.include_router(health.router)
from .routers import crowdsourcing as crowdsourcing_router
app.include_router(crowdsourcing_router.router)
