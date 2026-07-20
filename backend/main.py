from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, WebSocket, WebSocketDisconnect
import asyncio
from contextlib import asynccontextmanager
from collections import deque
import shutil
from pathlib import Path
from pydantic import BaseModel
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import subprocess
import tempfile
import os
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from typing import List
import logging
import logging.handlers

# Enterprise Grade Logging Setup
# Set LOG_LEVEL=DEBUG (or VERBOSE) in environment for verbose output during development.
_raw_level = os.environ.get("LOG_LEVEL", "INFO").upper()
_log_level = logging.DEBUG if _raw_level in ("DEBUG", "VERBOSE") else logging.INFO

root_logger = logging.getLogger()
root_logger.setLevel(_log_level)
root_logger.handlers = [] # Clear default handlers

log_format = '%(asctime)s | %(levelname)-8s | [%(name)s:%(lineno)d] | %(message)s'
formatter = logging.Formatter(log_format)

# Console Output
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

# Rotating File Output (Max 10MB, Keep 5 backups)
file_handler = logging.handlers.RotatingFileHandler('backend.log', maxBytes=10*1024*1024, backupCount=5)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

if _log_level == logging.DEBUG:
    logging.getLogger("httpx").setLevel(logging.INFO)          # suppress httpx byte-level noise
    logging.getLogger("google_genai").setLevel(logging.INFO)   # suppress SDK internal noise
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # suppress per-request HTTP logs



from . import models, schemas, crud, scheduler, ai_agent, auth, notifications
from .database import engine, get_db, SessionLocal
import json
from .scraper_core import run_scraper, load_targets, fetch_job_description, record_job
from .ai_agent import generate_application_materials

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
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

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    try:
        with SessionLocal() as db:
            settings = crud.get_settings(db)
            is_debug = getattr(settings, "debug_logging_enabled", False)
        logging.getLogger().setLevel(logging.DEBUG if is_debug else logging.INFO)

        # Stream logs to connected WebSocket clients. The console/file handlers are
        # already installed at import time — don't add more here or logs duplicate.
        loop = asyncio.get_running_loop()
        ws_handler = WebSocketLogHandler(manager, loop)
        ws_handler.setLevel(logging.DEBUG if is_debug else logging.INFO)
        logging.getLogger().addHandler(ws_handler)
    except Exception as e:
        logger.error(f"Failed to attach WS logger: {e}")

    # Clean up any RUNNING logs orphaned by a previous crash/restart.
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

    # --- Shutdown ---
    if scheduler.scheduler.running:
        scheduler.scheduler.shutdown(wait=False)


app = FastAPI(title="Job Scraper ATS API", lifespan=lifespan)

@app.get("/healthz")
def health_check():
    return {"status": "ok"}

# Paths reachable without a valid auth token.
PUBLIC_PATHS = {"/api/login", "/api/ws/logs", "/healthz"}

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

# Added before CORS so CORS stays the outermost layer (it must add headers even
# to 401 responses, or the browser can't read them).
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Auth is via a Bearer token header, not cookies. Credentials must be False for
    # a wildcard origin to be valid (browsers reject "*" + credentials).
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/login")
def login(creds: schemas.LoginRequest):
    if not auth.check_credentials(creds.username, creds.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": auth.create_token(creds.username)}

def bg_scrape_task():
    # Owns its own session — a request-scoped session would be closed before this
    # long-running background task finishes.
    db = SessionLocal()
    capture_handler = RunLogCaptureHandler()
    capture_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(capture_handler)
    try:
        # Log a RUNNING entry immediately so it shows up in history right away.
        log = crud.create_scraper_log(db, schemas.ScraperLogBase(jobs_found=0, status="RUNNING", trigger_source="MANUAL"))
        try:
            # Clean old scraper logs (14 days)
            deleted_logs = crud.delete_old_scraper_logs(db, 14)
            if deleted_logs > 0:
                logger.info(f"Cleaned up {deleted_logs} old scraper logs.")

            new_jobs, company_logs = run_scraper(db)

            logger.info(f"Background scrape completed successfully. Found {len(new_jobs)} new jobs.")
            raw_logs_str = "\n".join(capture_handler.logs)
            crud.update_scraper_log(db, log.id, jobs_found=len(new_jobs), status="SUCCESS", detailed_logs=json.dumps(company_logs), raw_logs=raw_logs_str)
            notifications.notify_broken_targets(db)
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
    # Cron and manual triggers can otherwise overlap and hit SQLite write contention
    # ("database is locked"), plus double-count/duplicate jobs mid-run.
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

@app.get("/api/jobs", response_model=List[schemas.Job])
def read_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, skip=skip, limit=limit)
    return jobs

