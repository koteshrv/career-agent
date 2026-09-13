import asyncio
import json
import logging
from typing import List, Optional
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

def get_client(api_key: str):
    if not api_key:
        raise ValueError("Missing Gemini API Key for Agentic Scraper.")
    return genai.Client(api_key=api_key)

JS_GET_TREE = r"""() => {
    let idCounter = 1;
    const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], span[class*="btn"], span[class*="search"], span[class*="icon"], div[class*="btn"]');
    const tree = [];
    const mapping = {};
    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if ((rect.width > 0 && rect.height > 0 || el.className.includes('search') || el.className.includes('btn') || style.cursor === 'pointer') && style.visibility !== 'hidden' && style.display !== 'none') {
            let text = el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || el.className || '';
            text = text.replace(/\s+/g, ' ').trim().substring(0, 100);
            if (text || el.tagName === 'INPUT' || style.cursor === 'pointer') {
                el.setAttribute('data-agent-id', idCounter);
                let extra = "";
                if (el.tagName === 'A' && el.href) extra = ` href="${el.href}"`;
                tree.push(`[${idCounter}] ${el.tagName.toLowerCase()} "${text}"${extra}`);
                mapping[idCounter] = el;
                idCounter++;
            }
        }
    });
    return tree.join('\n');
}"""

async def run_agent_loop(url: str, api_key: str, model_names: List[str], keyword: str):
    from playwright.async_api import async_playwright
    client = get_client(api_key)
    
    def type_text(element_id: int, text: str):
        return {"action": "type", "id": element_id, "text": text}
        
    def click(element_id: int):
        return {"action": "click", "id": element_id}
        
    def finish(extracted_jobs: str):
        return {"action": "finish", "jobs": extracted_jobs}

    tools = [type_text, click, finish]
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        logger.info(f"Navigating to initial URL: {url}")
        try:
            await page.goto(url, wait_until="networkidle", timeout=15000)
        except Exception as e:
            logger.warning("Initial navigate timeout, continuing...")
        
        await page.wait_for_timeout(7000)
        
        tree = ""
        try:
            tree = await page.evaluate(JS_GET_TREE)
            current_state = f"Current Accessibility Tree:\n{tree}"
        except Exception as e:
            current_state = f"Failed to get tree: {e}"
        
        action_history = [f"Initial navigation to {url}"]
        current_url = page.url
        extracted_jobs_result = []
        current_model_idx = 0
        previous_tree = tree
        
        with open('last_tree.txt', 'w') as tf:
            tf.write(tree)
            
        for turn in range(15):
            history_str = "\n".join(action_history) if action_history else "None yet."
            turn_prompt = f"Goal: Find job postings for '{keyword}'.\n\nPrevious Actions:\n{history_str}\n\nURL: {current_url}\n\nState:\n{current_state}\n\nDecide next action. Only output JSON if calling a tool."
            
            try:
                current_model = model_names[current_model_idx] if current_model_idx < len(model_names) else model_names[-1]
                req_url = f"POST https://generativelanguage.googleapis.com/v1beta/models/{current_model}:generateContent"
                
                with open('agent_debug.log', 'a') as logf:
                    logf.write(f"\n{'='*80}\n[{turn+1}] 🚀 REQUEST -> {current_model}\n{'='*80}\n")
                    logf.write(f"{turn_prompt}\n\n")
                
                response = client.models.generate_content(
                    model=current_model,
                    contents=turn_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction="You are an autonomous web scraper. Call one tool at a time.",
                        tools=tools,
                        temperature=0.0,
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
                    )
                )
                
                with open('agent_debug.log', 'a') as logf:
                    tokens = "Unknown"
                    if hasattr(response, 'usage_metadata') and response.usage_metadata:
                        tokens = f"In: {response.usage_metadata.prompt_token_count} | Out: {response.usage_metadata.candidates_token_count}"
                    
                    logf.write(f"\n{'='*80}\n[{turn+1}] ✅ RESPONSE <- {tokens}\n{'='*80}\n")
                    if response.text:
                        logf.write(f"{response.text}\n")
                    if response.function_calls:
                        fc = response.function_calls[0]
                        logf.write(f"Tool Call: {fc.name}({fc.args})\n")
                    
            except Exception as e:
                error_msg = str(e)
                if '429' in error_msg or '503' in error_msg or '500' in error_msg or 'quota' in error_msg.lower():
                    logger.warning(f"Hit limit/error on {current_model}: {error_msg}")
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[{turn+1}] ❌ RESPONSE FAILED: {error_msg}\n")
                    if current_model_idx < len(model_names) - 1:
                        current_model_idx += 1
                        continue
                    else:
                        import time
                        time.sleep(30)
                        continue
                else:
                    logger.error(f"Gemini API error during agent loop: {e}")
                    break
                    
            if response.function_calls:
                fc = response.function_calls[0]
                logger.info(f"Agent called: {fc.name}({fc.args})")
                
                with open('agent_debug.log', 'a') as logf:
                    logf.write(f"\n[BROWSER ACTION] Executing Tool: {fc.name}\n[BROWSER ACTION] Arguments: {fc.args}\n")
                
                if fc.name == "type_text":
                    el_id = fc.args.get("element_id")
                    text = fc.args.get("text")
                    action_history.append(f"Typed '{text}' into element [{el_id}]")
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[BROWSER ACTION] Playwright: locator('[data-agent-id=\"{el_id}\"]').fill('{text}')\n")
                    try:
                        await page.locator(f'[data-agent-id="{el_id}"]').fill(text, timeout=3000)
                        await page.wait_for_timeout(1000)
                    except Exception as e:
                        action_history[-1] += f" (FAILED: {str(e)[:50]})"
                        
                elif fc.name == "click":
                    el_id = fc.args.get("element_id")
                    action_history.append(f"Clicked element [{el_id}]")
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[BROWSER ACTION] Playwright: locator('[data-agent-id=\"{el_id}\"]').click()\n")
                    try:
                        await page.locator(f'[data-agent-id="{el_id}"]').click(timeout=3000, force=True)
                        await page.wait_for_timeout(7000)
                        current_url = page.url
                    except Exception as e:
                        action_history[-1] += f" (FAILED: {str(e)[:50]})"
                        
                elif fc.name == "finish":
                    data_str = fc.args.get("extracted_jobs", "[]")
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[BROWSER ACTION] Agent successfully finished extraction and exited loop.\n")
                    try:
                        extracted_jobs_result = json.loads(data_str)
                    except:
                        extracted_jobs_result = []
                    await browser.close()
                    return extracted_jobs_result
                    
                try:
                    tree = await page.evaluate(JS_GET_TREE)
                    with open('last_tree.txt', 'w') as tf:
                        tf.write(tree)
                        
                    if tree == previous_tree:
                        current_state = f"Current Accessibility Tree:\n{tree}\n\nWARNING: Your last action had NO visual effect on the page. DO NOT repeat the same action."
                    else:
                        current_state = f"Current Accessibility Tree:\n{tree}"
                    previous_tree = tree
                    with open('agent_debug.log', 'a') as logf:
                        logf.write(f"[BROWSER ACTION] Re-evaluating DOM... new tree has {len(tree.splitlines())} interactive elements.\n")
                except Exception as e:
                    current_state = f"Action failed or page crashed: {e}"
            else:
                current_state = "You did not call a tool. Please call a tool."
                with open('agent_debug.log', 'a') as logf:
                    logf.write(f"[BROWSER ACTION] Warning: Agent returned raw text instead of a tool call.\n")
                    
        await browser.close()
        return extracted_jobs_result
