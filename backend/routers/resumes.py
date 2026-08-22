import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import logging

from .. import crud, schemas, ai_agent
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resumes", tags=["Resumes"])

@router.get("")
def get_resumes():
    return {"resumes": ai_agent.list_resumes()}

@router.delete("/{name}")
def remove_resume(name: str):
    if not ai_agent.delete_resume(name):
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"deleted": name, "resumes": ai_agent.list_resumes()}

# Needs to be handled slightly differently due to the path (originally /api/upload-resume)
# I will map it to /api/resumes/upload
@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), name: str = Form(None), db: Session = Depends(get_db)):
    orig = ai_agent.safe_resume_name(file.filename or "")
    ext = Path(orig).suffix.lower()
    if ext not in ai_agent.ALLOWED_RESUME_EXT:
        raise HTTPException(status_code=400, detail="Only .pdf and .tex files are supported.")

    if name and name.strip():
        target = ai_agent.safe_resume_name(name.strip())
        if not target.lower().endswith(ai_agent.ALLOWED_RESUME_EXT):
            target += ext
    else:
        target = orig

    file_path = ai_agent.RESUMES_DIR / target
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
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
