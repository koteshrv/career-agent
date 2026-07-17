import logging
import urllib.parse
import requests
from sqlalchemy.orm import Session
from typing import List

from .common import _extract_jobs_from_text, has_been_notified

logger = logging.getLogger(__name__)

def process_api_post(db: Session, target: dict, keywords: List[str], new_jobs: list, company_logs: list):
    company = target.get("company")
    url = target.get("url")
    headers = target.get("headers", {})
    payload_template = target.get("payload", "")
    no_results_text = target.get("no_results_text", "0").lower()

    jobs_found_count = 0
    has_error = False
    error_msg = ""
    for keyword in keywords:
        try:
            kw_val = urllib.parse.quote(keyword) if "x-www-form-urlencoded" in headers.get("Content-Type", "").lower() else keyword
            payload = payload_template.replace("{keyword}", kw_val)
            r = requests.post(url, headers=headers, data=payload.encode('utf-8'), timeout=15)
            if r.status_code == 200:
                if no_results_text not in r.text.lower():
                    jobs_extracted = _extract_jobs_from_text(r.text, url)
                    if jobs_extracted:
                        for job in jobs_extracted:
                            title = job.get("title", "")
                            job_url = job.get("href", "")
                            if title and job_url:
                                if not has_been_notified(db, job_url):
                                    new_jobs.append({"company": company, "title": title, "url": job_url, "location": ""})
                                    jobs_found_count += 1
        except Exception as e:
            logger.error(f"Error processing API POST {company}: {e}")
            has_error = True
            error_msg = str(e)

    if has_error:
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
    else:
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
