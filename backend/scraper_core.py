import json
import logging
import requests
import asyncio
import urllib.parse
import re
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from . import models, schemas
from playwright.async_api import async_playwright
from playwright_stealth import stealth

logger = logging.getLogger(__name__)

LOCATIONS = ["india", "bangalore", "hyderabad", "pune", "gurgaon", "noida", "remote"]

def load_keywords() -> List[str]:
    try:
        with open("keywords.json", "r") as f:
            return json.load(f)
    except:
        return ["software", "engineer", "developer", "backend", "frontend", "python"]

def load_targets() -> List[Dict[str, Any]]:
    try:
        with open("targets.json", "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load targets.json: {e}")
        return []

def has_been_notified(db: Session, url: str) -> bool:
    seven_days_ago = datetime.now() - timedelta(days=7)
    return db.query(models.Job).filter(models.Job.url == url, models.Job.created_at > seven_days_ago).first() is not None

def record_job(db: Session, company: str, title: str, url: str, location: str = "") -> models.Job:
    job = models.Job(company=company, title=title, url=url, location=location)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def check_keywords_and_location(title: str, location: str, keywords: List[str], locations: List[str]) -> bool:
    title_lower = title.lower() if title else ""
    loc_lower = location.lower() if location else ""
    if any(x in title_lower for x in ["intern", "manager", "director", "vp", "president", "principal"]):
        return False
    keyword_match = any(k in title_lower for k in keywords)
    location_match = any(l in loc_lower for l in locations) or not location 
    return keyword_match and location_match

def process_greenhouse(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            for job in r.json().get("jobs", []):
                title = job.get("title", "")
                location = job.get("location", {}).get("name", "")
                job_url = job.get("absolute_url", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        record_job(db, company, title, job_url, location)
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
    except Exception as e:
        logger.error(f"Error processing Greenhouse {company}: {e}")

def process_lever(db: Session, target: dict, keywords: List[str], locations: List[str], new_jobs: list):
    board_token = target.get("api_board_token")
    company = target.get("company")
    url = f"https://api.lever.co/v0/postings/{board_token}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            for job in r.json():
                title = job.get("text", "")
                location = job.get("categories", {}).get("location", "")
                job_url = job.get("hostedUrl", "")
                if check_keywords_and_location(title, location, keywords, locations):
                    if not has_been_notified(db, job_url):
                        record_job(db, company, title, job_url, location)
                        new_jobs.append({"company": company, "title": title, "url": job_url, "location": location})
    except Exception as e:
        logger.error(f"Error processing Lever {company}: {e}")

def process_api_post(db: Session, target: dict, keywords: List[str], new_jobs: list):
    company = target.get("company")
    url = target.get("url")
    headers = target.get("headers", {})
    payload_template = target.get("payload", "")
    no_results_text = target.get("no_results_text", "0").lower()
    
    for keyword in keywords:
        try:
            kw_val = urllib.parse.quote(keyword) if "x-www-form-urlencoded" in headers.get("Content-Type", "").lower() else keyword
            payload = payload_template.replace("{keyword}", kw_val)
            r = requests.post(url, headers=headers, data=payload.encode('utf-8'), timeout=15)
            if r.status_code == 200:
                if no_results_text not in r.text.lower():
                    title = f"{keyword.capitalize()} Role (Automated API Match)"
                    if not has_been_notified(db, url):
                        record_job(db, company, title, url)
                        new_jobs.append({"company": company, "title": title, "url": url, "location": ""})
        except Exception as e:
            logger.error(f"Error processing API POST {company}: {e}")

def process_tech_mahindra(db: Session, target: dict, keywords: List[str], new_jobs: list):
    company = target.get("company", "Tech Mahindra")
    url = target.get("url", "https://careers.techmahindra.com/")
    no_results_text = target.get("no_results_text", "0 results").lower()
    
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
    }
    
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
                title = f"{keyword.capitalize()} Role (Tech Mahindra Match)"
                info_url = f"{url} (Search: {keyword})"
                if not has_been_notified(db, info_url):
                    record_job(db, company, title, info_url)
                    new_jobs.append({"company": company, "title": title, "url": info_url, "location": ""})
        except Exception as e:
            logger.error(f"Error Tech Mahindra {company}: {e}")

async def process_playwright(db: Session, targets: List[dict], keywords: List[str], new_jobs: list):
    if not targets: return
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        await stealth(page)
        
        for target in targets:
            company = target.get("company")
            url_template = target.get("url")
            no_results_text = target.get("no_results_text", "0 results").lower()
            
            for keyword in keywords:
                url = url_template.replace("{keyword}", urllib.parse.quote(keyword))
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(5000)
                    content = (await page.content()).lower()
                    
                    if no_results_text not in content:
                        if not has_been_notified(db, url):
                            title = f"{keyword.capitalize()} Role (Automated URL Match)"
                            record_job(db, company, title, url)
                            new_jobs.append({"company": company, "title": title, "url": url, "location": ""})
                except Exception as e:
                    logger.error(f"Playwright error {company}: {e}")
        await browser.close()

def run_scraper(db: Session):
    logger.info("Starting Backend Scraper Engine...")
    targets = load_targets()
    keywords = load_keywords()
    new_jobs = []
    playwright_targets = []
    
    for target in targets:
        t_type = target.get("type", "")
        if t_type == "greenhouse":
            process_greenhouse(db, target, keywords, LOCATIONS, new_jobs)
        elif t_type == "lever":
            process_lever(db, target, keywords, LOCATIONS, new_jobs)
        elif t_type == "api_post":
            process_api_post(db, target, keywords, new_jobs)
        elif t_type == "tech_mahindra":
            process_tech_mahindra(db, target, keywords, new_jobs)
        elif t_type == "playwright":
            playwright_targets.append(target)
            
    if playwright_targets:
        # Note: Playwright needs an async loop, but run_scraper is sync. 
        # We use asyncio.run or get_event_loop.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We can't use asyncio.run if the loop is already running (e.g., inside FastAPI).
                # We must schedule it or use an executor.
                task = loop.create_task(process_playwright(db, playwright_targets, keywords, new_jobs))
                loop.run_until_complete(task)
            else:
                asyncio.run(process_playwright(db, playwright_targets, keywords, new_jobs))
        except RuntimeError:
            asyncio.run(process_playwright(db, playwright_targets, keywords, new_jobs))
            
    return new_jobs
