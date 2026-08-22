import os
import logging
import json
import requests
from google import genai
import PyPDF2
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import HTTPException
import time
import asyncio

try:
    from ollama import Client as OllamaClient
except ImportError:
    OllamaClient = None

load_dotenv()

import threading
from collections import deque

logger = logging.getLogger(__name__)

# --- Precise Sliding Window Rate Limiter ---
_request_timestamps = deque()
_rate_limit_lock = threading.Lock()

def _enforce_rpm_limit_sync(rpm: int = 14):
    """Ensure we do not exceed 'rpm' requests per 60 seconds."""
    with _rate_limit_lock:
        now = time.time()
        # Remove timestamps older than 60 seconds
        while _request_timestamps and now - _request_timestamps[0] > 60:
            _request_timestamps.popleft()
            
        if len(_request_timestamps) >= rpm:
            sleep_time = 60 - (now - _request_timestamps[0])
            if sleep_time > 0:
                logger.info(f"[RateLimit] RPM sliding window full ({len(_request_timestamps)} reqs). Sleeping for {sleep_time:.2f}s...")
                time.sleep(sleep_time)
                # After sleeping, the oldest request falls out.
                _request_timestamps.popleft()
                _request_timestamps.append(time.time())
                return
        _request_timestamps.append(time.time())

# --- DB-backed rate limit state (for hard 429 penalties) ---
# Stores rate_limited_until (unix timestamp) inside model_telemetry JSON per model.
# Survives server restarts unlike an in-memory dict.

