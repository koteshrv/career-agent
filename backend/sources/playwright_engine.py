import asyncio
import logging
import re
import urllib.parse
from typing import List, Dict

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

try:
    from pyvirtualdisplay import Display
    HAS_VIRTUAL_DISPLAY = True
except ImportError:
    HAS_VIRTUAL_DISPLAY = False

from playwright.async_api import async_playwright
from playwright_stealth import Stealth
try:
    from fake_useragent import UserAgent
    ua = UserAgent(os="windows", browsers=["chrome", "edge"])
except ImportError:
    ua = None

from .common import is_valid_candidate, _find_jobs_in_json, has_been_notified

logger = logging.getLogger(__name__)


async def dismiss_popups(page) -> None:
    """Aggressively dismiss cookie banners, chatbots, and modal overlays.

    Three-phase approach:
    1. Click any visible 'accept/allow/agree/close' buttons
    2. Press Escape to close any remaining modal/dialog
    3. Forcibly hide all fixed/sticky overlays from the DOM
    """
    import re

    # Phase 1a: Click consent buttons (Accept All, Allow, Agree, etc.)
    CONSENT_PATTERNS = re.compile(
        r"^(Accept All|Accept all|Allow All|Allow all|Accept Cookies|Accept cookies|"
        r"Got it|Got It|I Accept|I agree|I Agree|Agree|Accept|Allow|Confirm|OK|Close|Decline All|Reject All)$",
        re.IGNORECASE
    )
    try:
        consent_btn = page.locator('button, a, [role="button"], [type="button"]').filter(
            has_text=CONSENT_PATTERNS
        ).first
        if await consent_btn.is_visible(timeout=1500):
            logger.debug("  [popup] Clicking consent button...")
            await consent_btn.click(timeout=2000, force=True)
            await page.wait_for_timeout(700)
    except Exception:
        pass

    # Phase 1b: Click any visible close/X buttons on popups, chatbots, and modals
    CLOSE_PATTERNS = re.compile(r"^(Close|close|Dismiss|dismiss|×|✕|✖|X|x)$")
    try:
        close_btns = page.locator(
            '[aria-label*="close" i], [aria-label*="dismiss" i], [title*="close" i], '
            '[class*="close"], [class*="dismiss"], [id*="close"], '
            'button[class*="chat"], [class*="cookie"] button'
        )
        count = await close_btns.count()
        for idx in range(min(count, 5)):  # try up to 5 close buttons
            btn = close_btns.nth(idx)
            if await btn.is_visible(timeout=500):
                logger.debug("  [popup] Clicking close/X button...")
                await btn.click(timeout=1000, force=True)
                await page.wait_for_timeout(400)
    except Exception:
        pass

    # Phase 2: Press Escape to close any remaining overlay/dialog
    # NOTE: Intentionally skipped — Escape resets state on many JS SPAs
    # (e.g. Microsoft Careers, Google Careers) causing pagination to break.

    # Phase 3: Forcibly hide remaining fixed/sticky overlays from the DOM
    try:
        await page.evaluate('''
            () => {
                const BANNER_SELECTORS = [
                    'iframe',
                    '[id*="cookie"]', '[class*="cookie"]',
                    '[id*="consent"]', '[class*="consent"]',
                    '[id*="gdpr"]',   '[class*="gdpr"]',
                    '[id*="banner"]', '[class*="banner"]',
                    '[id*="popup"]',  '[class*="popup"]',
                    '[id*="modal"]',  '[class*="modal"]',
                    '[id*="overlay"]','[class*="overlay"]',
                    '[id*="chat"]',   '[class*="chat"]',
                    '[id*="bot"]',    '[class*="bot"]',
                    '[id*="widget"]', '[class*="widget"]',
                ];
                BANNER_SELECTORS.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        if (!el || !el.style) return;
                        // Only hide if it is overlaying the page (fixed/sticky/absolute)
                        const style = window.getComputedStyle(el);
                        if (['fixed', 'sticky', 'absolute'].includes(style.position)
                            || el.tagName === 'IFRAME') {
                            el.style.setProperty('display', 'none', 'important');
                            el.style.setProperty('visibility', 'hidden', 'important');
                        }
                    });
                });
                // Restore scrollability in case a banner locked the body scroll
                document.body.style.removeProperty('overflow');
                document.documentElement.style.removeProperty('overflow');
            }
        ''')
    except Exception:
        pass