@app.delete("/api/jobs")
def clear_jobs(db: Session = Depends(get_db)):
    count = crud.delete_all_jobs(db)
    return {"deleted": count}

@app.post("/api/jobs/bulk-status")
def bulk_status(req: schemas.BulkStatusRequest, db: Session = Depends(get_db)):
    count = crud.bulk_update_status(db, req.ids, req.status)
    return {"updated": count}

@app.post("/api/jobs/bulk-delete")
def bulk_delete(req: schemas.BulkIdsRequest, db: Session = Depends(get_db)):
    count = crud.bulk_delete_jobs(db, req.ids)
    return {"deleted": count}

@app.delete("/api/jobs/{job_id}")
def remove_job(job_id: int, db: Session = Depends(get_db)):
    if not crud.delete_job(db, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"deleted": 1}

@app.delete("/api/jobs/trash/empty")
def empty_trash(db: Session = Depends(get_db)):
    count = crud.empty_trash(db)
    return {"deleted": count}

@app.put("/api/jobs/{job_id}", response_model=schemas.Job)
def update_job(job_id: int, job_update: schemas.JobUpdate, db: Session = Depends(get_db)):
    db_job = crud.update_job_status(db, job_id, job_update)
    if db_job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return db_job

def _extension_location_tag(url: str) -> str:
    """Build the "Manual - Extension (Site)" source tag from a job URL's domain."""
    import urllib.parse
    try:
        domain = urllib.parse.urlparse(url).netloc
        parts = domain.replace("www.", "").split(".")
        site_name = parts[-2].capitalize() if len(parts) >= 2 else domain
    except Exception:
        site_name = "Extension"
    return f"Manual - Extension ({site_name})"

def process_batch_background(payloads: List[schemas.ExtensionPayload], settings: schemas.Settings):
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None

    # Get a fresh DB session for the background task
    db_gen = get_db()
    db = next(db_gen)

    jobs_to_evaluate = []

    chunk_size = 5
    for i in range(0, len(payloads), chunk_size):
        chunk = payloads[i:i + chunk_size]

        jobs_for_ai = [{"description": p.description, "url": p.url} for p in chunk]
        ai_results = ai_agent.batch_extract_job_details(jobs_for_ai, api_key, model_name)

        for j, payload in enumerate(chunk):
            try:
                location_tag = _extension_location_tag(payload.url)

                ai_company = ai_results[j].get("company", "Unknown Company")
                ai_title = ai_results[j].get("title", "Unknown Title")
                clean_desc = ai_results[j].get("clean_description", payload.description)
                
                company = payload.company.strip() if payload.company else ""
                title = payload.title.strip() if payload.title else ""
                
                if not company or company == "Unknown Company":
                    company = ai_company
                if not title or title == payload.page_title or title == "LinkedIn" or title == "Search":
                    title = ai_title
                    
                if not company: company = "Unknown Company"
                if not title: title = payload.page_title
                
                job = record_job(db, company, title, payload.url, location_tag)
                db.commit()
                db.refresh(job)
                
                update_data = {
                    "description": clean_desc, "location": location_tag,
                    "company": company, "title": title
                }
                job_update = schemas.JobUpdate(**update_data)
                crud.update_job_status(db, job.id, job_update)
                db.refresh(job)
                
                jobs_to_evaluate.append({"url": job.url})
            except Exception as e:
                logger.error(f"Failed background extension job: {e}")
                
    if jobs_to_evaluate:
        from .scraper_core import bulk_evaluate_jobs
        try:
            bulk_evaluate_jobs(db, jobs_to_evaluate)
        except Exception as e:
            logger.error(f"Failed to evaluate background jobs: {e}")
            
    try:
        next(db_gen)
    except StopIteration:
        pass

