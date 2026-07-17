import logging
import requests
from sqlalchemy.orm import Session
from typing import List

from .common import check_keywords_and_location, has_been_notified

logger = logging.getLogger(__name__)

def process_greenhouse(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    try:
        r = requests.get(url, timeout=10)
        jobs_found_count = 0
        if r.status_code == 200:
            for job in r.json().get("jobs", []):
                title = job.get("title", "")
                location = job.get("location", {}).get("name", "")
                job_url = job.get("absolute_url", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
                        jobs_found_count += 1
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
    except Exception as e:
        logger.error(f"Error processing Greenhouse {company}: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})
