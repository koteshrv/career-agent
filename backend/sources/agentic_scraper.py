import asyncio
import json
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

async def run_agent_loop(url: str, api_key: str, model_names: List[str], keyword: str):
    from playwright.async_api import async_playwright
    
    # Load targets.json
    try:
        with open("targets.json", "r") as f:
            targets = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load targets.json: {e}")
        return []
        
    # Determine which config to use based on URL
    config = None
    if isinstance(targets, list):
        for data in targets:
            c_url = data.get("url", "")
            if c_url and (data["company"].lower().replace(" ", "") in url.lower() or c_url.split("//")[1].split("/")[0] in url):
                config = data
                break
            
    if not config:
        logger.warning(f"No config found for URL: {url}. Falling back to default extraction.")
    else:
        # Override the entry URL with the optimal one from config
        if "url" in config:
            url = config["url"]
        
    extracted_jobs = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        logger.info(f"Navigating to initial URL: {url}")
        
        with open('agent_debug.log', 'a') as logf:
            logf.write(f"\n{'='*80}\n[RECORDER RUN] Starting Config-Driven Playwright Execution\n{'='*80}\n")
            logf.write(f"Target URL: {url}\nKeyword: {keyword}\nConfig Matched: {config.get('company', 'Unknown') if config else 'None'}\n\n")
            
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(3000) # Hydration wait
            
            if config and "steps" in config:
                for step_idx, step in enumerate(config["steps"]):
                    action = step.get("action")
                    selector = step.get("selector")
                    optional = step.get("optional", False)
                    desc = step.get("description", "")
                    
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[STEP {step_idx+1}] Action: {action} | Selector: {selector} | Desc: {desc}\n")
                        
                    try:
                        if action == "click":
                            await page.locator(selector).first.click(force=True, timeout=5000)
                            await page.wait_for_timeout(2000)
                        elif action == "type":
                            val = step.get("value", "").replace("{keyword}", keyword)
                            await page.locator(selector).first.fill(val, timeout=5000)
                            await page.wait_for_timeout(1000)
                        elif action == "wait_for_selector":
                            timeout = step.get("timeout", 5000)
                            await page.locator(selector).first.wait_for(state="visible", timeout=timeout)
                        elif action == "keyboard":
                            key = step.get("key")
                            await page.keyboard.press(key)
                            await page.wait_for_timeout(2000)
                            
                        with open('agent_debug.log', 'a') as logf:
                            logf.write(f"  -> SUCCESS\n")
                    except Exception as e:
                        with open('agent_debug.log', 'a') as logf:
                            logf.write(f"  -> FAILED: {str(e).splitlines()[0]}\n")
                        if not optional:
                            with open('agent_debug.log', 'a') as logf:
                                logf.write(f"  -> CRITICAL STEP FAILED. Aborting flow.\n")
                            break
                            
            # Now extract the jobs
            await page.wait_for_timeout(4000) # Wait for network requests to populate jobs
            
            with open('agent_debug.log', 'a') as logf:
                logf.write(f"\n[EXTRACTION] Running DOM Distillation\n")
                
            js_extract = r'''() => {
                // Remove noisy navigation, footers, headers
                const root = document.querySelector('main, [role="main"], article') || document.body;
                const clone = root.cloneNode(true);
                clone.querySelectorAll('script, style, nav, header, footer, noscript, [aria-hidden="true"]').forEach(el => el.remove());
                
                // Find all links in the clean tree
                const links = Array.from(clone.querySelectorAll('a[href]'));
                const results = [];
                links.forEach(el => {
                    const text = (el.innerText || el.getAttribute('aria-label') || '').trim();
                    const href = el.getAttribute('href');
                    if (text.length > 3 && text.length < 100 && href && !href.startsWith('javascript:')) {
                        results.push(`"${text}" -> ${href}`);
                    }
                });
                return [...new Set(results)]; // Deduplicate
            }'''
            
            extracted = await page.evaluate(js_extract)
            
            # Filter links by job_url_pattern if provided in config
            job_pattern = config.get("job_url_pattern")
            if job_pattern:
                import re
                filtered = []
                for item in extracted:
                    # item format: "Job Title" -> /url/path
                    parts = item.split(" -> ")
                    if len(parts) == 2:
                        url_part = parts[1]
                        if re.search(job_pattern, url_part):
                            filtered.append(item)
                extracted_jobs = filtered
                with open('agent_debug.log', 'a') as logf:
                    logf.write(f"  -> Applied filter '{job_pattern}', kept {len(extracted_jobs)}/{len(extracted)} links.\n")
            else:
                extracted_jobs = extracted
            
            with open('agent_debug.log', 'a') as logf:
                logf.write(f"  -> Extracted {len(extracted_jobs)} potential job links:\n")
                for link in extracted_jobs:
                    logf.write(f"     * {link}\n")
                
        except Exception as e:
            logger.error(f"Error in config runner: {e}")
            with open('agent_debug.log', 'a') as logf:
                logf.write(f"\n[FATAL ERROR] {e}\n")
                
        await browser.close()
        return extracted_jobs
