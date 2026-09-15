import asyncio
import json
import logging
import re
from typing import List
from sqlalchemy.orm import Session
from .common import check_keywords_and_location, has_been_notified

logger = logging.getLogger(__name__)

def extract_jobs_from_json(data, base_url="", job_pattern=None):
    jobs = []
    
    def search_recursive(obj):
        if isinstance(obj, list):
            if len(obj) > 0 and isinstance(obj[0], dict):
                title_matches = 0
                for item in obj:
                    keys = [str(k).lower() for k in item.keys()]
                    if any(t in keys for t in ["title", "jobtitle", "reqtitle", "name", "postingtitle"]):
                        title_matches += 1
                
                if title_matches >= len(obj) / 2 and title_matches > 0:
                    for item in obj:
                        title = None
                        url = None
                        ids = {}
                        for k, v in item.items():
                            kl = str(k).lower()
                            if kl in ["title", "jobtitle", "reqtitle", "name", "postingtitle"] and isinstance(v, str):
                                if not title: title = v
                            elif kl in ["url", "applyurl", "link", "joburl"] and isinstance(v, str) and v.startswith("http"):
                                if not url: url = v
                            elif kl in ["id", "jobid", "reqid", "uuid", "guid", "jobreqid", "publicationid", "referencecode", "jobreferencecode", "jobcode", "postingid", "requisitionid"] and v:
                                ids[kl] = str(v)
                                
                        if title:
                            if not url and ids:
                                # Prioritize matching ID
                                job_id = None
                                if job_pattern and "jobreferencecode" in job_pattern.lower():
                                    job_id = ids.get("jobreferencecode") or ids.get("referencecode")
                                if not job_id:
                                    for id_key in ["referencecode", "jobreferencecode", "jobid", "id", "publicationid", "postingid", "reqid"]:
                                        if id_key in ids:
                                            job_id = ids[id_key]
                                            break
                                if not job_id:
                                    job_id = next(iter(ids.values()), None)
                                    
                                from urllib.parse import urlparse
                                parsed = urlparse(base_url)
                                domain = f"{parsed.scheme}://{parsed.netloc}"
                                if job_pattern and "{id}" in job_pattern:
                                    template = job_pattern if job_pattern.startswith("/") else f"/{job_pattern}"
                                    url = f"{domain}{template.replace('{id}', job_id)}"
                                else:
                                    url = f"{domain}/job/{job_id}"
                            if not url:
                                url = base_url
                            jobs.append({"title": title, "url": url})
            for item in obj:
                search_recursive(item)
        elif isinstance(obj, dict):
            for v in obj.values():
                search_recursive(v)

    search_recursive(data)
    
    # Deduplicate by title to avoid spam
    seen = set()
    unique = []
    for j in jobs:
        if j['title'] not in seen:
            seen.add(j['title'])
            unique.append(j)
    return unique

