import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas, crud, scheduler
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["Settings"])

@router.get("", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)

@router.put("", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db)):
    updated = crud.update_settings(db, settings)
    
    # Update logging level dynamically
    new_level = logging.DEBUG if getattr(updated, "debug_logging_enabled", False) else logging.INFO
    root_logger = logging.getLogger()
    root_logger.setLevel(new_level)
    for handler in root_logger.handlers:
        handler.setLevel(new_level)
        
    if "cron_schedule" in settings.model_dump(exclude_unset=True):
        scheduler.reschedule(updated.cron_schedule)
    return updated
