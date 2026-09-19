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
    elif file.filename.endswith(".txt") or file.filename.endswith(".md"):
        content = await file.read()
        text = content.decode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported for onboarding")

    # Fast heuristic extraction for demo / real use without expensive LLM call first
    # In a real app we might call Gemini/OpenAI here. For now, let's do a basic keyword match
    # to populate 'roles' and 'excludes'.
    # If the user has "Settings", we could also pull their LLM token and use it.
    # To keep it robust without blocking on API key existence, we'll do an LLM call if possible,
    # or fallback to regex.
    
    settings = db.query(models.Settings).filter(models.Settings.user_id == current_user.id).first()
    
    # We will just write a small pseudo-extraction logic here.
    # We look for common keywords in text.
    text_lower = text.lower()
    
    extracted_roles = []
    if "backend" in text_lower or "api" in text_lower or "python" in text_lower:
        extracted_roles.append("Backend Engineer")
    if "frontend" in text_lower or "react" in text_lower:
        extracted_roles.append("Frontend Engineer")
    if "machine learning" in text_lower or "ai" in text_lower or "llm" in text_lower:
        extracted_roles.append("AI Engineer")
    if "data" in text_lower and "pipeline" in text_lower:
        extracted_roles.append("Data Engineer")
        
    if not extracted_roles:
        extracted_roles = ["Software Engineer"]
        
    extracted_excludes = []
    if "senior" in text_lower or "lead" in text_lower or "staff" in text_lower:
        extracted_excludes.extend(["Junior", "Intern", "Internship", "word:Intern"])
    if "java" not in text_lower:
        extracted_excludes.append("Java")
    if ".net" not in text_lower and "c#" not in text_lower:
        extracted_excludes.append(".NET")

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

@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "onboarding_completed": current_user.onboarding_completed,
        "target_roles": json.loads(current_user.target_roles) if current_user.target_roles else [],
        "excludes": json.loads(current_user.excludes) if current_user.excludes else []
    }
