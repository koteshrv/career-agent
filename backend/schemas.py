from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LoginRequest(BaseModel):
    username: str
    password: str

class BulkStatusRequest(BaseModel):
    ids: List[int]
    status: str

class BulkIdsRequest(BaseModel):
    ids: List[int]

class JobBase(BaseModel):
    company: str
    title: str
    url: str
    location: Optional[str] = None
    description: Optional[str] = None

class JobCreate(JobBase):
    pass

class JobUpdate(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    cover_letter: Optional[str] = None
    tailored_resume: Optional[str] = None
    cold_email: Optional[str] = None
    match_score: Optional[int] = None
    match_reason: Optional[str] = None
    external_id: Optional[str] = None
    yoe: Optional[str] = None
    score_tech_stack: Optional[str] = None
    score_experience: Optional[str] = None
    score_domain: Optional[str] = None
    score_culture: Optional[str] = None
    applied_at: Optional[datetime] = None

class Job(JobBase):
    id: int
    status: str
    notes: Optional[str] = None
    cover_letter: Optional[str] = None
    tailored_resume: Optional[str] = None
    cold_email: Optional[str] = None
    match_score: Optional[int] = None
    match_reason: Optional[str] = None
    external_id: Optional[str] = None
    yoe: Optional[str] = None
    score_tech_stack: Optional[str] = None
    score_experience: Optional[str] = None
    score_domain: Optional[str] = None
    score_culture: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ExtensionPayload(BaseModel):
    url: str
    page_title: str
    description: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None

class ExtensionBatchPayload(BaseModel):
    jobs: List[ExtensionPayload]

class GenerationRequest(BaseModel):
    resume: Optional[str] = None
    generation_mode: Optional[str] = None

class OnDemandRequest(BaseModel):
    company: str
    title: str
    description: str
    resume: Optional[str] = None
    generation_mode: Optional[str] = None
    type: str = "cover_letter" # 'cover_letter' or 'resume'

class SettingsBase(BaseModel):
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_alerts_enabled: Optional[bool] = True
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = "gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro"
    cron_schedule: Optional[str] = "0 */12 * * *"
    trash_retention_days: Optional[int] = 30
    active_companies: Optional[str] = None
    search_keywords: Optional[str] = None
    extracted_keywords: Optional[str] = None
    debug_logging_enabled: Optional[bool] = False
    min_match_score: Optional[int] = 50
    total_prompt_tokens: Optional[int] = 0
    total_candidate_tokens: Optional[int] = 0
    custom_guidelines: Optional[str] = None
    model_telemetry: Optional[str] = None
    api_key_tag: Optional[str] = None
    max_pages: Optional[int] = 3
    
    ai_mode: Optional[str] = "gemini"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    grok_api_key: Optional[str] = None
    ollama_url: Optional[str] = "http://localhost:11434"
    ollama_model: Optional[str] = "llama3"

    career_agent_cloud_token: Optional[str] = None

class Settings(SettingsBase):
    id: int
    class Config:
        from_attributes = True

class ScraperLogBase(BaseModel):
    jobs_found: int
    status: str
    error_message: Optional[str] = None
    trigger_source: str = "MANUAL"
    detailed_logs: Optional[str] = None
    raw_logs: Optional[str] = None

class ScraperLog(ScraperLogBase):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True

class ScraperHealthBase(BaseModel):
    provider_name: str
    status: str
    error_message: Optional[str] = None
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    consecutive_failures: int = 0

class ScraperHealth(ScraperHealthBase):
    class Config:
        from_attributes = True
