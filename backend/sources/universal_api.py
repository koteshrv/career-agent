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
    
    if not url:
        logger.error(f"[{company}] URL required for universal")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": "URL required"})
        return

    try:
        # Call the Node.js bridge script
                primary_keyword = keywords[0] if keywords else ""
        primary_location = locations[0] if locations else ""
        result = subprocess.run(["node", "backend/bridge.mjs", url, primary_keyword, primary_location], capture_output=True, text=True, timeout=30)
        
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
