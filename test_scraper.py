import asyncio
import json
import sys
from backend.sources.playwright_agentic import _run_playwright_extraction

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_scraper.py <Company_Name>")
        return
        
    company_name = sys.argv[1].lower()
    
    with open("targets.json", "r") as f:
        targets = json.load(f)
        
    target = next((t for t in targets if t.get("company", "").lower() == company_name), None)
    
    if not target:
        print(f"❌ Company '{company_name}' not found in targets.json")
        return
        
    if target.get("type") != "playwright":
        print(f"⚠️ Target type is '{target.get('type')}'. This test script is only for 'playwright' targets.")
        print("  (For universal targets, run: node backend/bridge.mjs <url>)")
        return
        
    url = target.get("url", "").replace("{keyword}", "engineer")
    print(f"\n🚀 Testing Playwright Scraper for {target.get('company')}...")
    print(f"🔗 Target URL: {url}\n")
    
    jobs = await _run_playwright_extraction(target, url, headless=False)
    
    print("\n" + "="*50)
    print(f"✅ Extracted {len(jobs)} jobs from DOM Distillation:")
    print(f"✅ Extracted {len(jobs)} jobs:")
    print("="*50)
    for j in jobs:
        print(f" - {j['title']}  ({j['url']})")
        
    print("\n(Note: The backend will automatically filter these against your personal keywords!)")

if __name__ == "__main__":
    asyncio.run(main())