def _is_rate_limited(model: str) -> bool:
    """Check DB to see if this model is still in its rate-limit cooldown window."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings and settings.model_telemetry:
            telemetry = json.loads(settings.model_telemetry)
            entry = telemetry.get(model, {})
            until = entry.get("rate_limited_until", 0)
            if time.time() < until:
                remaining = int(until - time.time())
                logger.info(f"[RateLimit] {model} is DB-rate-limited for {remaining}s more.")
                return True
    except Exception:
        pass
    finally:
        db.close()
    return False

def _set_rate_limit(model: str, seconds: int = 60):
    """Persist a rate-limit cooldown for this model in DB model_telemetry."""
    from .database import SessionLocal
    from . import models as _models
    db = SessionLocal()
    try:
        settings = db.query(_models.Settings).first()
        if settings:
            telemetry = {}
            if settings.model_telemetry:
                try:
                    telemetry = json.loads(settings.model_telemetry)
                except Exception:
                    telemetry = {}
            if model not in telemetry:
                telemetry[model] = {}
            telemetry[model]["rate_limited_until"] = time.time() + seconds
            settings.model_telemetry = json.dumps(telemetry)
            db.commit()
            logger.info(f"[RateLimit] {model} marked rate-limited in DB for {seconds}s.")
    except Exception as e:
        logger.error(f"Failed to persist rate limit for {model}: {e}")
    finally:
        db.close()

# Single source of truth for the default Gemini model chain. Used as the DB-unreachable
# emergency fallback and whenever a caller doesn't pass an explicit model.
DEFAULT_MODEL_CHAIN = "gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro"

# Emergency fallback used ONLY if the DB is completely unreachable at runtime.
# This is NOT the intended configuration path — use the Settings UI to set your model chain.
_EMERGENCY_FALLBACK_MODEL = DEFAULT_MODEL_CHAIN
ENV_API_KEY = os.getenv("GEMINI_API_KEY")


def strip_code_fences(text: str) -> str:
    """Remove a leading/trailing Markdown code fence (``` or ```json) from LLM output."""
    if not text:
        return text
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        clean = "\n".join(lines).strip()
    return clean

# Substrings that indicate retrying a different model won't help (auth/config issues).
_FATAL_ERROR_HINTS = ("api key not valid", "api_key_invalid", "permission denied", "unauthenticated")

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
RESUMES_DIR = UPLOAD_DIR / "resumes"
RESUMES_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_RESUME_EXT = (".pdf", ".tex")

# Migrate a legacy single resume.pdf into the resumes/ directory.
_legacy_resume = UPLOAD_DIR / "resume.pdf"
if _legacy_resume.exists() and not any(RESUMES_DIR.iterdir()):
    _legacy_resume.rename(RESUMES_DIR / "resume.pdf")

def safe_resume_name(name: str) -> str:
    """Strip any directory components from an uploaded filename."""
    return Path(name).name

def list_resumes() -> list:
    return sorted(p.name for p in RESUMES_DIR.glob("*") if p.suffix.lower() in ALLOWED_RESUME_EXT)

def _resume_path(name: str = None):
    files = list_resumes()
    if not files:
        return None
    if name:
        n = safe_resume_name(name)
        return RESUMES_DIR / n if n in files else None
    return RESUMES_DIR / files[0]

def delete_resume(name: str) -> bool:
    path = _resume_path(name)
    if path and path.exists():
        path.unlink()
        return True
    return False

def extract_resume_text(name: str = None) -> str:
    path = _resume_path(name)
    if not path or not path.exists():
        return ""
    try:
        # .tex resumes are read as plain text (cleaner source than a parsed PDF).
        if path.suffix.lower() == ".tex":
            return path.read_text(encoding="utf-8", errors="ignore")
        text = ""
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        return text
    except Exception as e:
        logger.error(f"Failed to read resume '{path.name}': {e}")
        return ""

def record_token_usage(model_name: str, prompt_tokens: int, candidate_tokens: int):
    """Accrues Gemini API token usage per model at project level in database settings."""
    from .database import SessionLocal
    from . import models
    import json
    from datetime import date
    
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings:
            # 1. Update global metrics
            settings.total_prompt_tokens = (settings.total_prompt_tokens or 0) + prompt_tokens
            settings.total_candidate_tokens = (settings.total_candidate_tokens or 0) + candidate_tokens
            
            # 2. Update per-model telemetry logs
            telemetry = {}
            if settings.model_telemetry:
                try:
                    telemetry = json.loads(settings.model_telemetry)
                except Exception:
                    telemetry = {}
            
            normalized_model = model_name or "unknown-model"
            if normalized_model not in telemetry:
                telemetry[normalized_model] = {"requests": 0, "prompt_tokens": 0, "candidate_tokens": 0}
            
            model_stats = telemetry[normalized_model]
            today_str = date.today().isoformat()
            
            # Reset daily counter if it's a new day
            if model_stats.get("last_request_date") != today_str:
                model_stats["today_requests"] = 0
                model_stats["last_request_date"] = today_str
            
            model_stats["requests"] = model_stats.get("requests", 0) + 1
            model_stats["prompt_tokens"] = model_stats.get("prompt_tokens", 0) + prompt_tokens
            model_stats["candidate_tokens"] = model_stats.get("candidate_tokens", 0) + candidate_tokens
            model_stats["today_requests"] = model_stats.get("today_requests", 0) + 1
            
            settings.model_telemetry = json.dumps(telemetry)
            db.commit()
    except Exception as e:
        logger.error(f"Failed to record token usage: {e}")
    finally:
        db.close()

def _generate(prompt: str, api_key: str = None, model_name: str = None) -> str:
    """Run a prompt through Gemini, falling back to lower models on error."""
    resolved_key = api_key or ENV_API_KEY
    resolved_model = model_name
    
    # If the caller passed an encrypted Fernet token directly, decrypt it.
    if resolved_key and isinstance(resolved_key, str) and resolved_key.startswith("gAAAAA"):
        try:
            from .crypto import decrypt_value
            decrypted = decrypt_value(resolved_key)
            if decrypted:
                resolved_key = decrypted
        except Exception as e:
            logger.error(f"Failed to decrypt provided API key: {e}")
            
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings:
            if not resolved_key and settings.gemini_api_key:
                from .crypto import decrypt_value
                decrypted = decrypt_value(settings.gemini_api_key)
                if decrypted:
                    resolved_key = decrypted
            if not resolved_model and settings.gemini_model:
                resolved_model = settings.gemini_model
    except Exception:
        pass
    finally:
        db.close()

    if not resolved_key:
        return "Error: Gemini API key is not configured. Add it in Settings or set GEMINI_API_KEY in the backend environment."

    # Build model chain exclusively from DB (what the user set in Settings UI).
    # If DB was unreachable, fall back to a single emergency model — NOT a hardcoded list.
    chain = []
    raw_models = resolved_model if resolved_model else _EMERGENCY_FALLBACK_MODEL
    for m in raw_models.split(","):
        clean_m = m.strip()
        if clean_m and clean_m not in chain:
            chain.append(clean_m)
            
    if not chain:
        chain.append(_EMERGENCY_FALLBACK_MODEL)
    
    if not resolved_model:
        logger.warning(f"[AI] DB model chain unavailable. Using emergency fallback: {chain}")
    else:
        logger.info(f"[AI] Model chain from Settings: {chain}")

    client = genai.Client(api_key=resolved_key)
    last_err = ""
    for model in chain:
        if _is_rate_limited(model):
            logger.info(f"Skipping {model} due to recent 429 Rate Limit.")
            continue
            
        try:
            _enforce_rpm_limit_sync(14)
            response = client.models.generate_content(model=model, contents=prompt)
            # Record token metrics
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                pt = response.usage_metadata.prompt_token_count or 0
                ct = response.usage_metadata.candidates_token_count or 0
                record_token_usage(model, pt, ct)
            
            if response and response.text:
                return response.text
                
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Triggering fallback — Model {model} failed: {err_msg}")
            last_err = err_msg
            if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                # Default 60s cooldown
                cooldown = 60
                # Try to parse "retry in Xs" from error
                import re
                match = re.search(r"retry in (\d+)(?:\.\d+)?s", err_msg)
                if match:
                    cooldown = int(match.group(1)) + 2 # Add 2s buffer
                _set_rate_limit(model, cooldown)
                
            if any(h in err_msg.lower() for h in _FATAL_ERROR_HINTS):
                break  # auth/config issue — fallback won't help
                
    if not last_err:
        last_err = "All models were skipped because they are currently in a cooldown period (penalty box) from recent rate limits."
        
    return f"Error generating content (all models failed). Last error: {last_err}"

def _generate_cloud_private(prompt: str, settings: any) -> str:
    """Placeholder for Cloud Private (OpenAI/Anthropic) logic."""
    return "Error: Cloud Private (OpenAI/Anthropic) mode is not yet fully implemented."

class OllamaResumeOutput(BaseModel):
    latex_source: str

class OllamaCoverLetterOutput(BaseModel):
    cover_letter: str

def _generate_ollama(prompt: str, settings: any, output_schema: BaseModel) -> str:
    """Uses Ollama SDK with Pydantic structured output."""
    if not OllamaClient:
        raise HTTPException(status_code=500, detail="Ollama SDK is not installed. Please run `pip install ollama`.")
        
    url = settings.ollama_url or "http://localhost:11434"
    models_to_try = [m.strip() for m in (settings.ollama_model or "llama3").split(",")]
    
    # Check daemon health first to return graceful 503
    try:
        health = requests.get(f"{url}/api/tags", timeout=3)
        health.raise_for_status()
    except Exception as e:
        logger.error(f"Ollama daemon unreachable at {url}: {e}")
        raise HTTPException(status_code=503, detail=f"Ollama daemon is not running or unreachable at {url}.")
        
    client = OllamaClient(host=url)
    last_err = None
    
    for model in models_to_try:
        try:
            response = client.chat(
                model=model,
                messages=[{'role': 'user', 'content': prompt}],
                format=output_schema.model_json_schema()
            )
            content = response.message.content
            data = json.loads(content)
            
            # Depending on schema, return the correct field
            if "latex_source" in data:
                return data["latex_source"]
            elif "cover_letter" in data:
                return data["cover_letter"]
            return content
        except Exception as e:
            logger.error(f"Ollama generation failed for {model}: {e}")
            last_err = str(e)
            
    return f"Error: Local generation failed - {last_err}"

def extract_job_details_from_description(description: str, api_key: str = None, model_name: str = None) -> dict:
    prompt = f"""
    You are an expert at parsing raw job descriptions and LinkedIn feed posts.
    Extract the Company Name and Job Title from this raw text.
    If you cannot find a company name, output "Unknown Company".
    If you cannot find a job title, output "Unknown Title".
    
    Text:
    {description[:2500]}
    
    Output strictly as JSON in this exact format:
    {{"company": "...", "title": "..."}}
    """
    try:
        res = _generate(prompt, api_key, model_name)
        return json.loads(strip_code_fences(res))
    except Exception as e:
        logger.error(f"Failed to extract details from description: {e}")
        return {}

def batch_extract_job_details(jobs: list, api_key: str = None, model_name: str = None) -> list:
    """Takes a list of dictionaries with 'description' and returns a list of dicts with company, title, clean_description."""
    if not jobs:
        return []
        
    prompt = f"""
    You are an expert at parsing raw job descriptions and LinkedIn feed posts.
    I am providing you {len(jobs)} raw job descriptions/posts.
    For each one, extract the Company Name and Job Title. If unknown, output "Unknown Company" / "Unknown Title".
    Then, clean and sanitize the description into nicely formatted Markdown (remove cookies, headers, etc.).
    
    Output strictly as a JSON array in the exact same order as the input.
    Format:
    [
      {{"company": "...", "title": "...", "clean_description": "..."}},
      ...
    ]
    
    Data:
    """
    for i, job in enumerate(jobs):
        prompt += f"\n\n--- JOB {i} ---\n{job['description'][:4000]}\n"
        
    try:
        res = _generate(prompt, api_key, model_name)
        parsed = json.loads(strip_code_fences(res))
        if isinstance(parsed, list) and len(parsed) == len(jobs):
            return parsed
    except Exception as e:
        logger.error(f"Failed to batch extract details: {e}")
    
    return [{"company": "Unknown Company", "title": "Unknown Title", "clean_description": j["description"]} for j in jobs]

def _route_generation(prompt: str, mode: str, settings: any, is_tex: bool = False, is_cl: bool = False) -> str:
    """Factory router for multi-provider AI generation."""
    if mode == "ollama":
        schema = OllamaCoverLetterOutput if is_cl else OllamaResumeOutput
        return _generate_ollama(prompt, settings, schema)
    elif mode in ("openai", "anthropic", "grok"):
        return _generate_cloud_private(prompt, settings)
    else:
        # Default: Cloud Free (Gemini)
        return _generate(prompt, settings.gemini_api_key, settings.gemini_model)

def _get_custom_guidelines() -> str:
    """Helper to fetch custom user guidelines from the Settings database."""
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).first()
        if settings and settings.custom_guidelines:
            return settings.custom_guidelines.strip()
    except Exception:
        pass
    finally:
        db.close()
    return ""

async def generate_application_materials(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None, generation_mode: str = "cloud_free"):
    yield json.dumps({"status": "progress", "message": "Fetching RAG Context and initializing..."}) + "\n"
    await asyncio.sleep(0)
    
    from . import rag_engine
    try:
        relevant_experience = await asyncio.to_thread(rag_engine.retrieve_relevant_experience, description, 6, api_key)
    except Exception as e:
        yield json.dumps({"status": "error", "message": f"Error accessing Knowledge Base: {str(e)}"}) + "\n"
        return
        
    if not relevant_experience:
        yield json.dumps({"status": "error", "message": "No career context found. Please add your career history to the Knowledge Base first."}) + "\n"
        return
        
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    settings = db.query(models.Settings).first()
    db.close()

    path = _resume_path(resume_name)
    is_tex = bool(path) and path.suffix.lower() == ".tex"

    preamble = ""
    resume_text = ""
    if path and path.exists():
        resume_text = extract_resume_text(resume_name)
        if is_tex:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    tex_content = f.read()
                if r"\begin{document}" in tex_content:
                    preamble = tex_content.split(r"\begin{document}")[0] + r"\begin{document}"
            except Exception:
                pass

    jd_context = f"\n\nJob Description Context:\n---\n{description}\n---\n" if description else ""
    tex_context = f"\n\nOriginal LaTeX Preamble (YOU MUST USE THIS):\n---\n{preamble}\n---\n" if preamble else ""
    resume_template = f"\n\nOriginal Resume (USE THIS STRICTLY AS A FORMATTING TEMPLATE):\n---\n{resume_text}\n---\n" if resume_text else ""

    escape_directive = (
        "\nCRITICAL LATEX REQUIREMENT for the Resume:\n"
        "You MUST escape ALL special LaTeX characters in the Tailored Resume section ONLY. Replace "
        "'&' with '\\&', '%' with '\\%', '$' with '\\$', '_' with '\\_'. "
        "Failure to escape these will crash the compiler!"
    ) if is_tex else ""

    guidelines = _get_custom_guidelines()
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    prompt = f"""
You are an expert technical recruiter, career coach, and professional writer.
I need you to generate THREE things for the role of {job_title} at {company} {f'located in {location}' if location else ''}:
1. A concise, modern, and highly persuasive Cover Letter.
2. A short, punchy Cold Email / LinkedIn DM to a recruiter or hiring manager.
3. A tailored version of my original Resume.
{jd_context}

