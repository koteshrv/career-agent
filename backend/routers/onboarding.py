from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from backend.database.database import get_db
from backend.database import models
from backend.core.auth import get_current_user
import PyPDF2
import json
import os
import re

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    text = ""
    if file.filename.endswith(".pdf"):
        try:
            reader = PyPDF2.PdfReader(file.file)
            for page in reader.pages:
                text += page.extract_text() + "\n"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
    elif file.filename.endswith(".txt") or file.filename.endswith(".md") or file.filename.endswith(".tex"):
        content = await file.read()
        text = content.decode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Only PDF, TXT, MD, and TEX files are supported for onboarding")

    settings = db.query(models.Settings).filter(models.Settings.user_id == current_user.id).first()
    
    from backend.services.ai_agent import onboard_resume
    
    extracted_roles = []
    extracted_excludes = []
    
    try:
        model_name = settings.gemini_model if settings else None
        api_key = settings.gemini_api_key if settings else None
        
        parsed = onboard_resume(text[:4000], api_key, model_name, current_user.id)
        extracted_roles = parsed.get("target_roles", parsed.get("roles", []))
        extracted_excludes = parsed.get("excludes", [])
    except Exception as e:
        print(f"AI parsing failed: {e}")
    
    if not extracted_roles:
        extracted_roles = ["Software Engineer"]

    current_user.resume_text = text
    current_user.target_roles = json.dumps(list(set(extracted_roles)))
    current_user.excludes = json.dumps(list(set(extracted_excludes)))
    current_user.onboarding_completed = True
    db.commit()
    
    return {
        "status": "success",
        "target_roles": extracted_roles,
        "excludes": extracted_excludes
    }


@router.post("/skip")
def skip_onboarding(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.onboarding_completed = True
    db.commit()
    return {"status": "success"}

@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "onboarding_completed": current_user.onboarding_completed,
        "target_roles": json.loads(current_user.target_roles) if current_user.target_roles else [],
        "excludes": json.loads(current_user.excludes) if current_user.excludes else []
    }