async def extract_playwright_jobs(page, keyword: str, source_url: str, max_pages: int = 10, infinite_scroll: bool = False, job_url_pattern: str = None, next_btn_selector: str = None, force_url_pagination: bool = False):
    """Pull all links from a rendered page (with pagination or infinite scroll) and let Gemini filter.

    Returns (jobs, error). `jobs` holds whatever was collected before a failure — a mid-run
    error doesn't discard already-found results. But unlike before, `error` is no longer
    swallowed here: the caller decides what a failed extraction means for this company's
    reported status, rather than it silently looking identical to "found 0 jobs, all good".
    """
    jobs, seen = [], set()
    error = None

    try:
        for i in range(max_pages): # Scrape up to max_pages
            if "tcsapps.com" in source_url:
                try:
                    # Wait for the API call to finish so the pagination block is no longer hidden
                    await page.wait_for_selector("#paging:not(.ng-hide)", timeout=15000)
                except:
                    pass

            await page.wait_for_timeout(500)
            await dismiss_popups(page)  # Dismiss on every page/iteration

            html_snippet = await page.evaluate(r'''() => {
                let results = [];
                // 1. Standard anchor tags
                document.querySelectorAll('a[href]').forEach(el => {
                    let text = (el.innerText || el.getAttribute('aria-label') || el.title || "").replace(/\s+/g, ' ').trim();

                    // Smarter title extraction for Oracle HCM / complex cards (e.g. Hexaware Technologies)
                    // If the text is empty, generic, or just a company name, look in the parent container.
                    if (!text || text.toLowerCase().includes("apply") || text.toLowerCase().includes("view job") || text.length < 5 || text.toLowerCase() === "hexaware technologies") {
                        const container = el.closest('li, .job-list-item, .card, article, [class*="job-item"], div[class*="job"]');
                        if (container) {
                            const heading = container.querySelector('h1, h2, h3, h4, h5, .job-title, [class*="title"], [class*="jobTitle"]');
                            if (heading && heading.innerText) {
                                text = heading.innerText.replace(/\s+/g, ' ').trim();
                            } else {
                                // Fallback: grab the first bold or distinct text in the container
                                const strong = container.querySelector('strong, b, [class*="title-text"]');
                                if (strong && strong.innerText) text = strong.innerText.replace(/\s+/g, ' ').trim();
                            }
                        }
                    }

                    results.push({title: text, href: el.href || ""});
                });

                // 2. AngularJS click handlers with string literals
                document.querySelectorAll('[data-ng-click*="/jobs/"]').forEach(el => {
                    const clickAttr = el.getAttribute('data-ng-click') || "";
                    const match = clickAttr.match(/goTo\(['"]?(\/jobs\/[^'"]+)['"]?\)/);
                    if (match) {
                        const href = window.location.origin + '/candidate' + match[1];
                        const text = (el.innerText || "").replace(/\s+/g, ' ').trim();
                        results.push({title: text, href: href});
                    }
                });

                // 3. AngularJS dynamic scope extraction (TCS iBegin)
                if (window.angular) {
                    document.querySelectorAll('.job-window, [data-ng-repeat*=" in "], [data-ng-click^="jobDesc"]').forEach(el => {
                        try {
                            const scope = window.angular.element(el).scope();
                            if (scope) {
                                const jobObj = scope.job || scope.j;
                                if (jobObj && jobObj.jobId) {
                                    const href = window.location.origin + '/candidate/jobs/' + jobObj.jobId;
                                    const title = jobObj.title || "";
                                    results.push({title: title, href: href});
                                }
                            }
                        } catch (e) {}
                    });
                }

                return results.filter(x => x.href && x.href.startsWith('http') && x.title !== undefined);
            }''')

            new_this_page = 0
            for item in html_snippet:
                title = item["title"]
                href = item["href"]
                if href in seen:
                    continue

                if job_url_pattern:
                    # If target defines an exact pattern (regex), use ONLY that to filter, and mark it to bypass AI.
                    if re.search(job_url_pattern, href):
                        seen.add(href)
                        jobs.append({"title": title, "href": href, "source_url": source_url, "skip_ai": True})
                        new_this_page += 1
                        logger.debug(f"  + Collected (REGEX MATCH): {title[:60]!r} -> {href[:80]}")
                    continue

                if not is_valid_candidate(href, title, strict_hints=True):
                    continue
                seen.add(href)
                jobs.append({"title": title, "href": href, "source_url": source_url})
                new_this_page += 1
                logger.debug(f"  + Collected: {title[:60]!r} -> {href[:80]}")

            # (dismiss_popups already handles cleanup above)

            if i == max_pages - 1:
                logger.warning(f"  [!] Max pages ({max_pages}) reached. More jobs may be available.")
                break

            if infinite_scroll:
                # Scroll the window AND all scrollable containers to trigger lazy loading.
                # This works for Oracle HCM and other SPAs that use nested scroll views.
                prev_height = await page.evaluate("document.body.scrollHeight")

                await page.evaluate('''() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    const scrollables = Array.from(document.querySelectorAll('*')).filter(
                        e => e.scrollHeight > e.clientHeight &&
                        (getComputedStyle(e).overflowY === 'auto' || getComputedStyle(e).overflowY === 'scroll')
                    );
                    for (const s of scrollables) {
                        s.scrollTop = s.scrollHeight;
                    }
                }''')
                await page.wait_for_timeout(3000)

                new_height = await page.evaluate("document.body.scrollHeight")
                # We can't rely strictly on body height changing if it's an inner container.
                # So we just rely on new jobs being found (checked below).
            else:
                if force_url_pagination and "page=" in source_url.lower():
                    # Skip button clicking entirely to prevent SPA state loss
                    next_btn = None
                else:
                    # Try to click next page button
                    next_btn = await page.evaluate_handle('''([selector]) => {
                        if (selector) {
                            const b = document.querySelector(selector);
                            if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled')) {
                                const style = window.getComputedStyle(b);
                                if (style.display !== 'none' && style.visibility !== 'hidden') return b;
                            }
                        }

                        // Fallback to heuristic matches
                        const exact_btns = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], .pagination-next, .next'));
                        for (const b of exact_btns) {
                            const text = (b.innerText || "").toLowerCase().trim();
                            const aria = (b.getAttribute('aria-label') || "").toLowerCase();
                            if (text === "next" || text === "next page" || text === ">" || text === "›" || aria.includes("next")) {
                                if (!b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled')) {
                                    // Ignore hidden elements
                                    const style = window.getComputedStyle(b);
                                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                                        return b;
                                    }
                                }
                            }
                        }
                        return null;
                    }''', [next_btn_selector])
                if not next_btn or not await next_btn.json_value():
                    # Fallback: if we can't find a Next button (or force_url_pagination is true), manipulate the source_url directly
                    if "page=" in source_url.lower():
                        match = re.search(r'page=(\d+)', source_url, re.IGNORECASE)
                        if match:
                            start_page = int(match.group(1))
                            next_page = start_page + i + 1
                            next_page_url = re.sub(r'page=\d+', f'page={next_page}', source_url, flags=re.IGNORECASE)
                            logger.debug(f"Paginating via URL: {next_page_url}")
                            await page.goto(next_page_url, wait_until="domcontentloaded", timeout=30000)
                            await page.wait_for_timeout(4000)
                            continue
                    break

                # Prefer native Playwright click to perfectly mimic human interaction.
                # This ensures SPA frameworks like Angular/React register the event properly in their zones.
                try:
                    # Scroll to bottom so the user visually sees the scroll happening
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(500)

                    # Scroll the element perfectly to the center of the screen to avoid sticky footers
                    await page.evaluate("(btn) => btn.scrollIntoView({block: 'center', inline: 'center'})", next_btn)
                    await page.wait_for_timeout(500)

                    # (The network interceptor added during the initial search will automatically catch and fix pagination API calls!)

                    # Use Playwright's trusted physical click so Angular's on-touch prevents the page from reloading
                    await next_btn.click(timeout=5000)
                except Exception as e:
                    logger.debug(f"Native click failed: {e}, falling back to JS synthetic click")
                    await page.evaluate('''(btn) => {
                        btn.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));
                    }''', next_btn)

                # SPAs load content dynamically without triggering DOMContentLoaded.
                # A hard wait ensures network requests finish and DOM updates.
                await page.wait_for_timeout(4000)

            # If we didn't find any NEW jobs on this page/scroll, we've hit the end.
            if new_this_page == 0:
                logger.debug("  No new jobs found on this page/scroll, stopping.")
                break

    except Exception as e:
        logger.error(f"Playwright extraction/pagination failed: {e}")
        error = e

    logger.info(f"Raw link extraction yielded {len(jobs)} candidates from {page.url}")
    return jobs, error

