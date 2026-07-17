import json
import logging
import requests
from sqlalchemy.orm import Session
from typing import List

from .common import is_valid_candidate

logger = logging.getLogger(__name__)

def process_zwayam(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    company = target.get("company", "Unknown")
    api_url = target.get("api_url")
    domain = target.get("domain", "")
    company_id = target.get("company_id", "")

    if not api_url or not domain or not company_id:
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": "Missing api_url, domain, or company_id for Zwayam target."})
        return

    logger.info(f"[{company}] Querying Zwayam API at {api_url}")
    total_new = 0

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Origin": f"https://{domain}",
        "Referer": f"https://{domain}/"
    }

    try:
        # Build search query string
        keyword_str = " OR ".join(keywords) if keywords else ""

        # Zwayam uses multipart/form-data and requires tightly packed JSON without spaces
        filter_dict = {
            "paginationStartNo": 0,
            "selectedCall": "sort",
            "sortCriteria": {"name": "modifiedDate", "isAscending": False}
        }
        if keyword_str:
            filter_dict["anyOfTheseWords"] = keyword_str

        filter_cri = json.dumps(filter_dict, separators=(',', ':'))

        # Build exact raw multipart/form-data to mimic browser
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="filterCri"\r\n\r\n'
            f'{filter_cri}\r\n'
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="domain"\r\n\r\n'
            f'{domain}\r\n'
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="companyId"\r\n\r\n'
            f'{company_id}\r\n'
            f"--{boundary}--\r\n"
        )

        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

        r = requests.post(api_url, data=body.encode('utf-8'), headers=headers, timeout=15)
        r.raise_for_status()

        try:
            data = r.json()
        except Exception:
            # Some versions might return wrapped JSON
            text = r.text
            if text.startswith("})]}',\\n"):
                text = text.split("\\n", 1)[1]
            data = json.loads(text)

        logger.info(f"[{company}] Zwayam raw response (first 300 chars): {r.text[:300]}")

        # Zwayam can return jobs in 'jobList' or as raw ElasticSearch hits in 'data.data'
        job_list = []
        if "data" in data and isinstance(data["data"], dict) and "data" in data["data"]:
            hits = data["data"]["data"]
            job_list = [hit.get("_source", hit) for hit in hits if isinstance(hit, dict)]
        else:
            job_list = data.get("jobList", [])

        logger.info(f"[{company}] Found {len(job_list)} total jobs via Zwayam API")

        for job in job_list:
            title = job.get("title", job.get("jobTitle", ""))
            jid = job.get("id", job.get("jobId", ""))
            # Zwayam uses 'seoUrl', 'jobview', or 'jobUrl' for the slug
            seo_url = job.get("jobUrl", job.get("jobview", job.get("seoUrl", "")))

            if not title:
                continue

            # Form standard Zwayam job URL
            if seo_url:
                job_url = f"https://{domain}/jobview/{seo_url}"
            else:
                job_url = f"https://{domain}/jobview/{jid}"

            if not is_valid_candidate(job_url, title, strict_hints=True):
                continue

            logger.debug(f"  + Collected: {title[:60]!r} -> {job_url}")
            new_jobs.append({"title": title, "url": job_url, "source_url": api_url, "company": company, "skip_ai": True})
            total_new += 1

        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": total_new, "message": ""})
    except Exception as e:
        logger.error(f"[{company}] Failed Zwayam fetch: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})
