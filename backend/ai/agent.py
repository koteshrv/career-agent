import logging
import json
import subprocess
import PyPDF2
from pathlib import Path
from pydantic import BaseModel
from fastapi import HTTPException
import time
import asyncio

logger = logging.getLogger(__name__)

def strip_code_fences(text: str) -> str:
    """
    Remove leading and trailing Markdown code fences from LLM output.
    This ensures that JSON or other structured output can be parsed correctly.
    """
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

UPLOAD_DIR = Path(".data/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
RESUMES_DIR = UPLOAD_DIR / "resumes"
RESUMES_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_RESUME_EXT = (".pdf", ".tex")

# Migrate a legacy single resume.pdf into the resumes/ directory.
_legacy_resume = UPLOAD_DIR / "resume.pdf"
if _legacy_resume.exists() and not any(RESUMES_DIR.iterdir()):
    _legacy_resume.rename(RESUMES_DIR / "resume.pdf")

def safe_resume_name(name: str) -> str:
    """
    Strip any directory components from an uploaded filename.
    Returns just the basename to prevent path traversal attacks.
    """
    return Path(name).name

def _user_resumes_dir(user_id: int) -> Path:
    """
    Get the directory for a specific user's resumes.
    Creates the directory if it does not exist.
    """
    d = RESUMES_DIR / str(user_id)
    d.mkdir(parents=True, exist_ok=True)
    return d

def list_resumes(user_id: int) -> list:
    """
    List all uploaded resumes for a user.
    Only returns files with allowed extensions (.pdf, .tex).
    """
    return sorted(p.name for p in _user_resumes_dir(user_id).glob("*") if p.suffix.lower() in ALLOWED_RESUME_EXT)

def _resume_path(user_id: int, name: str = None):
    """
    Get the Path to a specific resume, or the primary/first resume if name is omitted.
    Returns None if no matching resume exists.
    """
    files = list_resumes(user_id)
    if not files:
        return None
    if name:
        n = safe_resume_name(name)
        return _user_resumes_dir(user_id) / n if n in files else None
    return _user_resumes_dir(user_id) / files[0]

def delete_resume(user_id: int, name: str) -> bool:
    """
    Delete a specific resume from the user's directory.
    Returns True if successful, False if the file didn't exist.
    """
    path = _resume_path(user_id, name)
    if path and path.exists():
        path.unlink()
        return True
    return False

def extract_resume_text(user_id: int, name: str = None) -> str:
    """
    Extract readable text from a resume file.
    Reads .tex files directly as plain text, or parses .pdf files using PyPDF2.
    """
    path = _resume_path(user_id, name)
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

def record_token_usage(user_id: int, model_name: str, prompt_tokens: int, candidate_tokens: int):
    """
    Accrues AI API token usage per model in this user's own Settings row.
    Updates both total global counts and granular telemetry per-model in JSON.
    """
    from ..database import SessionLocal
    from .. import models
    import json
    from datetime import date

    if not user_id:
        return
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
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

def _generate_cli(prompt: str, cli_name: str) -> str:
    """
    Invokes a local AI CLI tool (headless mode) for generation.
    Supports a variety of CLIs configured via the cmd_map.
    """
    cli_name = cli_name.replace('cli_', '')
    
    cmd_map = {
        "claude": ["claude", "-p"],
        "codex": ["codex", "exec"],
        "gemini": ["gemini", "-p"],
        "opencode": ["opencode", "run"],
        "copilot": ["copilot", "-p"],
        "qwen": ["qwen", "-p"],
        "agy": ["agy", "--sandbox", "--dangerously-skip-permissions", "-p"],
        "grok": ["grok", "-p"],
        "kimi": ["kimi", "-p"]
    }
    
    if cli_name not in cmd_map:
        return f"Error: Unknown CLI '{cli_name}'"
        
    cmd = list(cmd_map[cli_name])
    cmd.append(prompt)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            timeout=180
        )
        if result.returncode != 0:
            logger.error(f"[{cli_name}] CLI Error:\n{result.stderr}")
            return f"Error: {cli_name} returned code {result.returncode}\n{result.stderr}"
        
        if result.stderr:
            logger.info(f"[{cli_name}] CLI stderr output:\n{result.stderr}")
            
        logger.info(f"[{cli_name}] PROMPT FED TO AI:\n{prompt}\n--- END PROMPT ---")
        logger.info(f"[{cli_name}] FULL CLI STDOUT OUTPUT:\n{result.stdout.strip()}\n--- END OUTPUT ---")
        return result.stdout.strip()
    except FileNotFoundError:
        return f"Error: {cli_name} not found in PATH."
    except Exception as e:
        return str(e)

