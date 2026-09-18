import asyncio
import httpx
import logging
from typing import List, Dict
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)

DATASET_BASE = "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data"

async def fetch_company_list(client: httpx.AsyncClient, ats_name: str) -> List[str]:
    try:
        resp = await client.get(f"{DATASET_BASE}/{ats_name}.json", timeout=10.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch {ats_name} company list: {e}")
    return []

async def check_greenhouse_board(client: httpx.AsyncClient, company: str, titles: List[str], locations: List[str]) -> List[Dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs"
    try:
        resp = await client.get(url, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            jobs = []
            for job in data.get("jobs", []):
                title = job.get("title", "")
                loc = job.get("location", {}).get("name", "")
                
                # Simple keyword matching
                title_match = not titles or any(t.lower() in title.lower() for t in titles)
                loc_match = not locations or any(l.lower() in loc.lower() for l in locations)
                
                if title_match and loc_match:
                    jobs.append({
                        "title": title,
                        "company": company,
                        "location": loc,
                        "url": job.get("absolute_url"),
                        "description": "" # Needs fetching later if requested
                    })
            return jobs
    except Exception:
        pass
    return []

async def check_lever_board(client: httpx.AsyncClient, company: str, titles: List[str], locations: List[str]) -> List[Dict]:
    url = f"https://api.lever.co/v0/postings/{company}"
    try:
        resp = await client.get(url, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            jobs = []
            for job in data:
                title = job.get("text", "")
                loc = job.get("categories", {}).get("location", "")
                
                title_match = not titles or any(t.lower() in title.lower() for t in titles)
                loc_match = not locations or any(l.lower() in loc.lower() for l in locations)
                
                if title_match and loc_match:
                    jobs.append({
                        "title": title,
                        "company": company,
                        "location": loc,
                        "url": job.get("hostedUrl"),
                        "description": job.get("descriptionPlain", "")
                    })
            return jobs
    except Exception:
        pass
    return []

async def run_global_scan(titles: List[str], locations: List[str], limit_per_ats: int = 50) -> List[Dict]:
    """
    Run a global scan against public ATS registries. 
    Limit is kept small by default to prevent hammering APIs.
    """
    all_jobs = []
    
    async with httpx.AsyncClient(verify=False) as client:
        # Fetch registries
        greenhouse_cos = await fetch_company_list(client, "greenhouse")
        lever_cos = await fetch_company_list(client, "lever")
        
        greenhouse_cos = greenhouse_cos[:limit_per_ats]
        lever_cos = lever_cos[:limit_per_ats]
        
        # We process in small batches to avoid fd limits
        batch_size = 20
        
        for i in range(0, len(greenhouse_cos), batch_size):
            tasks = [check_greenhouse_board(client, co, titles, locations) for co in greenhouse_cos[i:i+batch_size]]
            results = await asyncio.gather(*tasks)
            for r in results:
                all_jobs.extend(r)
                
        for i in range(0, len(lever_cos), batch_size):
            tasks = [check_lever_board(client, co, titles, locations) for co in lever_cos[i:i+batch_size]]
            results = await asyncio.gather(*tasks)
            for r in results:
                all_jobs.extend(r)
                
    return all_jobs
