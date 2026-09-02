from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import ScraperHealth
from ..schemas import ScraperHealth as ScraperHealthSchema
from ..scraper_core import run_scraper
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/system",
    tags=["system_health"]
)

@router.get("/scraper-health", response_model=List[ScraperHealthSchema])
def get_scraper_health(db: Session = Depends(get_db)):
    """Fetch health data for all scraper integrations."""
    from ..sources.common import load_targets
    db_health = {h.provider_name: h for h in db.query(ScraperHealth).all()}
    all_targets = load_targets()
    
    results = []
    seen = set()
    for t in all_targets:
        company = t.get("company")
        if not company or company in seen:
            continue
        seen.add(company)
        
        if company in db_health:
            results.append(db_health[company])
        else:
            results.append({
                "provider_name": company,
                "status": "UNKNOWN",
                "error_message": None,
                "last_run_at": None,
                "last_success_at": None,
                "consecutive_failures": 0
            })
            
    for company, h in db_health.items():
        if company not in seen:
            results.append(h)
            
    return results

def run_health_check_background(db: Session, target_name: str = None):
    """
    Runs the scraper pipeline purely to update health metrics. 
    Can be scoped to a single target or all targets.
    """
    logger.info(f"Running On-Demand Health Check. Target: {target_name if target_name else 'ALL'}")
    try:
        run_scraper(db, target_name=target_name)
    except Exception as e:
        logger.error(f"On-Demand check failed: {e}")

from pydantic import BaseModel
class HealthCheckRequest(BaseModel):
    provider_name: str = None

@router.post("/scraper-health/check")
def trigger_health_check(request: HealthCheckRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Force triggers an on-demand run of the scraper to evaluate health metrics.
    """
    background_tasks.add_task(run_health_check_background, db, request.provider_name)
    return {"status": "On-demand health check started in background"}