# Broad, near-universal job-title words. Used only as a diagnostic probe (see
# probe_extraction_pipeline below) — not meant to find real matches, just to prove the
# search + selector + pagination pipeline can still find *something*.
CANARY_KEYWORDS = ("engineer", "manager", "analyst")

async def probe_extraction_pipeline(page, company: str, url_template: str, search_input_selector: str = None,
                                     search_btn_selector: str = None, no_results_text: str = "0 results",
                                     job_url_pattern: str = None, next_btn_selector: str = None,
                                     force_url_pagination: bool = False) -> bool:
    """After a company's real keywords all found 0 jobs, this answers: is that a real dry
    spell, or did the scraper break (selector changed, site redesigned) without raising?

    A broken selector/site redesign usually doesn't throw — extract_playwright_jobs just
    quietly returns an empty list, which looks identical to "no matching jobs today"
    everywhere downstream. Re-running the search with a generic, near-universal term
    (CANARY_KEYWORDS) gives a direct answer instead of waiting on statistics: if even
    "engineer"/"manager"/"analyst" turns up nothing, the pipeline itself is what's broken.

    Deliberately cheap: max_pages=1 (we only need evidence something exists, not an
    exhaustive count) and stops at the first canary term that finds anything.

    Returns True if the pipeline looks healthy (a canary term found ≥1 raw link), False if
    every canary term also found nothing. Any exception during the probe itself is treated
    as inconclusive (returns True) — a flaky diagnostic shouldn't manufacture a false alert
    on top of whatever the real run already reported.
    """
    for canary in CANARY_KEYWORDS:
        try:
            if search_input_selector:
                url = url_template.split('?')[0]
            else:
                url = url_template.replace("{keyword}", urllib.parse.quote(canary))

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            if search_input_selector:
                await dismiss_popups(page)
                input_loc = page.locator(search_input_selector)
                await input_loc.fill(canary, timeout=10000)
                await page.wait_for_timeout(500)
                if search_btn_selector:
                    await page.locator(search_btn_selector).click()
                else:
                    await input_loc.press("Enter")
                await page.wait_for_timeout(5000)
            else:
                await page.wait_for_timeout(5000)

            await dismiss_popups(page)
            content = (await page.content()).lower()
            if no_results_text.lower() in content:
                continue

            jobs, _ = await extract_playwright_jobs(
                page, canary, url, max_pages=1,
                job_url_pattern=job_url_pattern,
                next_btn_selector=next_btn_selector,
                force_url_pagination=force_url_pagination,
            )
            if jobs:
                logger.info(f"[{company}] Canary probe ('{canary}') found {len(jobs)} link(s) — extraction pipeline looks healthy; today's 0 real matches is likely genuine.")
                return True
        except Exception as e:
            logger.debug(f"[{company}] Canary probe ('{canary}') itself failed, treating as inconclusive: {e}")
            return True

    logger.warning(f"[{company}] Canary probe found 0 links across all generic terms {CANARY_KEYWORDS} — likely a broken selector, not a real dry spell.")
    return False