async def _run_playwright_extraction(config: dict, target_url: str, headless: bool = True):
    from playwright.async_api import async_playwright
    
    extracted_jobs = []
    intercepted_json = []

    async def handle_response(response):
        if response.request.resource_type in ["fetch", "xhr"]:
            try:
                # Only grab JSON responses that aren't huge
                logger.info(f"Intercepted: {response.url}")
                if True:
                    body = await response.json()
                body = await response.json()
                if isinstance(body, (list, dict)):
                    intercepted_json.append(body)
            except Exception as e:
                logger.error(f"Interceptor Error: {e}")
            except Exception:
                pass
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context()
        page = await context.new_page()
        page.on("response", handle_response)
        
        try:
            await page.goto(target_url, wait_until="networkidle", timeout=60000)
            # Execute search steps if provided
            steps = config.get("steps", [])
            for step in steps:
                action = step.get("action")
                selector = step.get("selector")
                
                if action == "wait_for_selector":
                    try:
                        await page.wait_for_selector(selector, timeout=step.get("timeout", 5000))
                    except Exception as e:
                        logger.warning(f"wait_for_selector failed: {e}")
                        
                elif action == "type":
                    val = step.get("value", "").replace("{keyword}", config.get("_injected_keyword", ""))
                    if not val: val = "engineer" # fallback so we get some results
                    try:
                        await page.fill(selector, val, timeout=5000)
                    except Exception as e:
                        try:
                            await page.click(selector, timeout=5000)
                            await page.keyboard.type(val)
                        except Exception as e2:
                            logger.warning(f"Failed to type in {selector}: {e2}")
                            
                elif action == "click":
                    try:
                        await page.click(selector, timeout=5000)
                        await page.wait_for_timeout(3000) # wait for search results
                    except Exception as e:
                        logger.warning(f"Failed to click {selector}: {e}")
                        
                elif action == "keyboard":
                    try:
                        await page.keyboard.press(step.get("key", "Enter"))
                        await page.wait_for_timeout(3000)
                    except Exception as e:
                        logger.warning(f"Failed to press key: {e}")
                        
            await page.wait_for_timeout(config.get("extra_wait_ms", 4000)) # Hydration wait
            
            js_extract = r"""() => {
                const root = document.querySelector('main, [role="main"], article') || document.body;
                const clone = root.cloneNode(true);
                clone.querySelectorAll('script, style, nav, header, footer, noscript, [aria-hidden="true"]').forEach(el => el.remove());
                const links = Array.from(clone.querySelectorAll('a[href]'));
                const results = [];
                links.forEach(el => {
                    let text = (el.innerText || el.getAttribute('aria-label') || '').trim();
                    // If text is empty, try to find a heading nearby or just use a placeholder
                    if (!text) {
                        const parent = el.closest('div, li, tr');
                        if (parent) {
                            const h = parent.querySelector('h1, h2, h3, h4, .title, [class*="title"]');
                            if (h) text = h.innerText.trim();
                        }
                    }
                    if (!text) text = "View Job Details";
                    
                    const href = el.getAttribute('href');
                    if (href && !href.startsWith('javascript:')) {
                        results.push({title: text, url: href});
                    }
                });
                return results;
            }"""
            
            job_pattern = config.get("job_url_pattern")
            next_sel = config.get("next_btn_selector")
            max_pages = config.get("max_pages", 5)
            
            all_extracted = []
            seen_urls = set()
            
            for page_num in range(max_pages):
                extracted = await page.evaluate(js_extract)
                
                page_extracted = False
                for item in extracted:
                    url_part = item["url"]
                    if url_part not in seen_urls:
                        if not job_pattern or re.search(job_pattern, url_part):
                            seen_urls.add(url_part)
                            all_extracted.append(item)
                            page_extracted = True
                            
                if intercepted_json:
                    logger.info(f"DOM Distiller found 0 jobs. Falling back to Network Interception heuristics... (Checking {len(intercepted_json)} payloads)")
                    for payload in intercepted_json:
                        api_jobs = extract_jobs_from_json(payload, target_url); logger.info(f"Found {len(api_jobs)} jobs in this payload!")
                        api_jobs = extract_jobs_from_json(payload, target_url, job_pattern)
                        logger.info(f"Found {len(api_jobs)} jobs in this payload!")
                        for j in api_jobs:
                            if j['url'] not in seen_urls:
                                seen_urls.add(j['url'])
                                all_extracted.append(j)
                    # Clear intercepts for the next page
                    intercepted_json.clear()
                    
                if not next_sel:
                    logger.info("No next_btn_selector provided, stopping pagination.")
                    break
                    
                try:
                    next_btn = page.locator(next_sel).first
                    if await next_btn.is_visible():
                        if not await next_btn.is_disabled():
                            logger.info(f"Page {page_num+1}: Clicking Next button ({next_sel})")
                            await next_btn.click(force=True, timeout=5000)
                            await page.wait_for_timeout(3000)
                        else:
                            logger.info(f"Page {page_num+1}: Next button is disabled. Stopping.")
                            break
                    else:
                        logger.info(f"Page {page_num+1}: Next button is not visible. Stopping.")
                        break
                except Exception as e:
                    logger.info(f"Page {page_num+1}: Failed to click Next button: {e}")
                    break
                    
            extracted_jobs = all_extracted
        except Exception as e:
            logger.error(f"Playwright execution failed: {e}")
        finally:
            await browser.close()
            
    return extracted_jobs

def process_playwright_agentic(db: Session, user_id: int, target: dict, keywords: List[str], locations: List[str], new_jobs: list, company_logs: list):
    company = target.get("company", "Unknown")
    # For SPAs, we don't inject keywords into the URL if we can just scrape everything and filter in Python
    # But if the URL has {keyword}, we format it with the first keyword or empty string
    target["_injected_keyword"] = keywords[0] if keywords else ""
    url_template = target.get("url", "")
    target_url = url_template.replace("{keyword}", keywords[0] if keywords else "")
    
    logger.info(f"[{company}] Running Config-Driven Playwright Scraper...")
    
    try:
        extracted_jobs = asyncio.run(_run_playwright_extraction(target, target_url))
        
        jobs_found_count = 0
        for job in extracted_jobs:
            title = job["title"]
            job_url = job["url"]
            
            # Resolve relative URLs
            if job_url.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(target_url)
                job_url = f"{parsed.scheme}://{parsed.netloc}{job_url}"
                
            if check_keywords_and_location(title, "", keywords, locations):
                if not has_been_notified(db, user_id, job_url):
                    new_jobs.append({"company": company, "title": title, "url": job_url, "location": ""})
                    jobs_found_count += 1
                    
        company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
        logger.info(f"[{company}] Found {jobs_found_count} matching jobs via Agentic Scraper.")
    except Exception as e:
        logger.error(f"[{company}] Agentic Scraper Failed: {e}")
        company_logs.append({"company": company, "status": "FAILED", "jobs_found": 0, "message": str(e)})
