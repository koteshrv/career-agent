import json
import logging
import subprocess
from typing import List
from sqlalchemy.orm import Session
from .common import check_keywords_and_location, has_been_notified

logger = logging.getLogger(__name__)

def process_universal_api(db: Session, user_id: int, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    company = target.get("company", "Unknown")
    url = target.get("url")

    if not url and not target.get("api") and not target.get("provider"):
        logger.error(f"[{company}] url, api, or provider required for universal")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": "url, api, or provider required"})
        return

    # Build a career-ops-style PortalEntry: `target` already carries whatever
    # explicit `provider`/`api`/vendor-config keys (e.g. `amazon: {...}`,
    # `ibm: {...}`) this company needs — passed through opaque to bridge.mjs,
    # same as career-ops's own portals.yml entries. `keywords` is this user's
    # own (Settings -> keywords.json -> DEFAULT_KEYWORDS, see
    # common.load_keywords) — keyword-required providers (api-post,
    # tech-mahindra, zwayam, and career-ops's own vdab/mycareersfuture/
    # jobbankca) read it directly; providers that don't care simply ignore it.
    entry = {**target, "name": company, "careers_url": url, "keywords": keywords}

    try:
        result = subprocess.run(
            ["node", "backend/universal/bridge.mjs", json.dumps(entry)],
            capture_output=True, text=True, timeout=30,
        )

        if result.returncode != 0:
            logger.error(f"[{company}] bridge.mjs failed: {result.stderr}")
            company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": "Bridge execution failed"})
            return
            
        data = json.loads(result.stdout)
        if "error" in data:
            logger.error(f"[{company}] universal engine error: {data['error']}")
            company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": data['error']})
            return
            
        jobs_found_count = 0
        provider = data.get("provider", "unknown")
        
        for job in data.get("jobs", []):
            title = job.get("title", "")
            location = job.get("location", "")
            job_url = job.get("url", "")
            
            if check_keywords_and_location(title, location, keywords, locations):
                if not has_been_notified(db, user_id, job_url):
                    new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
                    jobs_found_count += 1
                    
        company_logs.append({"company": company, "status": f"SUCCESS ({provider})", "jobs_found": jobs_found_count})
        
    except Exception as e:
        logger.error(f"[{company}] Error integrating universal engine: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})