Relevant Career Experiences Context (USE THIS FOR FACTUAL CONTENT & BULLET POINTS):
---
{relevant_experience}
---
{resume_template}
{tex_context}

Rules for Cover Letter:
- Do NOT use generic placeholders like [Company Name] or [Your Name]. Sign off as "Hari Karri" or "Hari".
- Keep it under 3 paragraphs, highly confident, and direct.

Rules for Cold Email / LinkedIn DM:
- Keep it concise but punchy (under 200 words).
- Do NOT include a "Subject:" line in the text. Start directly with the greeting.
- Focus on one strong hook relating my experience to their specific job description.
- Include a clear call to action (e.g. asking for a brief chat).
- Sign off as "Hari Karri" or "Hari".

Rules for Tailored Resume:
- DO NOT add any skills, keywords, or technologies to the resume unless they are explicitly supported by the provided Relevant Career Experiences context. DO NOT hallucinate experience.
- Rewrite the professional summary to target this specific role based ONLY on the provided context.
- Write new bullet points that align exactly with the Job Description Context, but draw factual backing strictly from the Relevant Career Experiences.
- CRITICAL FORMATTING: You must keep the EXACT SAME structural formatting and custom macros (e.g. custom LaTeX commands) as the Original Resume template. Do not invent a new layout.
- CRITICAL: Do NOT inflate or escalate job titles. Keep any original job titles as they appear in the context.
{custom_directive}
{escape_directive}
{
"- The original resume is a LaTeX document. The tailored resume MUST be a COMPLETE, COMPILABLE LaTeX document preserving the original preamble." if is_tex else "- The tailored resume MUST be in markdown format."
}

