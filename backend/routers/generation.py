import logging
import json
import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from .. import crud, schemas, ai_agent
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Generation"])

@router.post("/api/jobs/{job_id}/application-materials")
def generate_application_materials_for_job(job_id: int, req: schemas.GenerationRequest, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = crud.get_settings(db)
    
    async def stream_and_save():
        gen = ai_agent.generate_application_materials(
            db_job.title, db_job.company, db_job.location or "", db_job.description or "",
            api_key=settings.gemini_api_key, model_name=settings.gemini_model, resume_name=req.resume,
            generation_mode=req.generation_mode
        )
        async for chunk in gen:
            yield chunk
            try:
                data = json.loads(chunk.strip())
                if data.get("status") == "success":
                    materials = data.get("data", {})
                    crud.update_job_status(db, job_id, schemas.JobUpdate(
                        cover_letter=materials.get("cover_letter", ""),
                        cold_email=materials.get("cold_email", ""),
                        tailored_resume=materials.get("tailored_resume", "")
                    ))
            except Exception:
                pass
                
    return StreamingResponse(stream_and_save(), media_type="application/x-ndjson")

@router.post("/api/generate/on-demand")
def generate_on_demand(req: schemas.OnDemandRequest, db: Session = Depends(get_db)):
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    model_name = settings.gemini_model if settings else None
    
    clean_desc = ai_agent.sanitize_job_description(req.description, api_key)

    gen = ai_agent.generate_application_materials(
        req.title, req.company, "", clean_desc,
        api_key=api_key, model_name=model_name, resume_name=req.resume,
        generation_mode=req.generation_mode
    )
    
    return StreamingResponse(gen, media_type="application/x-ndjson")

# A hallucinated runaway macro can spin pdflatex forever. -interaction=nonstopmode stops
# it waiting on input, but not a genuine infinite loop, which would pin a worker thread.
LATEX_TIMEOUT_SECONDS = 60


def _compile_latex_to_pdf(latex_content: str, download_name: str) -> FileResponse:
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
                timeout=LATEX_TIMEOUT_SECONDS,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="pdflatex is not installed on the server.")
        except subprocess.TimeoutExpired:
            logger.error(f"LaTeX compilation timed out after {LATEX_TIMEOUT_SECONDS}s.")
            raise HTTPException(
                status_code=500,
                detail=f"PDF compilation timed out after {LATEX_TIMEOUT_SECONDS}s — the generated LaTeX is likely malformed.",
            )
        except subprocess.CalledProcessError as e:
            logger.error(f"LaTeX compilation failed: {e.stdout.decode(errors='ignore')} {e.stderr.decode(errors='ignore')}")
            # ENHANCEMENT: Returning the raw latex output to help users debug
            raise HTTPException(status_code=500, detail=f"Failed to compile PDF from LaTeX. Error: {e.stdout.decode(errors='ignore')}")

        pdf_path = Path(tmpdir) / "resume.pdf"
        if not pdf_path.exists():
            raise HTTPException(status_code=500, detail="PDF file was not generated")

        # The PDF has to outlive this TemporaryDirectory to be streamed back, so it's copied
        # to a uniquely-named file that a BackgroundTask deletes once the response is sent.
        # A fixed name here would both collide between concurrent requests and leave every
        # generated resume sitting in a world-readable /tmp forever.
        fd, out_path = tempfile.mkstemp(prefix="careeragent_resume_", suffix=".pdf")
        os.close(fd)
        shutil.copy(pdf_path, out_path)

    return FileResponse(
        path=out_path,
        media_type="application/pdf",
        filename=download_name,
        background=BackgroundTask(os.remove, out_path),
    )

from pydantic import BaseModel
class OnDemandPdfRequest(BaseModel):
    latex_content: str
    company: str

@router.post("/api/generate/on-demand/pdf")
def generate_on_demand_pdf(req: OnDemandPdfRequest):
    return _compile_latex_to_pdf(
        req.latex_content,
        f"{req.company}_Resume.pdf",
    )

@router.get("/api/jobs/{job_id}/resume/pdf")
def get_resume_pdf(job_id: int, db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or not db_job.tailored_resume:
        raise HTTPException(status_code=404, detail="Tailored resume not found for this job")

    return _compile_latex_to_pdf(
        db_job.tailored_resume,
        f"{db_job.company}_Resume.pdf",
    )
