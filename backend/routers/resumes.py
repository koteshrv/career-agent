import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import logging

from .. import crud, schemas, ai_agent, auth, models
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resumes", tags=["Resumes"])

@router.get("")
def get_resumes(current_user: models.User = Depends(auth.get_current_user)):
    return {"resumes": ai_agent.list_resumes(current_user.id)}

@router.delete("/{name}")
def remove_resume(name: str, current_user: models.User = Depends(auth.get_current_user)):
    if not ai_agent.delete_resume(current_user.id, name):
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"deleted": name, "resumes": ai_agent.list_resumes(current_user.id)}

# Needs to be handled slightly differently due to the path (originally /api/upload-resume)
# I will map it to /api/resumes/upload
@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), name: str = Form(None), db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
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

    file_path = ai_agent._user_resumes_dir(current_user.id) / target
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    settings = crud.get_settings(db, current_user.id)
    resume_text = ai_agent.extract_resume_text(current_user.id, target)
    if resume_text and settings:
        try:
            keywords_json = ai_agent.extract_resume_keywords(
                resume_text,
                api_key=settings.gemini_api_key,
                model_name=settings.gemini_model,
                user_id=current_user.id,
            )
            crud.update_settings(db, current_user.id, schemas.SettingsBase(extracted_keywords=keywords_json))
        except Exception as e:
            logger.error(f"Failed to extract keywords: {e}")

    return {"message": "Resume uploaded successfully", "resumes": ai_agent.list_resumes(current_user.id)}
