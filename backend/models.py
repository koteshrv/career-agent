from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from .database import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String, index=True)
    title = Column(String, index=True)
    url = Column(String, unique=True, index=True)
    location = Column(String, nullable=True)
    
    # New v3.0 ATS fields
    status = Column(String, default="NEW") # NEW, APPLIED, INTERVIEWING, REJECTED, IGNORED
    notes = Column(Text, nullable=True)
    cover_letter = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    applied_at = Column(DateTime(timezone=True), nullable=True)