async def fetch_job_descriptions_httpx(urls: List[str]) -> Dict[str, str]:
    """Fetch visible text from a batch of URLs using fast httpx concurrency."""
    results = {url: "" for url in urls}
    if not urls:
        return results

    async def fetch_url(client: httpx.AsyncClient, url: str) -> tuple[str, str]:
        try:
            resp = await client.get(url, timeout=15.0)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                for tag in soup(["script", "style", "noscript", "nav", "header", "footer"]):
                    tag.decompose()
                text = soup.get_text(separator=' ')
                clean_text = re.sub(r'\s+', ' ', text).strip()
                return url, clean_text
        except Exception as e:
            logger.debug(f"httpx fetch failed for {url}: {e}")
        return url, ""

    headers = {'User-Agent': ua.random if ua else 'Mozilla/5.0'}
    async with httpx.AsyncClient(headers=headers, verify=False, follow_redirects=True) as client:
        tasks = [fetch_url(client, url) for url in urls]
        fetched = await asyncio.gather(*tasks)
        for url, text in fetched:
            results[url] = text

    return results

async def fetch_job_descriptions_batch(urls: List[str], headless: bool = True) -> Dict[str, str]:
    """Fetch visible text from a batch of URLs using a single headless Playwright instance."""
    results = {url: "" for url in urls}
    if not urls:
        return results

    display = None
    if HAS_VIRTUAL_DISPLAY and not headless:
        try:
            display = Display(visible=0, size=(1280, 800))
            display.start()
        except Exception as e:
            logger.warning(f"Could not start virtual display, falling back to standard: {e}")
            display = None

    try:
        async with async_playwright() as p:
            args = [
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-reading-from-canvas",
                "--disable-webgl"
            ]
            browser = await p.chromium.launch(headless=headless, args=args)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=ua.random if ua else None
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)

            for url in urls:
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=20000)

                    # Give SPAs time to render their content
                    try:
                        # Wait for common JD containers
                        await page.wait_for_selector('div[itemprop="description"], .job-description, #job-description, .description, [class*="job-description"], [data-testid="job-description"], .bx--article', timeout=8000)
                    except Exception:
                        pass

                    await page.wait_for_timeout(3000)

                    await page.evaluate('''() => {
                        document.querySelectorAll('script, style, noscript, nav, header, footer, iframe, svg, [role="navigation"], [role="banner"], [role="contentinfo"]').forEach(el => el.remove());
                    }''')

                    text = await page.locator("body").inner_text(timeout=5000)
                    clean_text = re.sub(r'\\n+', '\\n\\n', text).strip()

                    if "Cloudflare Ray ID:" in clean_text or "Sorry, you have been blocked" in clean_text:
                        logger.warning(f"Cloudflare block on JD: {url}")
                        continue

                    results[url] = clean_text
                except Exception as e:
                    logger.debug(f"Failed to fetch JD {url}: {e}")

            await browser.close()
    except Exception as e:
        logger.error(f"Playwright batch fetch failed: {e}")
    finally:
        if display:
            try:
                display.stop()
            except Exception:
                pass

    return results