@app.post("/api/jobs/extension/batch")
def save_from_extension_batch(payload: schemas.ExtensionBatchPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    settings = crud.get_settings(db)
    background_tasks.add_task(process_batch_background, payload.jobs, settings)
    return {"status": "processing"}

@app.get("/api/jobs/extension/parse-title")
def parse_title_endpoint(page_title: str, db: Session = Depends(get_db)):
    """Used by Chrome extension to pre-parse the title before user saves it."""
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None
    parsed = ai_agent.parse_job_page_title(page_title, api_key, model_name)
    return parsed

@app.post("/api/jobs/extension", response_model=schemas.Job)
def save_from_extension(payload: schemas.ExtensionPayload, db: Session = Depends(get_db)):
    """Receives a job scraped by the Chrome Extension."""
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None

    location_tag = _extension_location_tag(payload.url)

    # Clean description using AI
    clean_desc = ai_agent.sanitize_job_description(payload.description, api_key)

    company = payload.company.strip() if payload.company else ""
    title = payload.title.strip() if payload.title else ""
    
    if not company or company == "Unknown Company":
        parsed = ai_agent.parse_job_page_title(payload.page_title, api_key, model_name)
        company = parsed.get("company", "Unknown Company")
        if not title or title == payload.page_title:
            title = parsed.get("title", payload.page_title)
            
        # If it's still missing or we know it's a feed post (title is "LinkedIn"), ask AI to parse the description
        if (company == "Unknown Company" or title == "LinkedIn" or title == "Search") and payload.description:
            parsed_desc = ai_agent.extract_job_details_from_description(payload.description, api_key, model_name)
            if parsed_desc:
                if company == "Unknown Company" and parsed_desc.get("company") and parsed_desc.get("company") != "Unknown Company":
                    company = parsed_desc.get("company")
                if (title == "LinkedIn" or title == "Search" or title == payload.page_title) and parsed_desc.get("title") and parsed_desc.get("title") != "Unknown Title":
                    title = parsed_desc.get("title")
            
    if not company:
        company = "Unknown Company"
    if not title:
        title = payload.page_title

    # Save to Kanban
    job = record_job(db, company, title, payload.url, location_tag)
    db.commit()
    db.refresh(job)
    
    # Always overwrite the card values with the latest parsed/user-edited values
    update_data = {
        "description": clean_desc,
        "location": location_tag,
        "company": company,
        "title": title
    }
    job_update = schemas.JobUpdate(**update_data)
    crud.update_job_status(db, job.id, job_update)
    db.refresh(job)
    return job

@app.get("/api/settings", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)

@app.put("/api/settings", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db)):
    updated = crud.update_settings(db, settings)
    
    # Update logging level dynamically
    new_level = logging.DEBUG if getattr(updated, "debug_logging_enabled", False) else logging.INFO
    root_logger = logging.getLogger()
    root_logger.setLevel(new_level)
    for handler in root_logger.handlers:
        handler.setLevel(new_level)
        
    if "cron_schedule" in settings.model_dump(exclude_unset=True):
        scheduler.reschedule(updated.cron_schedule)
    return updated

@app.get("/api/history", response_model=List[schemas.ScraperLog])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_scraper_logs(db, limit=limit)

@app.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
    count = crud.delete_all_scraper_logs(db)
    return {"message": "History cleared", "deleted": count}

@app.get("/api/companies/health")
def get_companies_health(run_limit: int = 20, db: Session = Depends(get_db)):
    """Per-company scrape health rollup, surfacing targets that are repeatedly
    failing (e.g. a site's markup changed) instead of silently showing 0 jobs."""
    return {"targets": crud.get_target_health(db, run_limit=run_limit)}

@app.get("/api/companies")
def get_companies():
    """Distinct companies available in targets.json, for the sidebar selector."""
    targets = load_targets()
    seen = []
    for t in targets:
        name = t.get("company")
        if name and name not in seen:
            seen.append(name)
    return {"companies": seen}

@app.get("/api/resumes")
def get_resumes():
    return {"resumes": ai_agent.list_resumes()}

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...), name: str = Form(None), db: Session = Depends(get_db)):
    orig = ai_agent.safe_resume_name(file.filename or "")
    ext = Path(orig).suffix.lower()
    if ext not in ai_agent.ALLOWED_RESUME_EXT:
        raise HTTPException(status_code=400, detail="Only .pdf and .tex files are supported.")

    # Optional custom name; keep the original extension if the user omits it.
    if name and name.strip():
        target = ai_agent.safe_resume_name(name.strip())
        if not target.lower().endswith(ai_agent.ALLOWED_RESUME_EXT):
            target += ext
    else:
        target = orig

    file_path = ai_agent.RESUMES_DIR / target
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract keywords using AI in the background, or do it inline
    settings = crud.get_settings(db)
    resume_text = ai_agent.extract_resume_text(target)
    if resume_text and settings:
        try:
            keywords_json = ai_agent.extract_resume_keywords(
                resume_text, 
                api_key=settings.gemini_api_key, 
                model_name=settings.gemini_model
            )
            crud.update_settings(db, schemas.SettingsBase(extracted_keywords=keywords_json))
        except Exception as e:
            logger.error(f"Failed to extract keywords: {e}")

    return {"message": "Resume uploaded successfully", "resumes": ai_agent.list_resumes()}

