"""
Career Agent - Target Recorder
================================
Runs ONE browser session with an in-page overlay that guides you through
3 phases without ever closing and reopening the browser.

Usage:
    venv/bin/python3 record_magic.py
"""

import asyncio, json, os, re, sys, traceback
from urllib.parse import urlparse
from playwright.async_api import async_playwright

# ── Helpers ────────────────────────────────────────────────────────────────────

def best_selector(el_info: dict) -> str:
    """Build the most stable CSS selector from element metadata."""
    tag       = el_info.get("tag", "div")
    test_id   = el_info.get("testId")
    el_id     = el_info.get("elId")
    name      = el_info.get("name")
    aria      = el_info.get("aria")
    cls       = el_info.get("cls", "")
    inner     = el_info.get("inner", "").strip()

    if test_id: return f"[data-testid='{test_id}']"
    if el_id:   return f"#{el_id}"
    if name:    return f"[name='{name}']"
    if aria:    return f"{tag}[aria-label='{aria}']"
    if inner and len(inner) < 15 and "\n" not in inner: return f"{tag}:has-text('{inner}')"
    tokens = [c for c in cls.split() if len(c) > 2 and not c.isdigit()][:2]
    if tokens:  return f"{tag}.{'.'.join(tokens)}"
    return tag

def smart_diff_selector(prev_el: dict, next_el: dict) -> str:
    """Compare the Previous and Next buttons to mathematically isolate the unique selector."""
    if not prev_el:
        return best_selector(next_el)
        
    tag = next_el.get("tag", "button")
    
    # 1. Diff explicitly unique attributes
    if next_el.get("testId") != prev_el.get("testId") and next_el.get("testId"):
        return f"[data-testid='{next_el['testId']}']"
    if next_el.get("aria") != prev_el.get("aria") and next_el.get("aria"):
        return f"{tag}[aria-label='{next_el['aria']}']"
    if next_el.get("elId") != prev_el.get("elId") and next_el.get("elId"):
        return f"#{next_el['elId']}"
        
    # 2. Diff CSS classes
    prev_cls = set(prev_el.get("cls", "").split())
    next_cls = set(next_el.get("cls", "").split())
    unique_cls = next_cls - prev_cls
    if unique_cls:
        # Use the longest unique class name (usually the most specific)
        best_cls = sorted(list(unique_cls), key=len, reverse=True)[0]
        return f"{tag}.{best_cls}"
        
    # 3. Diff innerText
    if next_el.get("inner") != prev_el.get("inner") and next_el.get("inner"):
        txt = next_el["inner"].strip()
        if len(txt) < 15 and "\n" not in txt:
            return f"{tag}:has-text('{txt}')"
            
    # 4. Deep DOM diffing (e.g., finding unique image srcs like icon-next.svg)
    next_html = next_el.get("html", "")
    prev_html = prev_el.get("html", "")
    if next_html != prev_html:
        # Extract all image srcs
        next_srcs = set(re.findall(r'src=["\']([^"\']+)["\']', next_html))
        prev_srcs = set(re.findall(r'src=["\']([^"\']+)["\']', prev_html))
        unique_srcs = next_srcs - prev_srcs
        if unique_srcs:
            # Grab the filename part of the src
            filename = list(unique_srcs)[0].split("/")[-1].split("?")[0]
            if filename:
                return f"{tag}:has(img[src*='{filename}'])"
                
    # Fallback if no differences are found
    return best_selector(next_el) + ":last-of-type"

def url_to_regex(href: str) -> str:
    """Turn a sample job URL path into a regex pattern."""
    path = urlparse(href).path or href
    return re.sub(r'\d+', r'\\d+', path)

# ── JavaScript snippets injected into the page ─────────────────────────────────