async def fetch_job_description(url: str) -> str:
    """Fetch visible text from a URL using headless Playwright."""

    # Optional virtual display for Docker environments to bypass Cloudflare
    display = None
    if HAS_VIRTUAL_DISPLAY:
        try:
            display = Display(visible=0, size=(1280, 800))
            display.start()
        except Exception as e:
            logger.warning(f"Could not start virtual display, falling back to standard: {e}")
            display = None

    try:
        async with async_playwright() as p:
            args = [
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-reading-from-canvas",
                "--disable-webgl"
            ]
            browser = await p.chromium.launch(headless=False, args=args)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=ua.random if ua else None
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)

            await page.goto(url, wait_until="domcontentloaded", timeout=20000)

            # Remove scripts, styles, and nav elements to get clean text
            await page.evaluate('''() => {
                document.querySelectorAll('script, style, noscript, nav, header, footer, iframe, svg').forEach(el => el.remove());
            }''')

            # Extract text from body
            text = await page.locator("body").inner_text()
            await browser.close()

            # Clean up excessive whitespace
            clean_text = re.sub(r'\\n+', '\\n\\n', text).strip()

            if "Cloudflare Ray ID:" in clean_text or "Sorry, you have been blocked" in clean_text:
                raise ValueError("Cloudflare bot protection blocked the request.")

            return clean_text
    except ValueError as ve:
        logger.warning(f"JD fetch blocked: {ve}")
        raise
    except Exception as e:
        logger.error(f"Failed to fetch JD from {url}: {e}")
        return ""
    finally:
        if display:
            try:
                display.stop()
            except Exception:
                pass

