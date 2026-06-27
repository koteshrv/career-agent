import os
import logging
import json
from google import genai
import PyPDF2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
ENV_API_KEY = os.getenv("GEMINI_API_KEY")

# Ordered fallback chain tried when the chosen model errors (rate limit, overload, etc.).
FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-lite"]

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
    if not resolved_key:
        return "Error: Gemini API key is not configured. Add it in Settings or set GEMINI_API_KEY in the backend environment."

    # Build an ordered, de-duplicated chain: chosen model first, then fallbacks.
    chain = []
    for m in [model_name, DEFAULT_GEMINI_MODEL, *FALLBACK_MODELS]:
        if m and m not in chain:
            chain.append(m)

    client = genai.Client(api_key=resolved_key)
    last_err = ""
    for model in chain:
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            # Record token metrics
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                pt = response.usage_metadata.prompt_token_count or 0
                ct = response.usage_metadata.candidates_token_count or 0
                record_token_usage(model, pt, ct)
            return response.text
        except Exception as e:
            last_err = str(e)
            logger.warning(f"Gemini model '{model}' failed: {last_err}")
            if any(h in last_err.lower() for h in _FATAL_ERROR_HINTS):
                break  # auth/config issue — fallback won't help
    return f"Error generating content (all models failed). Last error: {last_err}"

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

def generate_cover_letter(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None) -> str:
    resume_text = extract_resume_text(resume_name)
    if not resume_text:
        return "Error: Could not read resume. Please upload your resume first."

    jd_context = f"\n\nJob Description Context:\n---\n{description}\n---\n" if description else ""
    
    # Inject user guidelines if configured
    guidelines = _get_custom_guidelines()
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    prompt = f"""
You are an expert career coach and professional writer.
Write a concise, modern, and highly persuasive cover letter for the role of {job_title} at {company} {f'located in {location}' if location else ''}.
{jd_context}
Use the following resume to highlight my most relevant skills and experience:
---
{resume_text}
---

Requirements:
- Do NOT use generic placeholders like [Company Name] or [Your Name], deduce as much as possible from the resume.
- Keep it under 3 paragraphs.
- Be highly confident and direct.
- Focus strictly on matching the resume skills to the likely requirements of {job_title}{' based on the provided Job Description context' if description else ''}.
{custom_directive}
"""
    return _generate(prompt, api_key, model_name)

def generate_tailored_resume(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None) -> str:
    resume_text = extract_resume_text(resume_name)
    if not resume_text:
        return "Error: Could not read resume. Please upload your resume first."

    path = _resume_path(resume_name)
    is_tex = bool(path) and path.suffix.lower() == ".tex"

    jd_context = f"\n\nJob Description Context:\n---\n{description}\n---\n" if description else ""

    escape_directive = "\nCRITICAL LATEX REQUIREMENT:\nYou MUST escape ALL special LaTeX characters in the content you generate. Specifically, you must replace '&' with '\&', '%' with '\%', '$' with '\$', and '_' with '\_'. Failure to escape these characters will cause the compiler to crash!" if is_tex else ""

    # Inject user guidelines if configured
    guidelines = _get_custom_guidelines()
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    shared = f"""You are an expert technical recruiter and professional resume writer.
Rewrite and tailor the resume below for the role of {job_title} at {company} {f'located in {location}' if location else ''}.
{jd_context}
Original resume:
---
{resume_text}
---

Rules:
- Keep ONLY truthful information from the original resume. Do NOT invent experience, employers, or dates.
- CRITICAL: Do NOT inflate or escalate job titles. Keep the original job titles (e.g. 'Senior Software Engineer') exactly as they are in the original resume. Do NOT change them to 'Lead', 'Staff', or 'Manager' even if the target job description is for a higher level.
- Reorder, reword, and emphasize the bullet points and skills most relevant to a {job_title} role{' as outlined in the Job Description' if description else ''}, but do NOT exaggerate responsibilities.
- Rewrite the professional summary to target this specific role while remaining strictly honest to your true seniority.
- Surface keywords a {job_title} job description and ATS would look for, but only where the resume genuinely supports them.
{custom_directive}
{escape_directive}"""

    if is_tex:
        prompt = shared + """
- The original is a LaTeX document. Return a COMPLETE, COMPILABLE LaTeX document.
- Preserve the original preamble, document class, packages, commands, and overall formatting/structure exactly. Only change the textual content to tailor it.
- Output raw LaTeX only. Do NOT wrap it in markdown code fences or add commentary."""
        return _generate(prompt, api_key, model_name)
    else:
        prompt = shared + "\n- Return ONLY the updated markdown text."
        return _generate(prompt, api_key, model_name)

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
        
    # Clean up code fences just in case
    clean = result.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines[-1].startswith("```"): lines = lines[:-1]
        clean = "\n".join(lines).strip()
    
    return clean

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
        clean = result.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean = "\n".join(lines).strip()
        return json.loads(clean)
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
    # Hardcode gemini-2.5-flash for this utility task to be fast and save limits
    result = _generate(prompt, api_key, "gemini-2.5-flash")
    if result.startswith("Error") or not result.strip():
        return raw_text  # Fallback to raw text if AI fails
        
    # Clean up code fences just in case
    clean = result.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines[-1].startswith("```"): lines = lines[:-1]
        clean = "\n".join(lines).strip()
        
    return clean