def _generate(prompt: str, api_key: str = None, model_name: str = None, user_id: int = None) -> str:
    """
    Hardcoded generation function using the agy CLI for testing.
    Normally this would invoke Gemini or other cloud models.
    """
    return _generate_cli("agy", prompt)

def _route_generation(prompt: str, mode: str, settings: any, is_tex: bool = False, is_cl: bool = False, user_id: int = None) -> str:
    """
    Factory router for multi-provider AI generation.
    Routes to Cloud Private models, local CLIs, or defaults to the standard generate logic.
    """
    if mode in ("openai", "anthropic", "grok"):
        return "Error: Cloud Private mode not implemented."
    elif mode.startswith("cli_"):
        cli_name = mode.split("_", 1)[1]
        return _generate_cli(prompt, cli_name)
    else:
        # Default: Cloud Free (Gemini), which is hardcoded to CLI right now
        return _generate(prompt, settings.gemini_api_key, settings.gemini_model, user_id)

def _get_custom_guidelines(user_id: int) -> str:
    """
    Helper to fetch custom user guidelines from the Settings database.
    Used to inject specific user preferences into AI prompts.
    """
    from ..database import SessionLocal
    from .. import models
    db = SessionLocal()
    try:
        settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
        if settings and settings.custom_guidelines:
            return settings.custom_guidelines.strip()
    except Exception:
        pass
    finally:
        db.close()
    return ""

async def generate_application_materials(job_title: str, company: str, location: str = "", description: str = "", api_key: str = None, model_name: str = None, resume_name: str = None, generation_mode: str = "cloud_free", user_id: int = None):
    """
    Generates a tailored cover letter, cold email, and resume based on job details.
    Runs a 3-phase AI pipeline: Draft, Review (Critic), and Refinement.
    Streams progress updates back to the client as JSON strings.
    """
    yield json.dumps({"status": "progress", "message": "Fetching RAG Context and initializing..."}) + "\n"
    await asyncio.sleep(0)
    
    from ..database import SessionLocal
    from .. import crud
    
    db = SessionLocal()
    try:
        relevant_experience = crud.get_knowledge_text(db, user_id)
    except Exception as e:
        db.close()
        yield json.dumps({"status": "error", "message": f"Error accessing Knowledge Base: {str(e)}"}) + "\n"
        return
        
    if not relevant_experience:
        yield json.dumps({"status": "error", "message": "No career context found. Please add your career history to the Knowledge Base first."}) + "\n"
        return
        
    from .. import models
    settings = db.query(models.Settings).filter(models.Settings.user_id == user_id).first()
    db.close()

    path = _resume_path(user_id, resume_name)
    is_tex = bool(path) and path.suffix.lower() == ".tex"

    preamble = ""
    resume_text = ""
    if path and path.exists():
        resume_text = extract_resume_text(user_id, resume_name)
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

    guidelines = _get_custom_guidelines(user_id)
    custom_directive = f"\nCRITICAL USER PERSONAL DIRECTIVES/GUIDELINES:\n{guidelines}\n" if guidelines else ""

    from pathlib import Path
    try:
        with open(Path(__file__).parent / "modes" / "apply_legacy.md", "r") as f:
            prompt_template = f.read()
    except Exception:
        prompt_template = ""
    prompt = prompt_template.format(
        job_title=job_title,
        company=company,
        location=location,
        jd_context=jd_context,
        relevant_experience=relevant_experience,
        resume_template=resume_template,
        tex_context=tex_context,
        custom_directive=custom_directive,
        escape_directive=escape_directive,
        format_directive="- The original resume is a LaTeX document. The tailored resume MUST be a COMPLETE, COMPILABLE LaTeX document preserving the original preamble." if is_tex else "- The tailored resume MUST be in markdown format."
    )

    # --- PHASE 1: DRAFT GENERATION ---
    yield json.dumps({"status": "progress", "message": "Phase 1: Generating drafts based on Knowledge Base..."}) + "\n"
    await asyncio.sleep(0)
    draft_result = await asyncio.to_thread(_route_generation, prompt, generation_mode, settings, False, False, user_id)
    
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
    try:
        with open(Path(__file__).parent / "modes" / "review.md", "r") as f:
            reviewer_template = f.read()
    except Exception:
        reviewer_template = ""
    reviewer_prompt = reviewer_template.format(
        job_title=job_title,
        relevant_experience=relevant_experience,
        resume_text=resume_text[:2000] if resume_text else "None",
        cl=cl,
        tr=tr
    )
    logger.info("[AI] Running Phase 2: Reviewer Pass")
    review_result = await asyncio.to_thread(_route_generation, reviewer_prompt, generation_mode, settings, False, False, user_id)
    
    yield json.dumps({"status": "progress", "message": f"Critic Feedback:\\n{review_result}"}) + "\n"
    await asyncio.sleep(0)
    
    if "[REVISION_REQUIRED]" in review_result:
        # --- PHASE 3: REFINEMENT ---
        logger.info("[AI] Reviewer requested revisions. Running Phase 3: Refinement Pass")
        yield json.dumps({"status": "progress", "message": "Phase 3: Refinement pass fixing Critic issues..."}) + "\n"
        await asyncio.sleep(0)
        try:
            with open(Path(__file__).parent / "modes" / "fix.md", "r") as f:
                fix_template = f.read()
        except Exception:
            fix_template = ""
        refinement_prompt = fix_template.format(
            review_result=review_result,
            cl=cl,
            em=em,
            tr=tr,
            resume_text=resume_text,
            relevant_experience=relevant_experience
        )
        final_result = await asyncio.to_thread(_route_generation, refinement_prompt, generation_mode, settings, False, False, user_id)
        
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