You MUST output your response exactly in the following format with the exact delimiters:

[COVER_LETTER_START]
<cover letter text here>
[COVER_LETTER_END]

[COLD_EMAIL_START]
<cold email text here>
[COLD_EMAIL_END]

[TAILORED_RESUME_START]
<tailored resume text here>
[TAILORED_RESUME_END]
"""

    # --- PHASE 1: DRAFT GENERATION ---
    yield json.dumps({"status": "progress", "message": "Phase 1: Generating drafts based on Knowledge Base..."}) + "\n"
    await asyncio.sleep(0)
    draft_result = await asyncio.to_thread(_route_generation, prompt, generation_mode, settings, False, False)
    
    if draft_result.startswith("Error"):
        yield json.dumps({"status": "error", "message": draft_result}) + "\n"
        return
        
    import re
    cl_match = re.search(r"\[COVER_LETTER_START\](.*?)\[COVER_LETTER_END\]", draft_result, re.DOTALL)
    em_match = re.search(r"\[COLD_EMAIL_START\](.*?)\[COLD_EMAIL_END\]", draft_result, re.DOTALL)
    tr_match = re.search(r"\[TAILORED_RESUME_START\](.*?)\[TAILORED_RESUME_END\]", draft_result, re.DOTALL)
    
    cl = cl_match.group(1).strip() if cl_match else ""
    em = em_match.group(1).strip() if em_match else ""
    tr = tr_match.group(1).strip() if tr_match else ""
    
    if not cl and not tr and not em:
        logger.error(f"AI Parse Error. Output: {draft_result[:500]}")
        yield json.dumps({"status": "error", "message": "Failed to parse AI output. AI did not use the requested delimiters."}) + "\n"
        return

    # --- PHASE 2: REVIEWER (CRITIC) ---
    yield json.dumps({"status": "progress", "message": "Phase 2: Critic is reviewing drafts for hallucinations and formatting..."}) + "\n"
    await asyncio.sleep(0)
    reviewer_prompt = f"""