@app.delete("/api/resumes/{name}")
def remove_resume(name: str):
    if not ai_agent.delete_resume(name):
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"deleted": name, "resumes": ai_agent.list_resumes()}

@app.post("/api/jobs/{job_id}/application-materials")
def generate_application_materials_for_job(job_id: int, req: schemas.GenerationRequest, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = crud.get_settings(db)
    result = ai_agent.generate_application_materials(
        db_job.title, db_job.company, db_job.location or "", db_job.description or "",
        api_key=settings.gemini_api_key, model_name=settings.gemini_model, resume_name=req.resume,
        generation_mode=req.generation_mode
    )
    
    if "error" in result:
        logger.error(f"Generate on-demand failed: {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])

    db_job = crud.update_job_status(db, job_id, schemas.JobUpdate(
        cover_letter=result["cover_letter"],
        cold_email=result["cold_email"],
        tailored_resume=result["tailored_resume"]
    ))
    return {
        "cover_letter": result["cover_letter"],
        "cold_email": result["cold_email"],
        "tailored_resume": result["tailored_resume"]
    }

@app.post("/api/generate/on-demand")
def generate_on_demand(req: schemas.OnDemandRequest, db: Session = Depends(get_db)):
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None
    
    # Pre-clean the description in case it's huge or has HTML
    clean_desc = ai_agent.sanitize_job_description(req.description, api_key)

    result = ai_agent.generate_application_materials(
        req.title, req.company, "", clean_desc,
        api_key=api_key, model_name=model_name, resume_name=req.resume,
        generation_mode=req.generation_mode
    )
    
    if "error" in result:
        logger.error(f"Generate on-demand failed: {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])

    if req.type == "cover_letter":
        return {"content": result.get("cover_letter", "")}
    elif req.type == "resume":
        return {"content": result.get("tailored_resume", "")}
    else:
        raise HTTPException(status_code=400, detail="Invalid generation type")

class OnDemandPdfRequest(BaseModel):
    latex_content: str
    company: str

def _compile_latex_to_pdf(latex_content: str, out_basename: str, download_name: str) -> FileResponse:
    """Compile LaTeX source to a PDF and return it as a download.

    `-no-shell-escape` is passed explicitly to block LaTeX's \\write18 shell
    execution on user-supplied source.
    """
    if not latex_content or not latex_content.strip():
        raise HTTPException(status_code=400, detail="No LaTeX content provided")

    clean_tex = ai_agent.strip_code_fences(latex_content)

    with tempfile.TemporaryDirectory() as tmpdir:
        (Path(tmpdir) / "resume.tex").write_text(clean_tex)
        try:
            subprocess.run(
                ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "resume.tex"],
                cwd=tmpdir, check=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="pdflatex is not installed on the server.")
        except subprocess.CalledProcessError as e:
            logger.error(f"LaTeX compilation failed: {e.stdout.decode(errors='ignore')} {e.stderr.decode(errors='ignore')}")
            raise HTTPException(status_code=500, detail="Failed to compile PDF from LaTeX")

        pdf_path = Path(tmpdir) / "resume.pdf"
        if not pdf_path.exists():
            raise HTTPException(status_code=500, detail="PDF file was not generated")

        # Copy out of the tempdir so the file survives for FileResponse to stream.
        out_path = Path(tempfile.gettempdir()) / out_basename
        shutil.copy(pdf_path, out_path)

    return FileResponse(path=out_path, media_type="application/pdf", filename=download_name)

@app.post("/api/generate/on-demand/pdf")
def generate_on_demand_pdf(req: OnDemandPdfRequest):
    return _compile_latex_to_pdf(
        req.latex_content,
        f"resume_ondemand_{abs(hash(req.company))}.pdf",
        f"{req.company}_Resume.pdf",
    )

@app.get("/api/jobs/{job_id}/resume/pdf")
def get_resume_pdf(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or not db_job.tailored_resume:
        raise HTTPException(status_code=404, detail="Tailored resume not found for this job")

    return _compile_latex_to_pdf(
        db_job.tailored_resume,
        f"resume_{job_id}.pdf",
        f"{db_job.company}_Resume.pdf",
    )

@app.post("/api/jobs/{job_id}/fetch-jd")
async def fetch_jd(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not db_job.url:
        raise HTTPException(status_code=400, detail="Job has no URL")
        
    try:
        description = await fetch_job_description(db_job.url)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
        
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    clean_desc = ai_agent.sanitize_job_description(description, api_key)
        
    db_job = crud.update_job_status(db, job_id, schemas.JobUpdate(description=clean_desc))
    return {"description": clean_desc}
