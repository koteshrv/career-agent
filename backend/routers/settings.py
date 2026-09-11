import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas, crud, scheduler, auth, models
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["Settings"])

@router.get("", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_settings(db, current_user.id)

@router.put("", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    updated = crud.update_settings(db, current_user.id, settings)

    # Update logging level dynamically
    new_level = logging.DEBUG if getattr(updated, "debug_logging_enabled", False) else logging.INFO
    root_logger = logging.getLogger()
    root_logger.setLevel(new_level)
    for handler in root_logger.handlers:
        handler.setLevel(new_level)

    # The automatic cron schedule is still a single global job scoped to the admin (see
    # scheduler.py) until per-user scheduling multiplexing lands — a non-admin's own
    # cron_schedule is saved to their Settings row but has no live effect yet.
    if current_user.role == "ADMIN" and "cron_schedule" in settings.model_dump(exclude_unset=True):
        scheduler.reschedule(updated.cron_schedule)
    return updated