You are an ultra-strict Principal Engineer and Hiring Manager reviewing drafted application materials for a {job_title} role.
Your job is to ruthlessly critique the draft based on the following strict rules.

Rules to enforce:
1. NO HALLUCINATIONS: The drafted resume MUST NOT contain any technical skills, numbers, or experiences that are not explicitly stated in the "Relevant Career Experiences Context".
2. LATEX FORMATTING: If the original resume is a LaTeX template, the drafted resume MUST perfectly preserve the LaTeX macros (e.g. \\resumeSingleItem) and document structure. If it hallucinates a generic \\section layout instead of using the template's structure, it FAILS.
3. JD ALIGNMENT: Does the resume effectively target the Job Description without overclaiming?

Relevant Career Experiences Context:
---
{relevant_experience}
---
Original Formatting Template (First 2000 chars):
---
{resume_text[:2000] if resume_text else "None"}
---
Drafted Cover Letter:
{cl}
Drafted Resume:
{tr[:4000]}

Output a detailed critique pointing out specific flaws.
Finally, conclude your response with EXACTLY one of these two tags on a new line:
[APPROVED]
or
[REVISION_REQUIRED]
"""
    logger.info("[AI] Running Phase 2: Reviewer Pass")
    review_result = await asyncio.to_thread(_route_generation, reviewer_prompt, generation_mode, settings, False, False)
    
    yield json.dumps({"status": "progress", "message": f"Critic Feedback:\\n{review_result}"}) + "\n"
    await asyncio.sleep(0)
    
    if "[REVISION_REQUIRED]" in review_result:
        # --- PHASE 3: REFINEMENT ---
        logger.info("[AI] Reviewer requested revisions. Running Phase 3: Refinement Pass")
        yield json.dumps({"status": "progress", "message": "Phase 3: Refinement pass fixing Critic issues..."}) + "\n"
        await asyncio.sleep(0)
        refinement_prompt = f"""