def overlay_js(phase_html: str) -> str:
    """Returns JS that injects/updates the floating overlay."""
    escaped = phase_html.replace("`", r"\`")
    return f"""
() => {{
    const font = document.createElement('link');
    font.href = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap';
    font.rel = 'stylesheet';
    document.head.appendChild(font);

    const old = document.getElementById('__ca_overlay');
    if (old) old.remove();
    // Inject Inter font if not already present
        if (!document.getElementById('__ca_font')) {{
            const fontLink = document.createElement('link');
            fontLink.id = '__ca_font';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
            document.head.appendChild(fontLink);
        }}

        const box = document.createElement('div');
    box.id = '__ca_overlay';
    box.style.cssText = `
        position:fixed;top:20px;right:20px;z-index:999999;
        background:hsl(30, 8%, 9.5%);color:hsl(40, 15%, 92%);
        font-family:'Google Sans', sans-serif;
        font-size:14px;padding:20px;border-radius:12px;
        border:1px solid hsl(30, 8%, 17%);width:340px;
        box-shadow:0 10px 40px rgba(0,0,0,.8);line-height:1.6;
        transition: border-color 0.3s ease;
        cursor: grab;
    `;
    box.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;pointer-events:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="hsl(26, 73%, 51%)" stroke="hsl(26, 73%, 51%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span style="font-weight:700;font-size:18px;letter-spacing:-0.5px;color:hsl(40, 15%, 92%)">CareerAgent</span>
        </div>
        <div style="margin-bottom:20px;color:hsl(30, 8%, 60%);font-size:14px;pointer-events:none;">{escaped}</div>
        <button id="__ca_btn" style="
            background:hsl(26, 73%, 51%);color:hsl(40, 20%, 98%);
            border:none;padding:10px 16px;border-radius:8px;
            cursor:pointer;font-size:14px;font-weight:500;
            width:100%;font-family:'Google Sans', sans-serif;
            transition:opacity 0.2s;
        " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">Done &rarr;</button>
    `;
    document.body.appendChild(box);
    window.__ca_done = false;
    document.getElementById('__ca_btn').onclick = (e) => {{ e.stopPropagation(); window.__ca_done = true; }};
    
    // Make it draggable
    let isDown = false;
    let offset = [0, 0];
    box.addEventListener('mousedown', function(e) {{
        if(e.target.id === '__ca_btn') return;
        isDown = true;
        box.style.cursor = 'grabbing';
        offset = [
            box.offsetLeft - e.clientX,
            box.offsetTop - e.clientY
        ];
    }}, true);
    document.addEventListener('mouseup', function() {{
        isDown = false;
        box.style.cursor = 'grab';
    }}, true);
    document.addEventListener('mousemove', function(e) {{
        if (isDown) {{
            e.preventDefault();
            box.style.left = (e.clientX + offset[0]) + 'px';
            box.style.top  = (e.clientY + offset[1]) + 'px';
            box.style.right = 'auto'; // Disable right anchoring once moved
        }}
    }}, true);
}}
"""