def onboard_resume(resume_text: str, api_key: str = None, model_name: str = None, user_id: int = None) -> dict:
    """
    Extracts a full onboarding profile from a resume.
    Uses AI to parse out target roles, compensation, narrative, and keywords.
    Returns a dictionary of the parsed structured JSON.
    """
    if not resume_text:
        return {}
        
    try:
        from pathlib import Path
        rubric_path = Path(__file__).parent / "modes" / "intake.md"
        with open(rubric_path, "r") as f:
            interview_prompt = f.read()
    except Exception as e:
        logger.error(f"Failed to read intake.md: {e}")
        return {}
        
    prompt = f"{interview_prompt}\n\nResume:\n---\n{resume_text}\n---"
    
    result = _generate(prompt, api_key, model_name, user_id)
    if result.startswith("Error"):
        logger.error(f"Onboarding extraction error: {result}")
        return {}

    clean_json = strip_code_fences(result)
    import json
    try:
        return json.loads(clean_json)
    except Exception as e:
        logger.error(f"Failed to parse onboarding JSON: {e}\nRaw: {clean_json}")
        return {}


def batch_evaluate_jobs(jobs_data: list, resume_text: str, api_key: str = None, model_name: str = None, user_id: int = None) -> list:
    """
    Evaluates a batch of jobs against a provided resume.
    Returns a list of dictionaries with match scores.
    """
    if not jobs_data or not resume_text:
        return []
    try:
        from pathlib import Path
        rubric_path = Path(__file__).parent / "modes" / "oferta.md"
        with open(rubric_path, "r") as f:
            rubric_text = f.read()
    except Exception:
        rubric_text = "Evaluate the jobs."
    
    prompt = f"{rubric_text}\n\nResume:\n---\n{resume_text}\n---\n\nJobs:\n---\n{json.dumps(jobs_data)}\\n"
    
    try:
        result = _generate(prompt, api_key, model_name, user_id)
        clean_json = strip_code_fences(result)
        return json.loads(clean_json)
    except Exception as e:
        logger.error(f"Batch evaluation error: {e}")
        return []