You are the master editor. I am providing you with draft application materials and a strict Reviewer's critique.
You must fix ALL the issues pointed out by the Reviewer.

Reviewer Critique:
---
{review_result}
---

Original Drafts:
---
COVER LETTER:
{cl}

RESUME:
{tr}
---

Original Formatting Template (YOU MUST USE THIS STRUCTURE EXACTLY):
---
{resume_text}
---

Relevant Career Experiences (USE FOR FACTUAL CORRECTIONS ONLY):
---
{relevant_experience}
---

        Output the FINAL, corrected versions using the exact same delimiters:
[COVER_LETTER_START]
<cover letter text here>
[COVER_LETTER_END]

[COLD_EMAIL_START]
{em}
[COLD_EMAIL_END]

[TAILORED_RESUME_START]
<tailored resume text here>
[TAILORED_RESUME_END]
"""
        final_result = await asyncio.to_thread(_route_generation, refinement_prompt, generation_mode, settings, False, False)
        
        cl_match_f = re.search(r"\[COVER_LETTER_START\](.*?)\[COVER_LETTER_END\]", final_result, re.DOTALL)
        em_match_f = re.search(r"\[COLD_EMAIL_START\](.*?)\[COLD_EMAIL_END\]", final_result, re.DOTALL)
        tr_match_f = re.search(r"\[TAILORED_RESUME_START\](.*?)\[TAILORED_RESUME_END\]", final_result, re.DOTALL)
        
        if cl_match_f: cl = cl_match_f.group(1).strip()
        if em_match_f: em = em_match_f.group(1).strip()
        if tr_match_f: tr = tr_match_f.group(1).strip()

    yield json.dumps({
        "status": "success",
        "data": {
            "cover_letter": cl,
            "cold_email": em,
            "tailored_resume": tr
        }
    }) + "\n"

def extract_resume_keywords(resume_text: str, api_key: str = None, model_name: str = None) -> str:
    """Extracts a JSON array of up to 30 technical keywords from the resume text."""
    if not resume_text:
        return "[]"
        
    prompt = f"""