INTERCEPT_SEARCH_BOX_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caSearchBox(e) {
        e.preventDefault(); e.stopPropagation();
        const el = e.target.closest('input, textarea') || e.target;
        const info = {
            tag:    el.tagName.toLowerCase(),
            testId: el.getAttribute('data-testid') || (el.closest('[data-testid]') || {}).getAttribute?.('data-testid') || null,
            elId:   el.id || null,
            name:   el.getAttribute('name') || null,
            cls:    typeof el.className === 'string' ? el.className : '',
            aria:   el.getAttribute('aria-label') || null,
            inner:  el.innerText || '', html: el.innerHTML || ''
        };
        const box = document.getElementById('__ca_overlay');
        if (box) {
            box.style.borderColor = 'hsl(26, 73%, 51%)';
            const content = box.querySelector('div:nth-child(2)');
            const btn = document.getElementById('__ca_btn');
            if (content) content.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:hsl(26, 73%, 51%);font-weight:bold;font-size:15px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Search Box Captured!</div><div style="margin-top:8px;font-size:13px;color:hsl(30, 8%, 60%)">Auto-advancing...</div>';
            if (btn) btn.style.display = 'none';
        }
        setTimeout(() => { window.__ca_captured = JSON.stringify(info); }, 800);
        document.removeEventListener('click', __caSearchBox, true);
    }, true);
}
"""

INTERCEPT_SEARCH_BTN_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caSearchBtn(e) {
        e.preventDefault(); e.stopPropagation();
        const el = e.target.closest('button, [role="button"], input[type="submit"], input[type="button"]') || e.target;
        const info = {
            tag:    el.tagName.toLowerCase(),
            testId: el.getAttribute('data-testid') || (el.closest('[data-testid]') || {}).getAttribute?.('data-testid') || null,
            elId:   el.id || null,
            name:   el.getAttribute('name') || null,
            cls:    typeof el.className === 'string' ? el.className : '',
            aria:   el.getAttribute('aria-label') || null,
            inner:  el.innerText || '', html: el.innerHTML || ''
        };
        const box = document.getElementById('__ca_overlay');
        if (box) {
            box.style.borderColor = 'hsl(26, 73%, 51%)';
            const content = box.querySelector('div:nth-child(2)');
            const btn = document.getElementById('__ca_btn');
            if (content) content.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:hsl(26, 73%, 51%);font-weight:bold;font-size:15px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Search Button Captured!</div><div style="margin-top:8px;font-size:13px;color:hsl(30, 8%, 60%)">Auto-advancing...</div>';
            if (btn) btn.style.display = 'none';
        }
        setTimeout(() => { window.__ca_captured = JSON.stringify(info); }, 800);
        document.removeEventListener('click', __caSearchBtn, true);
    }, true);
}
"""

INTERCEPT_JOB_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caJob(e) {
        e.preventDefault(); e.stopPropagation();
        
        let href = "";
        const a = e.target.closest('a');
        if (a && a.href) {
            href = a.href;
        } else {
            // If they clicked a card without an anchor, try to find an anchor inside it
            const innerA = e.target.closest('div, li, tr')?.querySelector('a');
            if (innerA && innerA.href) {
                href = innerA.href;
            } else {
                // If there's literally no href, just use a dummy to allow progression
                href = "https://dummy.com/job/123";
            }
        }
        
        const box = document.getElementById('__ca_overlay');
        if (box) {
            box.style.borderColor = 'hsl(26, 73%, 51%)';
            const content = box.querySelector('div:nth-child(2)');
            const btn = document.getElementById('__ca_btn');
            if (content) content.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:hsl(26, 73%, 51%);font-weight:bold;font-size:15px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Job Link Captured!</div><div style="margin-top:8px;font-size:13px;color:hsl(30, 8%, 60%)">Auto-advancing to Phase 4...</div>';
            if (btn) btn.style.display = 'none';
        }
        
        setTimeout(() => {
            window.__ca_captured = href;
        }, 800);
        
        document.removeEventListener('click', __caJob, true);
    }, true);
}
"""

INTERCEPT_NEXT_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caNext(e) {
        e.preventDefault(); e.stopPropagation();
        const el = e.target.closest('button, [role="button"], input[type="submit"], input[type="button"], a') || e.target;
        const info = {
            tag:    el.tagName.toLowerCase(),
            testId: el.getAttribute('data-testid') || null,
            elId:   el.id || null,
            name:   el.getAttribute('name') || null,
            cls:    typeof el.className === 'string' ? el.className : '',
            aria:   el.getAttribute('aria-label') || null,
            inner:  el.innerText || '', html: el.innerHTML || ''
        };
        const box = document.getElementById('__ca_overlay');
        if (box) {
            box.style.borderColor = 'hsl(26, 73%, 51%)';
            const content = box.querySelector('div:nth-child(2)');
            const btn = document.getElementById('__ca_btn');
            if (content) content.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:hsl(26, 73%, 51%);font-weight:bold;font-size:15px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Next Button Captured!</div><div style="margin-top:8px;font-size:13px;color:hsl(30, 8%, 60%)">Finalizing config...</div>';
            if (btn) btn.style.display = 'none';
        }
        setTimeout(() => { window.__ca_captured = JSON.stringify(info); }, 800);
        document.removeEventListener('click', __caNext, true);
    }, true);
}
"""