async def process_playwright(db: Session, targets: List[dict], keywords: List[str], new_jobs: list, company_logs: list, headless: bool = True):
    from .. import crud
    settings = crud.get_settings(db)
    max_pages_limit = settings.max_pages if settings and settings.max_pages else 3

    display = None
    if HAS_VIRTUAL_DISPLAY:
        try:
            display = Display(visible=0, size=(1280, 800))
            display.start()
            headless = False
            logger.info("Started pyvirtualdisplay for headed Playwright execution inside Docker.")
        except Exception as e:
            logger.warning(f"Could not start virtual display in process_playwright: {e}")
            display = None

    if not targets:
        if display:
            try:
                display.stop()
            except: pass
        return

    async with async_playwright() as p:
        args = [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-reading-from-canvas",
            "--disable-webgl"
        ]
        browser = await p.chromium.launch(headless=headless, args=args)

        for target in targets:
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=ua.random if ua else None
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            company = target.get("company", "Unknown")
            url_template = target.get("url")

            api_extracted_jobs = []
            async def intercept_json_responses(response):
                try:
                    if response.request.resource_type in ["xhr", "fetch"]:
                        content_type = response.headers.get("content-type", "")
                        if "json" in content_type:
                            json_data = await response.json()
                            if json_data:
                                jobs = _find_jobs_in_json(json_data)
                                for j in jobs:
                                    if not j["href"].startswith("http"):
                                        href_str = str(j["href"])
                                        if "infosys" in response.url.lower() and href_str.isdigit():
                                            j["href"] = f"https://career.infosys.com/jobdesc/{href_str}"
                                        elif "hcltech" in response.url.lower() and href_str.isdigit():
                                            j["href"] = f"https://careers.hcltech.com/job/{href_str}"
                                        else:
                                            j["href"] = urllib.parse.urljoin(response.url, href_str)
                                if jobs:
                                    api_extracted_jobs.extend(jobs)
                except Exception as e:
                    # This fires on every xhr/fetch response, most of which aren't job data,
                    # so most failures here are benign (non-JSON body, etc). Debug-only, but
                    # no longer a fully silent pass — turn on debug_logging_enabled in Settings
                    # to see if this interceptor (the primary discovery path for some
                    # companies, e.g. Infosys/HCLTech) is actually breaking vs. just not matching.
                    logger.debug(f"[{company}] Response interceptor error on {response.url[:100]}: {e}")
            page.on("response", intercept_json_responses)

            logger.info(f"Scraping playwright board for {company}...")
            if not url_template:
                continue

            no_results_text = target.get("no_results_text", "0 results").lower()
            infinite_scroll = target.get("infinite_scroll", False)
            job_url_pattern = target.get("job_url_pattern")
            next_btn_selector = target.get("next_btn_selector")
            force_url_pagination = target.get("force_url_pagination", False)
            intersect_with = target.get("intersect_with")

            jobs_found_count = 0
            has_error = False
            error_msg = ""

            intersect_seen = None
            if intersect_with:
                intersect_seen = set()
                try:
                    logger.info(f"[{company}] Running intersection pre-pass on {intersect_with}")
                    extra_wait = target.get("extra_wait_ms", 0)
                    try:
                        if extra_wait > 0:
                            await page.goto(intersect_with, wait_until="networkidle", timeout=45000)
                        else:
                            await page.goto(intersect_with, wait_until="domcontentloaded", timeout=30000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(5000 + extra_wait)
                    await dismiss_popups(page)

                    content = (await page.content()).lower()
                    if no_results_text not in content:
                        intersect_extracted, intersect_error = await extract_playwright_jobs(
                            page, "intersection", intersect_with, max_pages=max_pages_limit,
                            infinite_scroll=infinite_scroll,
                            job_url_pattern=job_url_pattern,
                            next_btn_selector=next_btn_selector,
                            force_url_pagination=force_url_pagination
                        )
                        if intersect_extracted:
                            for job in intersect_extracted:
                                intersect_seen.add(job["href"])
                        # Soft-fail: the intersection pass is an optional refinement, not the
                        # main discovery path, so log but don't mark the whole company FAILED.
                        if intersect_error:
                            logger.warning(f"[{company}] Intersection extraction hit an error (continuing with {len(intersect_seen)} URLs found so far): {intersect_error}")
                    logger.info(f"[{company}] Intersection pass found {len(intersect_seen)} URLs")
                except Exception as e:
                    logger.error(f"[{company}] Intersection pass failed: {e}")

            search_input_selector = target.get("search_input_selector")
            search_btn_selector = target.get("search_btn_selector")

            company_seen = set()  # dedup across keyword searches for this company
            for keyword in keywords:
                if search_input_selector:
                    url = url_template.split('?')[0]
                else:
                    url = url_template.replace("{keyword}", urllib.parse.quote(keyword))

                new_from_keyword = 0
                extracted = []
                extraction_error = None
                try:
                    if company == "Infosys":
                        async def intercept_infosys(route, request):
                            if "getCareerSearchJobs" in request.url and request.method == "GET":
                                new_url = request.url.replace("searchText=ALL", f"searchText={urllib.parse.quote(keyword)}")
                                await route.continue_(url=new_url)
                            else:
                                await route.continue_()
                        await page.route("**/getCareerSearchJobs**", intercept_infosys)

                    logger.debug(f"[{company}] Navigating to: {url}")
                    extra_wait = target.get("extra_wait_ms", 0)
                    try:
                        if extra_wait > 0:
                            # Use networkidle for heavy JS sites — waits until all XHR/fetch settle
                            await page.goto(url, wait_until="networkidle", timeout=45000)
                        else:
                            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    except Exception:
                        # Fallback if networkidle times out
                        pass

                    if search_input_selector:
                        logger.info(f"[{company}] Executing UI search for '{keyword}'")
                        await dismiss_popups(page)
                        try:
                            if "tcsapps.com" in url:
                                # ULTIMATE FIX: Intercept the API requests at the network layer!
                                # By dumping the raw API payload, we discovered the filter key is 'userText'.
                                # This completely bypasses all Angular 1.x UI bugs by forcefully injecting
                                # the filter directly into outgoing HTTP requests (both initial and pagination).
                                async def intercept_tcs(route, request):
                                    if request.method == "POST":
                                        try:
                                            import json
                                            data = json.loads(request.post_data)
                                            data["userText"] = keyword
                                            # Forward the modified payload to the server
                                            await route.continue_(post_data=json.dumps(data).encode("utf-8"), headers=request.headers)
                                        except Exception as e:
                                            logger.error(f"TCS route intercept failed: {e}")
                                            await route.continue_()
                                    else:
                                        await route.continue_()
                                await page.route("**/api/v1/jobs/search**", intercept_tcs)

                            # Perform a basic UI interaction so Angular triggers the API request
                            input_loc = page.locator(search_input_selector)
                            await input_loc.fill(keyword, timeout=10000)
                            await page.wait_for_timeout(500)
                            if search_btn_selector:
                                await page.locator(search_btn_selector).click()
                            else:
                                await input_loc.press("Enter")

                            # Wait for background APIs to settle after searching
                            await page.wait_for_timeout(5000)

                            # The API call wait is handled dynamically inside extract_playwright_jobs via #paging:not(.ng-hide)
                        except Exception as ui_e:
                            logger.error(f"UI search failed: {ui_e}")
                    else:
                        # Base wait + any extra configured for this target
                        await page.wait_for_timeout(5000 + extra_wait)

                    # Dismiss all popups before reading content or clicking pagination
                    await dismiss_popups(page)

                    content = (await page.content()).lower()

                    if company == "TCS":
                        with open(f"/home/hari/job-scraper/tests/dump/tcs_debug_{keyword}.html", "w") as f:
                            f.write(await page.content())
                        logger.info(f"Dumped TCS DOM to tcs_debug_{keyword}.html")

                    if no_results_text in content:
                        logger.debug(f"[{company}] No results for keyword '{keyword}' (found no_results_text)")
                    else:
                        extracted, extraction_error = await extract_playwright_jobs(
                            page, keyword, url, max_pages=max_pages_limit,
                            infinite_scroll=infinite_scroll,
                            job_url_pattern=job_url_pattern,
                            next_btn_selector=next_btn_selector,
                            force_url_pagination=force_url_pagination
                        )
                        if extracted:
                            for job in extracted:
                                href = job["href"]
                                if intersect_seen is not None and href not in intersect_seen:
                                    continue
                                if href in company_seen:
                                    logger.debug(f"[{company}] Skipping duplicate URL: {href[:80]}")
                                    continue
                                company_seen.add(href)
                                if not has_been_notified(db, href):
                                    skip_ai = job.get("skip_ai", False)
                                    new_jobs.append({"company": company, "title": job["title"], "url": href, "location": "", "source_url": url, "skip_ai": skip_ai})
                                    jobs_found_count += 1
                                    new_from_keyword += 1
                                else:
                                    logger.debug(f"[{company}] Already in DB, skipping: {href[:80]}")

                    if api_extracted_jobs:
                        # Infosys API ignores searchText and returns ALL jobs, so we must manually filter them.
                        if company == "Infosys":
                            api_extracted_jobs = [j for j in api_extracted_jobs if keyword.lower() in j["title"].lower()]

                        # Prevent massive API payloads (e.g. Infosys returning 1200 jobs at once) from freezing the scraper
                        max_api_jobs = 50
                        api_extracted_jobs = api_extracted_jobs[:max_api_jobs]

                        logger.info(f"[{company}] API Interceptor caught {len(api_extracted_jobs)} background jobs! Sample: {api_extracted_jobs[0] if api_extracted_jobs else 'None'}")
                        for job in api_extracted_jobs:
                            href = job["href"]
                            if job_url_pattern and not re.search(job_url_pattern, href, re.IGNORECASE):
                                logger.debug(f"[{company}] Interceptor dropped URL due to pattern: {href}")
                                continue
                            if intersect_seen is not None and href not in intersect_seen:
                                continue
                            if href in company_seen:
                                continue
                            company_seen.add(href)
                            if not has_been_notified(db, href):
                                logger.debug(f"[{company}] Interceptor adding new job: {href}")
                                new_jobs.append({"company": company, "title": job["title"], "url": href, "location": "", "source_url": url, "skip_ai": False})
                                jobs_found_count += 1
                                new_from_keyword += 1
                            else:
                                logger.debug(f"[{company}] Interceptor dropped URL (already notified): {href}")
                        api_extracted_jobs.clear()

                        logger.debug(f"[{company}] keyword='{keyword}': {len(extracted or [])} raw links, {new_from_keyword} new added")

                    # Process whatever partial DOM-scraped and interceptor-caught results came
                    # back above, THEN surface the error — an extraction failure must not look
                    # identical to "0 jobs, all good" in company_logs / the target-health rollup.
                    if extraction_error:
                        raise extraction_error
                except Exception as e:
                    logger.error(f"Playwright error {company}: {e}")
                    has_error = True
                    error_msg = str(e)
                finally:
                    if company == "Infosys":
                        try:
                            await page.unroute("**/getCareerSearchJobs**")
                        except Exception:
                            pass

            # All real keywords found nothing, and nothing raised — ambiguous: could be a
            # genuine dry spell, could be a selector that broke silently. Ask directly rather
            # than waiting on the statistical zero_streak signal (backend/crud.py) to
            # accumulate 3 runs of history before flagging it.
            if not has_error and jobs_found_count == 0:
                try:
                    pipeline_healthy = await probe_extraction_pipeline(
                        page, company, url_template,
                        search_input_selector=search_input_selector,
                        search_btn_selector=search_btn_selector,
                        no_results_text=no_results_text,
                        job_url_pattern=job_url_pattern,
                        next_btn_selector=next_btn_selector,
                        force_url_pagination=force_url_pagination,
                    )
                except Exception as e:
                    logger.debug(f"[{company}] Canary probe crashed, treating as inconclusive: {e}")
                    pipeline_healthy = True
                if not pipeline_healthy:
                    has_error = True
                    error_msg = "0 jobs found for all real keywords, and the canary probe (generic terms) also found nothing — likely a broken selector, not a real dry spell."

            if has_error:
                company_logs.append({"company": company, "status": "FAILED", "jobs_found": jobs_found_count, "message": error_msg})
                logger.info(f"Finished {company}: FAILED, found {jobs_found_count} jobs")
            else:
                company_logs.append({"company": company, "status": "SUCCESS", "jobs_found": jobs_found_count})
                logger.info(f"Finished {company}: SUCCESS, found {jobs_found_count} jobs")

            try:
                await context.close()
            except Exception:
                pass

        await browser.close()

    if display:
        try:
            display.stop()
        except Exception:
            pass