You are an expert ATS (Applicant Tracking System) parser.
Extract the top 20-30 most important technical skills, tools, frameworks, and domain keywords from the following resume.
Return ONLY a valid JSON array of strings. Do NOT return markdown formatting, code fences, or any other text.
Example output: ["Python", "React", "AWS", "Machine Learning", "Docker"]

Resume:
---
{resume_text}
---
"""
    result = _generate(prompt, api_key, model_name)
    if result.startswith("Error"):
        return "[]"

    return strip_code_fences(result)

def parse_job_page_title(page_title: str, api_key: str = None, model_name: str = None) -> dict:
    """Uses Gemini to quickly extract a clean Company and Job Title from a messy HTML <title>."""
    prompt = f"""
You are an expert at parsing raw HTML <title> tags from job boards (LinkedIn, Workday, etc.).
Extract the 'company' and 'title' from the following page title.
Return ONLY a valid JSON object with keys 'company' and 'title'.
If you cannot determine the company, use "Unknown Company".
If you cannot determine the title, use the raw page title.
Do NOT return markdown formatting or code fences.

Page Title: "{page_title}"
"""
    result = _generate(prompt, api_key, model_name)
    try:
        return json.loads(strip_code_fences(result))
    except Exception as e:
        logger.error(f"Failed to parse job page title: {e}")
        return {"company": "Unknown Company", "title": page_title}

def sanitize_job_description(raw_text: str, api_key: str = None) -> str:
    """Uses gemini-2.5-flash to extract a clean, structured job description in markdown."""
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text
        
    prompt = f"""
You are an expert technical recruiter.
Clean up the following raw text scraped from a job board webpage. 
1. Remove all cookies warning text, privacy policy notices, navigation bars, headers, and footers.
2. Structure the remaining core job requirements into clean, beautifully formatted Markdown.
3. Output ONLY the clean Markdown text containing sections like Overview/Role, Responsibilities, Requirements, and Benefits. Do NOT add commentary, wrappers, or markdown code fences.

Raw Webpage Text:
---
{raw_text[:12000]}
---
"""
    result = _generate(prompt, api_key, None)
    if result.startswith("Error") or not result.strip():
        return raw_text  # Fallback to raw text if AI fails

    return strip_code_fences(result)



def batch_evaluate_jobs(jobs_data: list, resume_text: str, api_key: str = None, model_name: str = None) -> list:
    """
    Evaluates a batch of jobs against the resume and returns a list of dictionaries with match scores.
    """
    if not jobs_data or not resume_text:
        return []
    
    prompt = f"""
You are an expert technical recruiter and ATS.
Evaluate the following batch of job postings against the provided candidate resume.
For each job, determine:
1. match_score (0-100)
2. match_reason (1-2 sentences)
3. external_id (Extract the external job ID/requisition ID from the JD, if present. If not, return null.)
4. yoe (Extract the expected years of experience from the JD, if present, e.g. "3-5 years" or "5+". If not, return null.)
5. cleaned_job_description (Extract ONLY the core job description from the raw text, removing cookies, headers, footers, etc. Structure it nicely in Markdown).

Return ONLY a valid JSON array of objects. Do not use markdown backticks.

Resume:
---
{resume_text}
---

Jobs Batch:
---
{json.dumps(jobs_data, indent=2)}
---

Expected JSON format:
[
  {{"id": 0, "match_score": 85, "match_reason": "Strong match with Python.", "external_id": "REQ-1234", "yoe": "3-5 years", "cleaned_job_description": "## Role\\n..."}},
  {{"id": 1, "match_score": 20, "match_reason": "Missing Java.", "external_id": null, "yoe": "8+", "cleaned_job_description": "## Role\\n..."}}
]
"""
    try:
        # Default to the standard model chain if the caller doesn't specify one.
        if not model_name:
            model_name = DEFAULT_MODEL_CHAIN

        result = _generate(prompt, api_key, model_name)
        if result.startswith("Error"):
            logger.error(f"Batch evaluation returned error: {result}")
            return []

        return json.loads(strip_code_fences(result))
    except Exception as e:
        logger.error(f"Failed to batch evaluate jobs: {e}")
        return []
