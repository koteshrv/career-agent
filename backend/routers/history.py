from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from .. import schemas, crud
from ..database import get_db
from ..scraper_core import load_targets

router = APIRouter(tags=["History & Companies"])

@router.get("/api/history", response_model=List[schemas.ScraperLog])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_scraper_logs(db, limit=limit)

@router.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
    count = crud.delete_all_scraper_logs(db)
    return {"message": "History cleared", "deleted": count}

@router.get("/api/companies/health")
def get_companies_health(run_limit: int = 20, db: Session = Depends(get_db)):
    return {"targets": crud.get_target_health(db, run_limit=run_limit)}

@router.get("/api/companies")
def get_companies():
    targets = load_targets()
    seen = []
    for t in targets:
        name = t.get("company")
        if name and name not in seen:
            seen.append(name)
    return {"companies": seen}
