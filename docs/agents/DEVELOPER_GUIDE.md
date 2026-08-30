# Backend Developer Instructions

This document provides focused instructions for AI agents modifying the `career-agent` backend.
See `CAREERAGENT_MANUAL.md` for a complete system overview.

## 1. Adding a New Scraper Target

All scraping targets are defined in `targets.json` and executed via `backend/scraper_core.py`.
There are two main paradigms:

### A. API-Based Scraper (Greenhouse, Lever, Custom JSON APIs)
1. Determine the API endpoint the target's career site calls in the background.
2. Add an entry to `targets.json`:
   ```json
   {
       "company": "NewCompany",
       "type": "api_post",
       "url": "https://api.newcompany.com/jobs",
       ...
   }
   ```
3. If the API is highly custom (requires complex pagination, auth tokens, or payload structures), create a new file in `backend/sources/new_company.py`.
4. In `new_company.py`, implement a `process_new_company(db, target, keywords, new_jobs, company_logs)` function.
   - Use `httpx` to fetch data.
   - For each job found, check if it already exists using `common.has_been_notified(db, url)`.
   - If new, use `common.record_job()` to add it to the `new_jobs` list.
5. In `backend/scraper_core.py`, import your new `process_new_company` function and add a branch in `run_scraper`:
   ```python
   elif t_type == "new_company":
       process_new_company(db, target, keywords, new_jobs, company_logs)
   ```

### B. Playwright SPA Scraper (Client-rendered React/Angular sites)
1. Add an entry to `targets.json` with `"type": "playwright"`.
2. Determine how pagination works on the site:
   - Does the URL change? (`"force_url_pagination": true`)
   - Is there a "Next" button? Define `"next_btn_selector"`.
   - Is there a search box? Define `"search_input_selector"` and `"search_btn_selector"`.
