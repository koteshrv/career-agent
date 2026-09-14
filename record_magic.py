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
    tag     = el_info.get("tag", "div")
    test_id = el_info.get("testId")
    el_id   = el_info.get("elId")
    name    = el_info.get("name")
    cls     = el_info.get("cls", "")

    if test_id: return f"[data-testid='{test_id}']"
    if el_id:   return f"#{el_id}"
    if name:    return f"[name='{name}']"
    tokens = [c for c in cls.split() if len(c) > 2 and not c.isdigit()][:2]
    if tokens:  return f"{tag}.{'.'.join(tokens)}"
    return tag

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
    const old = document.getElementById('__ca_overlay');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = '__ca_overlay';
    box.style.cssText = `
        position:fixed;top:16px;right:16px;z-index:999999;
        background:#1a1a2e;color:#eee;font-family:monospace;
        font-size:13px;padding:14px 18px;border-radius:10px;
        border:2px solid #e94560;width:320px;
        box-shadow:0 4px 20px rgba(0,0,0,.5);line-height:1.7;
    `;
    box.innerHTML = `
        <div style="color:#e94560;font-weight:bold;font-size:14px;margin-bottom:8px">
            🎯 Career Agent Recorder
        </div>
        <div style="margin-bottom:10px">{escaped}</div>
        <button id="__ca_btn" style="
            background:#e94560;color:#fff;border:none;padding:8px 16px;
            border-radius:6px;cursor:pointer;font-size:13px;font-family:monospace;width:100%;
        ">✅ Done — next step</button>
    `;
    document.body.appendChild(box);
    window.__ca_done = false;
    document.getElementById('__ca_btn').onclick = () => {{ window.__ca_done = true; }};
}}
"""

INTERCEPT_JOB_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caJob(e) {
        const a = e.target.closest('a');
        if (!a || !a.href) return;
        e.preventDefault(); e.stopPropagation();
        window.__ca_captured = a.href;
        document.removeEventListener('click', __caJob, true);
        const box = document.getElementById('__ca_overlay');
        if (box) box.style.borderColor = '#2ecc71';
    }, true);
}
"""

INTERCEPT_NEXT_JS = """
() => {
    window.__ca_captured = null;
    document.addEventListener('click', function __caNext(e) {
        e.preventDefault(); e.stopPropagation();
        const el = e.target;
        const info = {
            tag:    el.tagName.toLowerCase(),
            testId: el.getAttribute('data-testid') || (el.closest('[data-testid]') || {}).getAttribute?.('data-testid') || null,
            elId:   el.id || null,
            name:   el.getAttribute('name') || null,
            cls:    typeof el.className === 'string' ? el.className : ''
        };
        window.__ca_captured = JSON.stringify(info);
        document.removeEventListener('click', __caNext, true);
        const box = document.getElementById('__ca_overlay');
        if (box) box.style.borderColor = '#2ecc71';
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

        # ── Phase 1: Free navigation ────────────────────────────────────────────
        print("\n[1/3] Browser is open. Navigate to the jobs page, type a keyword,")
        print("      search, and wait for results to load.")
        print("      Then click ✅ Done in the overlay.\n")

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate(overlay_js(
            "📋 <b>Phase 1 — Search Flow</b><br>"
            "Go to the jobs page, type a keyword &amp; search.<br>"
            "When results appear, click <b>Done</b>."
        ))

        await poll_done(page)
        entry_url = page.url
        print(f"✅ Final URL after search: {entry_url}")

        # ── Phase 2: Capture a job link ─────────────────────────────────────────
        print("\n[2/3] Click on any ONE job title to capture the URL pattern.\n")
        await page.evaluate(overlay_js(
            "🔗 <b>Phase 2 — Job Link</b><br>"
            "Click <b>any one job title</b> in the results.<br>"
            "The border turns green when captured."
        ))
        await page.evaluate(INTERCEPT_JOB_JS)

        job_href    = await poll_capture(page)
        job_pattern = url_to_regex(job_href)
        print(f"✅ Job URL:   {job_href}")
        print(f"✅ Pattern:   {job_pattern}")
        await page.wait_for_timeout(600)

        # ── Phase 3: Capture Next button ────────────────────────────────────────
        print("\n[3/3] Click the 'Next Page' button.")
        print("      If there is no pagination, click Done to skip.\n")
        await page.evaluate(overlay_js(
            "➡️ <b>Phase 3 — Next Button</b><br>"
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
                next_sel = best_selector(el)
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
        "url":             entry_url,
        "job_url_pattern": job_pattern,
    }
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
        print("\n❌ Something went wrong. See record_error.log for details.")
        with open("record_error.log", "w") as f:
            f.write(traceback.format_exc())
        return

    print("\n" + "=" * 52)
    print("  Paste this block into targets.json:")
    print("=" * 52)
    print(json.dumps(config, indent=2))
    print()

if __name__ == "__main__":
    main()
