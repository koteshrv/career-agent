from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from .tasks import task_manager
from .config import config
import asyncio
from contextlib import asynccontextmanager
from collections import deque
import json
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import logging
import logging.handlers

# Enterprise Grade Logging Setup
_raw_level = config["log_level"].upper()
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
        
        # Send initial task sync for persistence across reloads
        import json
        tasks = task_manager.get_all_tasks()
        if tasks:
            await websocket.send_text(json.dumps({"type": "TASK_SYNC", "tasks": tasks}))
            
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

async def _broadcast_task(task: dict):
    import json
    await manager.broadcast(json.dumps({"type": "TASK_UPDATE", "task": task}))






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
            # Process-wide log level, so it's tied to the bootstrap admin's own setting
            # (scheduler.ADMIN_USER_ID) rather than any particular request's user.
            settings = crud.get_settings(db, scheduler.ADMIN_USER_ID)
            is_debug = getattr(settings, "debug_logging_enabled", False)
        logging.getLogger().setLevel(logging.DEBUG if is_debug else logging.INFO)

        loop = asyncio.get_running_loop()
        task_manager.set_broadcast_callback(_broadcast_task, loop)
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

PUBLIC_PATHS = {"/api/login", "/api/auth/sso", "/api/ws/logs", "/healthz"}

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api") or path in PUBLIC_PATHS:
            return await call_next(request)
        authz = request.headers.get("Authorization", "")
        token = authz[7:] if authz.startswith("Bearer ") else ""
        payload = auth.decode_token(token)
        if not payload:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        request.state.user_id = payload["uid"]
        request.state.role = payload.get("role")
        return await call_next(request)

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/login")
def login(creds: schemas.LoginRequest, db: Session = Depends(get_db)):
    if not auth.check_credentials(creds.username, creds.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user = db.query(models.User).filter(models.User.role == "ADMIN", models.User.auth_method == "local").first()
    if not user:
        raise HTTPException(status_code=500, detail="Admin user not found — run backend/migrate_v7_users.py")
    return {"token": auth.create_token(user)}

def bg_scrape_task(user_id: int):
    db = SessionLocal()
    capture_handler = RunLogCaptureHandler()
    capture_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(capture_handler)
    try:
        log = crud.create_scraper_log(db, user_id, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
        try:
            deleted_logs = crud.delete_old_scraper_logs(db, user_id, 14)
            if deleted_logs > 0:
                logger.info(f"Cleaned up {deleted_logs} old scraper logs.")

            new_jobs, company_logs = run_scraper(db, user_id)

            logger.info(f"Background scrape completed successfully. Found {len(new_jobs)} new jobs.")
            raw_logs_str = "\n".join(capture_handler.logs)
            crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS", detailed_logs=json.dumps(company_logs), raw_logs=raw_logs_str)
            notifications.notify_broken_targets(db, user_id)

            # Send Telegram Success Notification
            from .notifications import send_telegram_message
            send_telegram_message(db, user_id, f"✅ Scrape completed successfully. Found {len(new_jobs)} new jobs.")

        except Exception as e:
            raw_logs_str = "\n".join(capture_handler.logs)
            crud.update_scraper_log(db, log.id, status="FAILED", error_message=str(e), raw_logs=raw_logs_str)
            logger.error(f"Background scrape failed: {e}")
            notifications.notify_scrape_run_failed(db, user_id, str(e), "MANUAL")
    finally:
        logging.getLogger().removeHandler(capture_handler)
        db.close()

@app.post("/api/run-scraper")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if crud.has_running_scrape(db, current_user.id):
        raise HTTPException(status_code=409, detail="A scrape is already running.")
    background_tasks.add_task(bg_scrape_task, current_user.id)
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
from .routers import users as users_router
app.include_router(users_router.router)