3. If the site is heavily protected or uses a broken SPA framework (like TCS iBegin's Angular issues), you will need to add a network interceptor in `backend/sources/playwright_engine.py`.
   - Look at `intercept_json_responses` for examples of sniffing API responses in Playwright.

## 2. Modifying Database Models
1. The project uses SQLAlchemy (`backend/models.py`) and SQLite (`jobs.db`).
2. If you add a column to a model (e.g., `Job` or `Settings`), there is currently NO Alembic migration system in place.
3. For schema changes, you must provide a standalone migration script (like `backend/migrate_v4.py`) that users can run, executing raw SQL `ALTER TABLE` commands on the SQLite database.
4. Update `backend/schemas.py` to match the new columns in `models.py`.

## 3. Extending the AI Pipeline
The AI logic is located in `backend/ai_agent.py`.
- `bulk_evaluate_jobs`: Uses an LLM to assign a 0-100 `match_score` based on the candidate's resume and job description.
- `generate_application_materials`: A 3-phase generator (Actor -> Critic -> Fixer) that produces cover letters, cold emails, and LaTeX resumes.
- If adding a new generation step or template, ensure it adheres to the NDJSON streaming format expected by the frontend (yielding objects with `"status"` and `"message"` or `"data"`).

## 4. Key Rules
- **Do not introduce heavy dependencies** without user approval (the Docker image must stay lean).
- **Concurrency**: Gemini evaluations are concurrent via `ThreadPoolExecutor` in `bulk_evaluate_jobs`. If you add another slow task, parallelize it similarly, but protect SQLite writes by committing sequentially.

# Frontend Developer Instructions

This document provides focused instructions for AI agents modifying the `career-agent` frontend.

## 1. Stack and Architecture
- **Framework**: React 19, TypeScript, Vite.
- **Styling**: Tailwind CSS.
- **Routing**: React Router DOM (`App.tsx`).
- **Components**: `frontend/src/components/` contains both UI components and page layouts.
- **API Client**: A customized Axios instance is available in `frontend/src/lib/api.ts` which handles bearer token injection and redirecting on 401 Unauthorized.

## 2. Modifying the Kanban Board
- Location: `frontend/src/components/KanbanBoard.tsx`.
- Library: `@hello-pangea/dnd` is used for drag-and-drop capability.
- Columns are defined at the top of the file in the `COLUMNS` array.
- Job grouping by company is implemented dynamically within the `Droppable` mapping for the `NEW` column. If modifying grouping logic, pay close attention to how `Draggable` index props are managed, as React Beautiful DnD requires strictly sequential integer indices even across nested company groups.

## 3. Streaming UI Responses
- Endpoints like `generate_application_materials` use NDJSON streaming (newline-delimited JSON).
- On the frontend, this is consumed using the native `fetch` API and a `ReadableStreamDefaultReader` instead of Axios.
- Example pattern (seen in `JobModal.tsx`):
  ```typescript
  const response = await fetch('/api/endpoint', { headers: { Authorization: `Bearer ${token}` } })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    // split on newlines and parse JSON objects
  }
  ```
- Always implement a progress UI (like a terminal/logs window) when consuming streamed endpoints.

## 4. Toast Notifications
- Do not import standard toast libraries.
- The project has a custom toast system located in `frontend/src/components/Toast.tsx`.
- Usage:
  ```typescript
  import { useToast } from "./Toast"
  
  function MyComponent() {
      const { toast } = useToast()
      
      const doSomething = () => {
          toast("Operation successful!", "success") // "success", "error", "info", "warning"
      }
  }
  ```

## 5. Adding New Routes
1. Create the page component in `frontend/src/components/`.
2. Add a route definition in `frontend/src/App.tsx` within the `<Routes>` block.
3. If the route should appear in the sidebar, add an entry to the `NAV` array at the top of `App.tsx`. The layout automatically renders the sidebar links based on this array.

# Chrome Extension Developer Instructions

This document provides focused instructions for AI agents modifying the `career-agent` Chrome extension.
See `CAREERAGENT_MANUAL.md` for a complete system overview.

## 1. Extension Architecture
The extension is built using Chrome Manifest V3.
- `manifest.json`: Contains permissions (`storage`, `activeTab`, `scripting`) and host permissions (`*://*.linkedin.com/*`, `*://*.naukri.com/*`).
- `background.js`: Service worker handling cross-tab messaging (`START_AUTO_SCRAPE`, `STOP_AUTO_SCRAPE`).
- `popup.html` / `popup.js`: The extension popup UI which manages the queue, batch submission, API token authentication, and auto-scrape configuration.
- `content_script.js`: Injected into LinkedIn and Naukri pages to append the "Save" buttons and extract job data.

## 2. Content Script Injection Strategy
The content script (`content_script.js`) polls every 2 seconds via `setInterval` to handle Single Page Application (SPA) DOM changes.
Instead of relying on fragile CSS classes for action bars, the injection logic looks for native buttons containing specific text (e.g., "apply", "save") and then navigates up the DOM tree to find the parent flex container action bar.

### Custom Job Boards
If adding support for a new job board (e.g., Indeed, Glassdoor):
1. Create an `injectNewSiteJobPage()` and/or `injectNewSiteListCards()` function.
2. Search for the native apply/save button.
3. Call `createSaveButton('Save to CareerAgent', getJobDataFn)`.
4. Append it to the native button's parent container.
5. Add the domain to `manifest.json` `host_permissions`.
6. Update the main `injectCareerAgentButton()` if/else block.

## 3. Chrome Storage & Queueing
The extension operates completely statelessly relative to the backend until the user explicitly hits "Submit Batch".
- Queued jobs are stored in `chrome.storage.local` under the `jobQueue` array.
- Processed URLs are stored in the `processedJobs` array to persist the green "Evaluated" state.
- If modifying the queue payload, ensure you update both `content_script.js` (where the object is pushed) and `popup.js` (where it is read and sent to the backend endpoint `POST /api/jobs/extension/batch`).

## 4. UI/UX Rules
- **Do not use `alert()`**. Use the custom `showToast(message, duration)` function in `content_script.js`.
- Always inherit native styling classes when injecting buttons into lists/feeds to match the host site's exact padding and fonts.
- Ensure buttons visually reflect their queue state (`Orange` for Queued, `Green` for Evaluated). 

# Troubleshooting Guide

This guide is intended for AI agents to quickly diagnose common issues in the `career-agent` platform.

## 1. Scraper Failures & Playwright Issues

**Symptom**: `playwright.errors.TimeoutError: Timeout 30000ms exceeded.`
- **Diagnosis**: The SPA site (like Workday, Oracle HCM, or TCS) took too long to render, or the selector changed.
- **Fix**: Check `backend/sources/playwright_engine.py` for the specific company's logic. You may need to update the `next_btn_selector` in `targets.json` or increase the `extra_wait_ms`.

**Symptom**: All scraping targets suddenly return 0 jobs ("Silent Failure").
- **Diagnosis**: The site structure changed or Cloudflare anti-bot protection was triggered.
- **Fix**: The backend has a `probe_extraction_pipeline` canary mechanism. If this fails, investigate if `playwright-stealth` needs an update, or if a proxy is required. Check the raw logs in the Kanban History page (`GET /api/jobs/history`).

## 2. AI Generation Errors (Gemini / Rate Limits)

**Symptom**: Jobs are stuck in "NEW" without match scores, or generation fails with `429 Resource Exhausted`.
- **Diagnosis**: The Gemini API rate limit has been hit (15 RPM for free tier).
- **Fix**: The backend automatically caches rate limits and backs off. You can review the penalty box status in `Settings.model_telemetry` via the `/api/settings` endpoint. If using `gemini-1.5-pro`, switch to `gemini-1.5-flash` in Settings to bypass severe quota restrictions.

**Symptom**: `Failed to generate: No career context found.`
- **Diagnosis**: The user hasn't uploaded their resume to the RAG knowledge base.
- **Fix**: The Actor phase requires chunks from ChromaDB. Direct the user to the "Knowledge Base" page in the UI to upload their `.pdf` or `.tex` resume.

## 3. Database Migration Issues

**Symptom**: `sqlite3.OperationalError: no such column: x`
- **Diagnosis**: An AI agent previously modified `models.py` but failed to run an `ALTER TABLE` query.
- **Fix**: CareerAgent uses raw SQLite, not Alembic. You must manually execute `ALTER TABLE jobs ADD COLUMN x TEXT;` using a python script like `backend/migrate_v4.py` or the `sqlite3` CLI tool on `jobs.db`.

## 4. Chrome Extension Not Syncing

**Symptom**: Clicking "Save" in the extension works, but clicking "Submit Batch" does nothing.
- **Diagnosis**: The extension cannot communicate with the FastAPI backend.
- **Fix**: 
  1. Ensure the user is logged into the web dashboard first (the extension pulls the Bearer token from localStorage/cookies).
  2. If running locally, ensure the popup's target API URL matches the FastAPI port (usually `http://localhost:8000`).

## 5. LaTeX Compilation Errors

**Symptom**: Generating a resume returns a PDF error or broken NDJSON stream.
- **Diagnosis**: The generated LaTeX source contains invalid syntax (e.g., unescaped `&`, `%`, `$`, `_` characters).
- **Fix**: The generation prompt explicitly instructs the LLM to escape these characters, but hallucinations happen. Check the Critic phase output in the UI live logs. You may need to strengthen the `custom_guidelines` setting to strictly enforce LaTeX escaping.

