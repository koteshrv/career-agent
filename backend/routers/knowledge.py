from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging

from .. import crud
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Base"])

class KnowledgeRequest(BaseModel):
    text: str

@router.get("")
def list_knowledge():
    from .. import rag_engine
    return rag_engine.list_context()

@router.post("")
def add_knowledge(req: KnowledgeRequest, db: Session = Depends(get_db)):
    settings = crud.get_settings(db)
    api_key = settings.gemini_api_key if settings else None
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is required to add knowledge")
        
    from .. import rag_engine
    try:
        # Automatically split massive pasted documents into chunks by double newlines
        chunks = [chunk.strip() for chunk in req.text.split("\n\n") if chunk.strip()]
        
        doc_ids = []
        for chunk in chunks:
            # Skip chunks that are suspiciously small (like single random characters)
            if len(chunk) > 10:
                doc_id = rag_engine.ingest_context(chunk, api_key)
                doc_ids.append(doc_id)
                
        return {"ids": doc_ids, "count": len(doc_ids), "text": req.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{doc_id}")
def delete_knowledge(doc_id: str):
    from .. import rag_engine
    try:
        rag_engine.remove_context(doc_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