# ── Core recorder ───────────────────────────────────────────────────────────────

async def poll_done(page) -> None:
    while True:
        if await page.evaluate("() => !!window.__ca_done"):
            await page.evaluate("() => { window.__ca_done = false; }")
            return
        await asyncio.sleep(0.4)

async def poll_capture(page) -> str:
    while True:
        val = await page.evaluate("() => window.__ca_captured || null")
        if val:
            await page.evaluate("() => { window.__ca_captured = null; }")
            return val
        await asyncio.sleep(0.4)

async def run_recorder(company: str, url: str) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx     = await browser.new_context()
        page    = await ctx.new_page()

# ── Phase 1: Capture Search Box ─────────────────────────────────────────
        print("\n[1/4] Click the Search Box where keywords are typed.")
        print("      If no search box is needed, click Done to skip.\n")
        
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        
        await page.evaluate(overlay_js(
            "🔍 <b>Phase 1 — Search Box</b><br>"
            "Click the <b>Search Input Box</b> on the page.<br>"
            "If none exists, click <b>Done</b> to skip."
        ))
        await page.evaluate("() => { window.__ca_done = false; }")
        await page.evaluate(INTERCEPT_SEARCH_BOX_JS)

        search_box_sel = None
        while True:
            cap  = await page.evaluate("() => window.__ca_captured || null")
            done = await page.evaluate("() => !!window.__ca_done")
            if cap:
                search_box_sel = best_selector(json.loads(cap))
                print(f"✅ Search Box: {search_box_sel}")
                break
            if done:
                print("⏭️  Skipped search box.")
                break
            await asyncio.sleep(0.4)

        # ── Phase 2: Capture Search Button ──────────────────────────────────────
        search_btn_sel = None
        if search_box_sel:
            print("\n[2/4] Click the Search/Submit Button.")
            await page.evaluate(overlay_js(
                "🔘 <b>Phase 2 — Search Button</b><br>"
                "Click the <b>Search Button</b>.<br>"
                "Will auto-advance when captured."
            ))
            await page.evaluate(INTERCEPT_SEARCH_BTN_JS)

            await page.evaluate("() => { window.__ca_done = false; }")
            while True:
                cap = await page.evaluate("() => window.__ca_captured || null")
                done = await page.evaluate("() => !!window.__ca_done")
                if cap:
                    search_btn_sel = best_selector(json.loads(cap))
                    print(f"✅ Search Button: {search_btn_sel}")
                    break
                if done:
                    print("⏭️  Skipped search button.")
                    break
                await asyncio.sleep(0.4)
                
            # Actually perform a search to load the results for the next phase
            try:
                await page.fill(search_box_sel, "engineer")
            except Exception:
                # If the selector is not a standard <input> (e.g. an Angular custom element wrapper),
                # fallback to clicking it and sending raw keystrokes
                await page.click(search_box_sel)
                await page.keyboard.type("engineer")
            
            if search_btn_sel:
                await page.click(search_btn_sel)
            else:
                await page.keyboard.press("Enter")
            await page.wait_for_timeout(3000)

        # ── Phase 3: Capture a job link ─────────────────────────────────────────
        print("\n[3/4] Click on any ONE job title to capture the URL pattern.\n")
        await page.evaluate(overlay_js(
            "🔗 <b>Phase 3 — Job Link</b><br>"
            "Click <b>any one job title</b> in the results.<br>"
            "Will auto-advance when captured."
        ))
        await page.evaluate(INTERCEPT_JOB_JS)

        await page.evaluate("() => { window.__ca_done = false; }")
        job_href = None
        while True:
            cap = await page.evaluate("() => window.__ca_captured || null")
            done = await page.evaluate("() => !!window.__ca_done")
            if cap:
                job_href = cap
                job_pattern = url_to_regex(job_href)
                print(f"✅ Job URL:   {job_href}")
                print(f"✅ Pattern:   {job_pattern}")
                break
            if done:
                job_pattern = ""
                print("⏭️  Skipped job link capture.")
                break
            await asyncio.sleep(0.4)

        # ── Phase 4: Capture Previous Button (For AI Diffing) ───────────────────
        print("\n[4/5] (AI Diffing) Click the 'Previous Page' button if it exists.")
        print("      We use this to mathematically diff the Next button. Click Done to skip.\n")
        await page.evaluate(overlay_js(
            "⏪ <b>Phase 4 — Prev Button</b><br>"
            "Click the <b>Previous Page</b> button.<br>"
            "We use this to AI-diff the Next button. Click <b>Done</b> to skip."
        ))
        await page.evaluate("() => { window.__ca_done = false; }")
        await page.evaluate(INTERCEPT_NEXT_JS.replace("Next Button", "Prev Button"))

        prev_el_info = None
        while True:
            cap  = await page.evaluate("() => window.__ca_captured || null")
            done = await page.evaluate("() => !!window.__ca_done")
            if cap:
                prev_el_info = json.loads(cap)
                print("✅ Previous button captured for diffing.")
                break
            if done:
                print("⏭️  Skipped Previous button.")
                break
            await asyncio.sleep(0.4)

        # ── Phase 5: Capture Next button ────────────────────────────────────────
        print("\n[5/5] Click the 'Next Page' button.")
        print("      If there is no pagination, click Done to skip.\n")
        await page.evaluate(overlay_js(
            "➡️ <b>Phase 5 — Next Button</b><br>"
            "Click the <b>Next page</b> button in the list.<br>"
            "If there is no pagination, click <b>Done</b> to skip."
        ))
        await page.evaluate("() => { window.__ca_done = false; }")
        await page.evaluate(INTERCEPT_NEXT_JS)

        next_sel = None
        while True:
            cap  = await page.evaluate("() => window.__ca_captured || null")
            done = await page.evaluate("() => !!window.__ca_done")
            if cap:
                el       = json.loads(cap)
                next_sel = smart_diff_selector(prev_el_info, el)
                print(f"✅ Next selector: {next_sel}")
                break
            if done:
                print("⏭️  No pagination — skipped.")
                break
            await asyncio.sleep(0.4)

        await browser.close()

    config = {
        "company":         company,
        "type":            "playwright",
        "url":             url,
        "job_url_pattern": job_pattern,
    }
    
    steps = []
    if search_box_sel:
        steps.append({"action": "type", "selector": search_box_sel, "value": "{keyword}"})
    if search_btn_sel:
        steps.append({"action": "click", "selector": search_btn_sel})
        
    if steps:
        config["steps"] = steps
        
    if next_sel:
        config["next_btn_selector"] = next_sel

    return config

# ── Entry point ─────────────────────────────────────────────────────────────────

def main():
    print("=" * 52)
    print("   Career Agent — Target Config Recorder")
    print("=" * 52)
    company = input("\nCompany name (e.g. TCS): ").strip()
    url     = input("Starting URL:             ").strip()
    print()

    try:
        config = asyncio.run(run_recorder(company, url))
    except Exception:
        print("\\n❌ Something went wrong. See record_error.log for details.")
        with open("record_error.log", "w") as f:
            f.write(traceback.format_exc())
        return

    print("\\n" + "=" * 52)
    print("  Paste this block into targets.json:")
    print("=" * 52)
    print(json.dumps(config, indent=2))
    print()

if __name__ == "__main__":
    main()
