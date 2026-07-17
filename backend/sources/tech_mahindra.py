import logging
import re
import urllib.parse
import requests
from sqlalchemy.orm import Session
from typing import List

from .common import _extract_jobs_from_text, has_been_notified

logger = logging.getLogger(__name__)

def process_tech_mahindra(db: Session, target: dict, keywords: List[str], new_jobs: list, company_logs: list):
    company = target.get("company", "Tech Mahindra")
    url = target.get("url", "https://careers.techmahindra.com/")
    no_results_text = target.get("no_results_text", "0 results").lower()

    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
    }

    matched_keywords = []
    has_error = False
    error_msg = ""
    jobs_found_count = 0
    for keyword in keywords:
        try:
            session = requests.Session()
            get_r = session.get(url, timeout=15)
            if get_r.status_code != 200: continue

            viewstate = re.search(r'id="__VIEWSTATE"\s+value="(.*?)"', get_r.text).group(1)
            viewstategen = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="(.*?)"', get_r.text).group(1)
            eventval = re.search(r'id="__EVENTVALIDATION"\s+value="(.*?)"', get_r.text).group(1)

            payload_dict = {
                "ctl00$ContentPlaceHolder1$ScriptManager1": "ctl00$ContentPlaceHolder1$ctl04|ctl00$ContentPlaceHolder1$btnFreeSearch",
                "ctl00$ContentPlaceHolder1$RblList": "IT",
                "ctl00$ContentPlaceHolder1$txtAdvanceSearch": keyword,
                "ctl00$ContentPlaceHolder1$txtFirstName": "",
                "ctl00$ContentPlaceHolder1$txtLastName": "",
                "ctl00$ContentPlaceHolder1$ddlNationality": "IND",
                "ctl00$ContentPlaceHolder1$ddlTotExpYears": "Select Experience *",
                "ctl00$ContentPlaceHolder1$txtUserName": "",
                "ctl00$ContentPlaceHolder1$ddlType": "Select",
                "ctl00$ContentPlaceHolder1$txtSkills": "",
                "ctl00$ContentPlaceHolder1$ddlcountrycode": "Select country code *",
                "ctl00$ContentPlaceHolder1$txt_MobileNumber": "",
                "__EVENTTARGET": "",
                "__EVENTARGUMENT": "",
                "__LASTFOCUS": "",
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstategen,
                "__VIEWSTATEENCRYPTED": "",
                "__EVENTVALIDATION": eventval,
                "__ASYNCPOST": "true",
                "ctl00$ContentPlaceHolder1$btnFreeSearch": "Search"
            }

            post_r = session.post(url, headers=headers, data=urllib.parse.urlencode(payload_dict), timeout=15)
            if post_r.status_code == 200 and no_results_text not in post_r.text.lower():
                jobs_extracted = _extract_jobs_from_text(post_r.text, url)
                if jobs_extracted:
                    for job in jobs_extracted:
                        title = job.get("title", "")
                        job_url = job.get("href", "")
                        if title and job_url:
                            if not has_been_notified(db, job_url):
                                new_jobs.append({"company": company, "title": title, "url": job_url, "location": ""})
                                jobs_found_count += 1
        except Exception as e:
            logger.error(f"Error Tech Mahindra {company}: {e}")
            has_error = True
            error_msg = str(e)

    if has_error:
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
    else:
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
