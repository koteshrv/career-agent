import logging
import json
import asyncio
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import crud
from backend.core import auth
from backend.database import models
from backend.services import ai_agent as agent
from backend.database.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Playbooks"])

@router.post("/api/jobs/{job_id}/playbook/{playbook_name}")
def generate_playbook(job_id: int, playbook_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_job = crud.get_job(db, current_user.id, job_id)
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    settings = crud.get_settings(db, current_user.id)
    user_id = current_user.id
    
    playbook_path = Path(f"backend/prompts/{playbook_name}.md")
    if not playbook_path.exists():
        raise HTTPException(status_code=404, detail="Playbook not found")
        
    playbook_content = playbook_path.read_text(encoding="utf-8")

    async def stream_playbook():
        yield json.dumps({"status": "progress", "message": "Loading Playbook and Knowledge Base..."}) + "\n"
        await asyncio.sleep(0)
        
        try:
            relevant_experience = crud.get_knowledge_text(db, user_id)
        except Exception as e:
            yield json.dumps({"status": "error", "message": f"Error accessing Knowledge Base: {str(e)}"}) + "\n"
            return

        yield json.dumps({"status": "progress", "message": "Executing Playbook..."}) + "\n"
        await asyncio.sleep(0)
        
        prompt = f"""
{playbook_content}

---
# TARGET JOB DETAILS
**Company:** {db_job.company}
**Title:** {db_job.title}
**Location:** {db_job.location or 'Not specified'}
**Job Description:**
{db_job.description or 'No description provided.'}

# CANDIDATE CONTEXT
{relevant_experience or "No background provided."}
"""
        
        try:
            # We use the sync _generate function in a thread to stream. Actually, _generate isn't streaming, it blocks and returns the full string.
            # We'll just run it in a thread and yield the final result.
            result = await asyncio.to_thread(agent._generate, prompt, settings.gemini_api_key, settings.gemini_model, user_id)
            yield json.dumps({"status": "success", "data": result}) + "\n"
        except Exception as e:
            yield json.dumps({"status": "error", "message": f"Playbook execution failed: {str(e)}"}) + "\n"

    return StreamingResponse(stream_playbook(), media_type="application/x-ndjson")
