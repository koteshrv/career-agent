from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging
import uuid

from backend.database import crud
from backend.core import auth
from backend.database import models
from backend.database.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Base"])

class KnowledgeRequest(BaseModel):
    text: str

@router.get("")
def list_knowledge(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    items = crud.list_knowledge(db, current_user.id)
    return [{"id": item.id, "text": item.text} for item in items]

@router.post("")
def add_knowledge(req: KnowledgeRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    try:
        # Automatically split massive pasted documents into chunks by double newlines
        chunks = [chunk.strip() for chunk in req.text.split("\n\n") if chunk.strip()]

        doc_ids = []
        for chunk in chunks:
            # Skip chunks that are suspiciously small
            if len(chunk) > 10:
                doc_id = str(uuid.uuid4())
                crud.add_knowledge(db, current_user.id, doc_id, chunk)
                doc_ids.append(doc_id)

        return {"ids": doc_ids, "count": len(doc_ids), "text": req.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{doc_id}")
def delete_knowledge(doc_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    try:
        crud.delete_knowledge(db, current_user.id, doc_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
