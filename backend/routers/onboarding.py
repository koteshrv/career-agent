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
    
    # We will call the AI model to perform the extraction
    from backend.services.ai_agent import _route_generation, strip_code_fences
    
    prompt = """
    Analyze the following resume and extract the core job titles the candidate is best suited for, as well as strict exclusionary keywords (e.g., if they are Senior, exclude "Junior", "Intern". Also exclude tech stacks they clearly don't use if they are highly specialized, like excluding "Java" if they only use Python).
    
    Return EXACTLY a JSON object with this structure, and absolutely nothing else:
    {
      "roles": ["Role 1", "Role 2"],
      "excludes": ["Exclude 1", "Exclude 2"]
    }
    
    Resume:
    """ + text[:4000]

    extracted_roles = []
    extracted_excludes = []
    try:
        model_to_use = settings.ai_mode if (settings and settings.ai_mode and settings.ai_mode.startswith("cli_")) else (settings.gemini_model if settings else None)
        api_key = settings.gemini_api_key if settings else None
        
        result_str = _route_generation(prompt, model_to_use or "gemini", settings, is_tex=False, is_cl=False, user_id=current_user.id)
        
        if not result_str.startswith("Error"):
            clean_json = strip_code_fences(result_str)
            parsed = json.loads(clean_json)
            extracted_roles = parsed.get("roles", [])
            extracted_excludes = parsed.get("excludes", [])
    except Exception as e:
        print(f"AI parsing failed: {e}")
        # fallback to basic
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
