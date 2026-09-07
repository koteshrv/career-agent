# CareerAgent — Developer & AI Context Manual

> **Version:** Current (as of July 2026)  
> **Purpose:** Complete technical reference for every feature, module, API, and design decision in CareerAgent. Paste this file into any AI conversation to give the assistant full ground-truth context.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Automated Job Discovery & Scraping](#3-automated-job-discovery--scraping)
   - [Scraper Dispatch Engine](#3a-scraper-dispatch-engine-scraper_corepy)
   - [targets.json Schema](#3b-targetsjson--scraper-configuration-schema)
   - [Supported Companies](#3c-supported-companies-40)
   - [Playwright Engine](#3d-playwright-engine-playwright_enginepy)
4. [Bulk AI Evaluation](#4-bulk-ai-evaluation)
5. [AI Engine](#5-ai-engine-ai_agentpy)
   - [LLM Provider Routing](#5a-llm-provider-routing)
   - [Gemini Model Chain](#5b-gemini-model-chain-_generate)
   - [Ollama Local Generation](#5c-ollama-local-generation)
   - [RAG Knowledge Base](#5d-rag-knowledge-base-rag_enginepy)
   - [AI Utility Functions](#5e-ai-utility-functions)
6. [1-Click Application Materials Pipeline](#6-1-click-application-materials-pipeline)
7. [Chrome Extension](#7-chrome-extension)
8. [Kanban Board & Job Management](#8-kanban-board--job-management)
9. [Cron Scheduler](#9-cron-scheduler-schedulerpy)
10. [Notifications & Alerting](#10-notifications--alerting-notificationspy)
11. [Target Health Analytics](#11-target-health-analytics)
12. [Settings Reference](#12-settings-reference)
13. [Security](#13-security)
14. [Real-Time Logging](#14-real-time-logging)
15. [On-Demand Generation](#15-on-demand-generation)
16. [Resume Management](#16-resume-management)
17. [Crowdsourcing Sync](#17-crowdsourcing-sync-backendcrowdsourcingpy)
18. [Deployment](#18-deployment)
19. [Known Limitations](#19-known-limitations)

---

## 1. Project Overview

**CareerAgent** is an open-source, self-hosted, AI-powered job search automation platform for software engineers and IT professionals. It replaces the exhausting manual job hunt with an intelligent, multi-layered engine.

### What It Does

| Layer | Capability |
|---|---|
| **Scraping** | Automatically discovers job postings from 40+ company career portals and ATS platforms on a cron schedule. |
| **AI Evaluation** | Scores every discovered job (0–100) against the candidate's resume using an LLM, extracts Req ID and YOE, and auto-ignores poor matches. |
| **Application Materials** | Generates a cover letter, cold email/LinkedIn DM, and a tailored LaTeX-compiled PDF resume via a 3-phase Actor→Critic→Fixer AI pipeline grounded by a personal RAG knowledge base. |
| **Pipeline Tracking** | Kanban board UI to manage the full job application lifecycle (`NEW` → `APPLIED` → `INTERVIEWING` → `REJECTED`). |
| **Chrome Extension** | Companion browser extension for manually saving jobs from LinkedIn, Naukri, and other bot-protected sites. |
| **Crowdsourcing** | Optional Google/GitHub-authenticated sync with `career-agent-api`'s community job pool — push scraped jobs to earn credits, pull others' contributions to spend them. |

### Tech Stack

| Component | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite, APScheduler |
| Scraping | Playwright (headless Chromium), httpx, BeautifulSoup, playwright-stealth, fake-useragent |
| AI / RAG | Google Gemini SDK, Ollama SDK, ChromaDB (vector store), PyPDF2 |
| Security | Fernet symmetric encryption, HMAC-SHA256 bearer tokens |
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| Extension | Vanilla JS, Chrome Manifest V3 |
| Deployment | Docker Compose (GHCR images) or `scripts/run.sh` |

---

## 2. Repository Layout

```
job-scraper/
│
├── backend/                        # FastAPI application root
│   ├── main.py                     # All API routes, WebSocket, lifespan hooks
│   ├── ai_agent.py                 # All LLM logic, RAG retrieval, generation pipeline
│   ├── scraper_core.py             # Scraper orchestrator (dispatches to sources/)
│   ├── rag_engine.py               # ChromaDB vector store CRUD
│   ├── scheduler.py                # APScheduler cron job wrapper
│   ├── notifications.py            # Telegram alerts + healthchecks.io ping
│   ├── crud.py                     # SQLAlchemy CRUD + target health analytics
│   ├── models.py                   # SQLAlchemy ORM models (Job, Settings, ScraperLog)
│   ├── schemas.py                  # Pydantic request/response models
│   ├── auth.py                     # HMAC-SHA256 bearer token auth
│   ├── crypto.py                   # Fernet encryption for secrets at rest
│   ├── database.py                 # SQLite engine + session factory
│   │
│   ├── sources/
│   │   ├── common.py               # Shared utilities: keyword filter, URL dedup, record_job
│   │   ├── greenhouse.py           # Greenhouse ATS JSON API scraper
│   │   ├── lever.py                # Lever ATS JSON API scraper
│   │   ├── api_post.py             # Generic POST-based API scraper
│   │   ├── tech_mahindra.py        # Custom Tech Mahindra API scraper
│   │   ├── zwayam.py               # Zwayam ATS API scraper (Persistent Systems)
│   │   └── playwright_engine.py    # Headless Chromium + JS SPA support (largest module)
│   │
│   └── uploads/resumes/            # Uploaded resume files (.pdf / .tex)
│
├── frontend/src/
│   ├── App.tsx                     # Router, auth guard, page layout
│   └── components/
│       ├── KanbanBoard.tsx         # Drag-and-drop pipeline view
│       ├── JobModal.tsx            # Per-job detail / action modal
│       ├── SettingsPage.tsx        # All settings panels
│       ├── AnalyticsPage.tsx       # Token usage charts + company health table
│       ├── HistoryPage.tsx         # Scrape run history with per-company logs
│       ├── KnowledgeBasePage.tsx   # RAG knowledge base CRUD
│       ├── QuickGeneratePage.tsx   # Paste-a-JD on-demand generation
│       ├── LiveLogsModal.tsx       # WebSocket-backed real-time log terminal
│       ├── LandingPage.tsx         # Unauthenticated marketing page
│       ├── Login.tsx               # Login form
│       ├── ScrapeConfig.tsx        # Company selector + keyword manager
│       └── Toast.tsx               # Notification toast system
│
├── chrome-extension/
│   ├── manifest.json               # MV3 manifest, permissions, host permissions
│   ├── content_script.js           # DOM injection, auto-scraper, toast system (832 lines)
│   ├── popup.js                    # Extension popup: queue, batch submit, auth
│   ├── popup.html                  # Extension popup UI
│   └── background.js               # Service worker for cross-tab messaging
│
├── targets.json                    # Master config for ~40 company scrapers
├── keywords.json                   # Default search keyword list
├── jobs.db                         # SQLite database (auto-created)
├── docker-compose.yml              # Docker Compose: backend + frontend services
├── scripts/run.sh                  # Local dev startup script (backend + frontend)
└── scripts/demo.sh                 # Frontend-only demo mode (no backend needed)
```

---

## 3. Automated Job Discovery & Scraping

### 3a. Scraper Dispatch Engine (`scraper_core.py`)

Entry point: `run_scraper(db: Session)`.

**Execution flow:**

1. Load all targets from `targets.json`.
2. Filter to only companies selected in `Settings.active_companies` (JSON array). If empty → scrape all targets.
3. Dispatch each target sequentially based on `target["type"]`:

   | `type` value | Module called |
   |---|---|
   | `"greenhouse"` | `sources/greenhouse.py` → `https://boards-api.greenhouse.io/v1/boards/{token}/jobs` |
   | `"lever"` | `sources/lever.py` → `https://api.lever.co/v0/postings/{token}` |
   | `"api_post"` | `sources/api_post.py` → generic POST API |
   | `"tech_mahindra"` | `sources/tech_mahindra.py` → custom paginated API |
   | `"zwayam"` | `sources/zwayam.py` → `https://apipersistent.zwayam.com/jobs/search` |
   | `"playwright"` | Batched into `process_playwright()` in `playwright_engine.py` |

4. After all API scrapers finish, all batched Playwright targets are processed together in a single async call (shared browser instance, one `BrowserContext` per company for isolation).
5. All newly discovered jobs are passed to `bulk_evaluate_jobs()` for AI match scoring.

**Concurrency guard:**  
`has_running_scrape(db)` checks for a `ScraperLog` row with `status="RUNNING"` before starting. Both the manual trigger endpoint (`POST /api/run-scraper`) and the cron scheduler check this to prevent overlapping runs and SQLite write contention.

---

### 3b. `targets.json` — Scraper Configuration Schema

Each entry in `targets.json` is a JSON object. Supported fields:

| Field | Type | Description |
|---|---|---|
| `company` | string | Human-readable company name (used as the DB key) |
| `type` | string | Scraper type: `greenhouse`, `lever`, `api_post`, `playwright`, `tech_mahindra`, `zwayam` |
| `api_board_token` | string | Board token for Greenhouse or Lever APIs |
| `url` | string | URL template for Playwright. Use `{keyword}` as a placeholder. |
| `no_results_text` | string | Substring that appears in the page when a search returns 0 results |
| `extra_wait_ms` | integer | Extra milliseconds to wait for JS rendering on heavy SPA sites |
| `infinite_scroll` | boolean | `true` for Oracle HCM and similar infinite-scroll portals |
| `job_url_pattern` | string | Regex to identify job detail URLs. When set, matching URLs bypass AI title filtering (`skip_ai: true`). |
| `next_btn_selector` | string | CSS selector for the "Next page" pagination button |
| `force_url_pagination` | boolean | Increment `page=N` in the URL directly instead of clicking a button |
| `search_input_selector` | string | CSS selector for a search input field (e.g. TCS iBegin) |
| `search_btn_selector` | string | CSS selector for the search submit button |
| `intersect_with` | string | A second URL to pre-scrape. Only job URLs appearing in **both** result sets are kept (e.g. SmartRecruiters India geo-filter). |
| `use_playwright` | boolean | Force Playwright-based JD fetching even for non-Playwright type targets (e.g. IBM) |

---

### 3c. Supported Companies (~40)

| Category | Companies |
|---|---|
| **Indian IT / Services** | TCS, Infosys, Wipro, HCLTech, Cognizant, Capgemini, LTIMindtree, Accenture, IBM, Deloitte, Tech Mahindra, Persistent Systems (Zwayam), Mphasis, Hexaware Technologies |
| **Indian Startups / FinTech** | Meesho, PhonePe, Swiggy, Zepto, Flipkart, Paytm, Cred, Razorpay, Zoho |
| **Global FAANG / Tech** | Google, Amazon, Microsoft, Apple, Meta, Atlassian |
| **Global Finance** | Wells Fargo, Mastercard, JP Morgan Chase, Barclays, Citi, Visa |
| **Global Startups** | Stripe, Airbnb, Snowflake, Databricks, Coinbase, Figma, Notion |
| **ATS Platforms** | SmartRecruiters Global |

---

### 3d. Playwright Engine (`playwright_engine.py`)

The most complex module (~886 lines). Uses headless Chromium with multiple anti-detection and JS SPA techniques.

#### Anti-Detection Stack

| Technique | Implementation |
|---|---|
| **playwright-stealth** | Applies stealth patches to hide `navigator.webdriver`, `AutomationControlled` flag, etc. |
| **fake-useragent** | Rotates random Windows/Chrome/Edge user agents per browser context |
| **pyvirtualdisplay** | In Docker, starts a virtual Xvfb display so Playwright runs "headed" (bypasses some Cloudflare checks that block purely headless mode) |

#### `dismiss_popups(page)`

Three-phase cookie/modal dismissal on every page load and pagination step:

1. **Phase 1a** — Clicks consent buttons: "Accept All", "Allow All", "Got it", "I Accept", "Agree", etc. (regex match, 1.5s timeout)
2. **Phase 1b** — Clicks close/X buttons via `[aria-label*="close"]`, `[class*="close"]`, `[class*="cookie"] button`, etc.
3. **Phase 3** — Forces `display:none` on all fixed/sticky/absolute/iframe overlay elements matching cookie, consent, GDPR, banner, popup, modal, overlay, chat, bot, widget selectors. Also restores `overflow` on `body` and `html` if a banner locked scrolling.

> ⚠️ Phase 2 (Escape key) is intentionally skipped — it resets state on many JS SPAs (Microsoft Careers, Google Careers) causing pagination to break.

#### `extract_playwright_jobs(page, keyword, source_url, ...)`

Extracts job links from a rendered page. Three extraction strategies run in sequence:

1. **Standard `<a href>` anchors** — with smart container-aware title extraction: if an anchor's own text is empty, generic ("Apply", "View Job"), or shorter than 5 chars, it looks in the closest `li`, `.job-list-item`, `.card`, `article`, or `[class*="job-item"]` container for a heading or `<strong>` element.
2. **AngularJS `data-ng-click` string literals** — parses `goTo('/jobs/...')` patterns and reconstructs the full URL.
3. **AngularJS dynamic scope** — accesses `window.angular.element(el).scope()` to read `scope.job.jobId` and builds the URL directly from data (TCS iBegin).

Pagination strategies:
- **Button click** — heuristic detection: looks for `button`, `a`, `[role="button"]` with text `"next"`, `"next page"`, `">"`, `"›"`, or aria-label containing `"next"`. Skips disabled/hidden buttons.
- **URL manipulation fallback** — if no Next button is found and the URL contains `page=N`, increments N directly.
- **Infinite scroll** — scrolls both `window` and all inner scrollable containers (for Oracle HCM). Stops when no new jobs appear.

#### `probe_extraction_pipeline(page, company, ...)`

After a company returns 0 results for all keywords, this "canary probe" answers whether that's a real dry spell or a broken scraper. It re-runs a search using generic terms (`"engineer"`, `"manager"`, `"analyst"`) with `max_pages=1`. If even these find nothing, the pipeline is flagged as likely broken. Any exception in the probe itself is treated as inconclusive (returns `True`) to avoid manufacturing false alerts.

#### Network Interceptors

For API-driven sites, the engine intercepts XHR/fetch responses at the network layer:

- **Global JSON interceptor** — `page.on("response", intercept_json_responses)`: fires on every XHR/fetch response. If `content-type` contains `"json"`, passes the JSON to `_find_jobs_in_json()` in `common.py` to extract job links. Handles relative URLs for Infosys (`career.infosys.com/jobdesc/{id}`) and HCLTech (`careers.hcltech.com/job/{id}`).
- **Infosys keyword route** — `page.route("**/getCareerSearchJobs**", ...)`: rewrites the `searchText=ALL` query parameter with the actual keyword.
- **TCS POST interceptor** — `page.route("**/api/v1/jobs/search**", ...)`: parses the POST body JSON and injects `"userText": keyword` to bypass the broken Angular search UI.

#### JD Fetching

| Function | Method | Use Case |
|---|---|---|
| `fetch_job_descriptions_httpx(urls)` | Concurrent `httpx.AsyncClient` | Fast batch fetching for standard HTML pages. Strips script/style/nav/header/footer via BeautifulSoup. |
| `fetch_job_descriptions_batch(urls)` | Single Playwright browser, sequential page loads | For SPA job detail pages that need JS rendering. Waits for common JD selectors (`div[itemprop="description"]`, `.job-description`, `#job-description`, etc.). Detects Cloudflare blocks. |
| `fetch_job_description(url)` | Single Playwright browser | On-demand single URL fetch (triggered by the "Fetch JD" button in the UI). Raises `ValueError` on Cloudflare block. |

---

## 4. Bulk AI Evaluation

After scraping, all new jobs go through `scraper_core.bulk_evaluate_jobs(db, jobs)`:

**Step-by-step:**

1. Reads `Settings.min_match_score` (default 50) and the default resume text.
2. Splits jobs into batches of 10.
3. For each batch, determines the JD fetch method per job:
   - If `description` already exists and `len > 200` chars (e.g., from Chrome Extension) → skip fetching.
   - If `target.use_playwright == True` → use `fetch_job_descriptions_batch()` (Playwright).
   - Otherwise → use `fetch_job_descriptions_httpx()` (fast httpx).
4. Sends batches to `ai_agent.batch_evaluate_jobs()` using a `ThreadPoolExecutor(max_workers=5)` for concurrency.
5. Saves back to each `Job` row:
   - `match_score` → integer 0-100
   - `match_reason` → 1-2 sentence explanation
   - `external_id` → Req/Job ID extracted from the JD text
   - `yoe` → e.g. `"3-5 years"` or `"8+"`
   - `description` → the AI-cleaned JD markdown (replaces raw scraped text)
6. Jobs with `match_score < min_match_score` have their `status` set to `"IGNORED"`.

---

## 5. AI Engine (`ai_agent.py`)

### 5a. LLM Provider Routing

`_route_generation(prompt, mode, settings, is_tex, is_cl)` is the factory router:

| `mode` value | Routes to | Status |
|---|---|---|
| `"cloud_free"` (default) | `_generate()` — Google Gemini | ✅ Fully implemented |
| `"ollama"` | `_generate_ollama()` — Local Ollama | ✅ Fully implemented |
| `"openai"` | `_generate_cloud_private()` | 🚧 Stub only |
| `"anthropic"` | `_generate_cloud_private()` | 🚧 Stub only |
| `"grok"` | `_generate_cloud_private()` | 🚧 Stub only |

---

### 5b. Gemini Model Chain (`_generate()`)

Reads `Settings.gemini_model` — a comma-separated string — and builds an ordered model chain. Example: `"gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro"`.

**Two-layer rate limiting:**

**Layer 1 — Sliding Window RPM Limiter (in-process)**
- A `threading.Lock`-protected `deque` stores timestamps of recent requests.
- Enforces 14 RPM. On overflow, calculates `sleep_time = 60 - (now - oldest_timestamp)` and sleeps exactly that long.

**Layer 2 — DB-Persisted Penalty Box (cross-restart)**
- On `429` / `RESOURCE_EXHAUSTED` error: parses `"retry in Xs"` from the error message (+2s buffer; defaults to 60s if not found). Saves `rate_limited_until = time.time() + seconds` into `Settings.model_telemetry` JSON blob.
- On each `_generate()` call: checks `_is_rate_limited(model)` before attempting. Rate-limited models are skipped entirely.
- This survives server restarts (stored in SQLite).

**Fatal error detection:** If the error contains `"api key not valid"`, `"api_key_invalid"`, `"permission denied"`, or `"unauthenticated"` → breaks the model chain immediately (fallback won't help).

**Key resolution order:**
1. Caller-provided `api_key` argument.
2. If it starts with `"gAAAAA"` (Fernet prefix) → decrypts automatically.
3. Falls back to `Settings.gemini_api_key` (decrypted from DB).
4. Falls back to `GEMINI_API_KEY` environment variable.

**Token telemetry:** After each successful call, `record_token_usage(model, prompt_tokens, candidate_tokens)` accrues counts into `Settings.model_telemetry` per model, including a daily request counter that resets on date change.

---

### 5c. Ollama Local Generation (`_generate_ollama()`)

- Health-checks the daemon via `GET {ollama_url}/api/tags` with a 3s timeout before sending any request. Returns HTTP 503 if unreachable.
- Uses the `ollama` Python SDK's `client.chat()` with `format=schema.model_json_schema()` for **structured output** — forces the LLM to return valid JSON matching the Pydantic schema.
- Two schemas: `OllamaResumeOutput` (`latex_source: str`) and `OllamaCoverLetterOutput` (`cover_letter: str`).
- Supports comma-separated model list with sequential fallback.

---

### 5d. RAG Knowledge Base (`rag_engine.py`)

| Component | Detail |
|---|---|
| **Vector Store** | ChromaDB with `PersistentClient` at `backend/vector_store/` |
| **Collection name** | `"career_brag_document"` |
| **Embedding model** | `gemini-embedding-001` (falls back to `gemini-embedding-002` on 404) |

**Operations:**

| Function | Description |
|---|---|
| `ingest_context(text, api_key)` | Strips text, generates embedding, stores with UUID, returns the UUID. |
| `retrieve_relevant_experience(job_description, top_k, api_key)` | Embeds the JD, queries ChromaDB for top-k semantically similar chunks, returns concatenated text. |
| `list_context()` | Returns all `{id, text}` pairs from the collection. |
| `remove_context(doc_id)` | Deletes a specific chunk by UUID. |
| `ingest_master_document(file_path, api_key)` | Reads a file, splits on `\n\n`, and ingests each paragraph as a separate chunk. |

**Large document handling:** The `POST /api/knowledge` endpoint automatically splits pasted text on `\n\n` and skips chunks with fewer than 10 characters before ingestion.

---

### 5e. AI Utility Functions

| Function | Input → Output | Notes |
|---|---|---|
| `sanitize_job_description(raw_text, api_key)` | Raw scraped HTML/text → Clean Markdown JD | Removes cookies, nav, footers. Truncates input to 12,000 chars. Falls back to raw text if AI fails. |
| `parse_job_page_title(page_title, api_key, model_name)` | HTML `<title>` string → `{"company": "...", "title": "..."}` | Used when company/title can't be extracted from the DOM. |
| `extract_job_details_from_description(description, ...)` | JD body text → `{"company": "...", "title": "..."}` | Fallback when page title is generic ("LinkedIn", "Search"). Truncates to 2,500 chars. |
| `batch_extract_job_details(jobs, ...)` | List of `{description, url}` → List of `{company, title, clean_description}` | Processes a whole batch in a single API call (for Chrome Extension). |
| `batch_evaluate_jobs(jobs_data, resume_text, ...)` | List of job objects + resume → List of scored job results | Returns `match_score`, `match_reason`, `external_id`, `yoe`, `cleaned_job_description` per job. |
| `extract_resume_keywords(resume_text, ...)` | Resume text → JSON array string | Extracts top 20-30 ATS keywords. Called automatically after resume upload. |
| `strip_code_fences(text)` | LLM output → Clean text | Removes leading/trailing ` ``` ` or ` ```json ` fences. |

---

## 6. 1-Click Application Materials Pipeline

Implemented as `generate_application_materials()` in `ai_agent.py`. It is an **`async` generator** that yields NDJSON lines, streamed to the frontend via FastAPI's `StreamingResponse`.

### Phase 1 — Actor (Draft Generation)

1. Retrieves **top 6** relevant experience chunks from ChromaDB using the job description as the semantic query.
2. Reads the selected resume file:
   - `.pdf` → extracted via `PyPDF2.PdfReader`
   - `.tex` → read as raw UTF-8 text (cleaner than parsed PDF)
3. If `.tex`: extracts the LaTeX **preamble** (everything before `\begin{document}`) to inject into the prompt. The AI is instructed: *"YOU MUST USE THIS preamble"*.
4. Fetches `Settings.custom_guidelines` (free-text user directives, injected into every generation prompt with a `CRITICAL USER PERSONAL DIRECTIVES` label).
5. For `.tex` resumes, adds an escape directive: AI must replace `&`→`\&`, `%`→`\%`, `$`→`\$`, `_`→`\_` in the resume output only.

**Prompt rules enforced:**
- Cover Letter: under 3 paragraphs, no generic placeholders like `[Company Name]`, sign off as "Hari Karri".
- Cold Email: under 200 words, no `Subject:` line, strong hook tied to the JD, clear CTA.
- Tailored Resume: NO hallucinations (only skills explicitly in RAG context), exact LaTeX macro preservation, no job title inflation.

**Output delimiters:**
```
[COVER_LETTER_START] ... [COVER_LETTER_END]
[COLD_EMAIL_START] ... [COLD_EMAIL_END]
[TAILORED_RESUME_START] ... [TAILORED_RESUME_END]
```

### Phase 2 — Critic (Reviewer Pass)

A second LLM call acting as a "strict Principal Engineer". Checks:
1. **No hallucinations** — resume must not contain skills/numbers not in the RAG context.
2. **LaTeX formatting** — must preserve original macros (e.g. `\resumeSingleItem`), not revert to generic `\section` layout.
3. **JD alignment** — resume must target the JD without overclaiming.

Must end with exactly `[APPROVED]` or `[REVISION_REQUIRED]` on its own line.

### Phase 3 — Fixer (Refinement Pass)

*Only runs if Critic outputs `[REVISION_REQUIRED]`.*

Sends original drafts + critique to a "master editor" prompt. The fixed output uses the same delimiters and is parsed identically.

### Streaming Protocol

Each yielded line is a JSON object:

```json
{"status": "progress", "message": "Phase 1: Generating drafts..."}
{"status": "progress", "message": "Critic Feedback:\n..."}
{"status": "error",    "message": "No career context found. Please add your career history to the Knowledge Base first."}
{"status": "success",  "data": {"cover_letter": "...", "cold_email": "...", "tailored_resume": "..."}}
```

The API endpoint intercepts the `"success"` line and saves the materials to the `Job` row in the DB before streaming it to the client.

### LaTeX PDF Compilation

`_compile_latex_to_pdf(latex_content, out_basename, download_name)` in `main.py`:

- Strips Markdown code fences from the LaTeX source via `strip_code_fences()`.
- Writes source to `resume.tex` inside a `tempfile.TemporaryDirectory()`.
- Runs: `pdflatex -no-shell-escape -interaction=nonstopmode resume.tex`
  - `-no-shell-escape` prevents `\write18` shell execution from user-supplied LaTeX (security hardening).
- Copies the compiled PDF out of the temp directory before it's deleted.
- Returns a `FileResponse` with `application/pdf` content type.

**Exposed via:**
- `GET /api/jobs/{job_id}/resume/pdf` — compile the saved `tailored_resume` for a specific job
- `POST /api/generate/on-demand/pdf` — compile any pasted LaTeX without saving to the DB

---

## 7. Chrome Extension

### Architecture

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `storage`, `activeTab`, `tabs`, `scripting`. Host permissions: all URLs. |
| `content_script.js` | DOM injection + auto-scraper. Runs via `setInterval` every 2 seconds to catch SPA navigation. |
| `popup.js` | Popup: queue management, batch submit, login, settings, auto-scrape controls. |
| `background.js` | Service worker for relaying `START_AUTO_SCRAPE` / `STOP_AUTO_SCRAPE` messages across tabs. |

---

### LinkedIn Job Page Injection

Finds any `<button>` or `<a>` with text `apply`, `easy apply`, `save`, or `saved`. Appends a "Save to CareerAgent" pill button (blue `#0a66c2`, 32px height, 16px border-radius) to the same action bar row. Inherits LinkedIn's wrapper classes for spacing.

### LinkedIn Feed Injection

Finds `comment`/`send` action bars. Appends a native-styled "Save" button using LinkedIn's exact `artdeco-button artdeco-button--muted artdeco-button--4 artdeco-button--tertiary` class chain — completely transparent background, SVG bookmark icon, inherits LinkedIn's font/size.

### Naukri Job Page Injection

Finds `apply`/`save` buttons. Steals the Apply button's native CSS classes. Overrides `width: auto; min-width: max-content; white-space: nowrap` to prevent text wrapping issues (Naukri's Apply button has a fixed width that would clip "Save to CareerAgent").

### Naukri List Card Injection

- Finds job cards: `.jobTuple`, `.srp-jobtuple-wrapper`, `.cust-job-tuple`.
- Clones the native Naukri save button DOM structure entirely (`nativeSaveNode.cloneNode(true)`), then replaces the "save" text node with a `<span class="ca-dynamic-text">Agent Save</span>`.
- **Silent JD Fetch**: When clicked, does a background `fetch()` to the job's URL. Parses the HTML with `DOMParser` and looks for `.job-desc`, `.dang-inner-html`, `section.job-desc`, `.styles_Jym__MvstK`. Falls back to `card.innerText`.
- Shows "Fetching full JD in background..." toast with a minimum 800ms display time to prevent flickering.

### Auto-Scraper (`startAutoScrape()`)

1. Finds all `.ca-save-btn:not([style*="pointer-events: none"])` buttons on the page.
2. If none found: scrolls down one viewport height and waits 2 seconds (lazy load trigger).
3. Clicks up to 50 buttons with a random **2–5 second human-mimicry delay** between each click.
4. After all buttons: clicks the "Next" button (text `"next"` or `aria-label="Next"`).
5. In SPAs: polls every 1 second for new unclicked buttons (up to 15 attempts = 15 seconds) before restarting the engine for the new page.
6. Persists `isScraping`, `targetPages`, `pagesScraped` in `chrome.storage.local`.

### Queue State Visual Feedback

`checkQueueState(url, btn)` reads `chrome.storage.local`:
- URL in `jobQueue` (pending) → button turns **orange**, text → "Saved to Queue", disabled
- URL in `processedJobs` (submitted) → button turns **vibrant green**, text → "Evaluated", disabled

### Toast Notification System

- Rendered in the bottom-left corner in a stacked flex container (`column-reverse` so new toasts push old ones up).
- Smooth CSS animations: slide-up + scale-in via `cubic-bezier(0.16, 1, 0.3, 1)`.
- Color-coded border-left accents:
  - 🔵 Blue (`#3b82f6`) + spinning SVG: "Fetching", "Queuing", "Started"
  - 🔴 Red (`#ef4444`) + X SVG: "Stopped", "Failed"
  - 🟢 Green (`#10b981`) + animated SVG checkmark: all other messages
- `showToast(message, duration)` returns a `hideToast()` callback for programmatic dismissal (used during background JD fetch).

### URL Cleaning (`cleanUrl`)

- LinkedIn search pages with `?currentJobId=...` → normalized to `https://www.linkedin.com/jobs/view/{id}/`
- LinkedIn direct job view `/jobs/view/...` → strips all tracking params
- All others → strips query string (`origin + pathname` only)

### Popup Batch Submit Flow

1. Gathers all queued jobs.
2. POSTs to `POST /api/jobs/extension/batch` with `Authorization: Bearer {token}`.
3. On success: saves all submitted URLs to `processedJobs` in `chrome.storage.local`, clears `jobQueue`.
4. Content script buttons for those URLs will now show green "Evaluated".

---

## 8. Kanban Board & Job Management

### Job Status Lifecycle

```
NEW ──► APPLIED ──► INTERVIEWING ──► REJECTED
 │                                      
 ├──► IGNORED   (auto, if match_score < min_match_score)
 ├──► TRASH     (soft delete; auto-purged after trash_retention_days)
 └──► FALSE_POSITIVE  (hidden from all list views)
```

### REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/jobs` | `GET` | List all non-`FALSE_POSITIVE` jobs (paginated with `skip`/`limit`) |
| `/api/jobs/{id}` | `PUT` | Update any field on a job |
| `/api/jobs/{id}` | `DELETE` | Hard delete a single job |
| `/api/jobs/bulk-status` | `POST` | Bulk update status: `{"ids": [...], "status": "..."}` |
| `/api/jobs/bulk-delete` | `POST` | Bulk hard delete: `{"ids": [...]}` |
| `/api/jobs/trash/empty` | `DELETE` | Permanently delete all `TRASH` jobs |
| `/api/jobs` | `DELETE` | Clear **all** jobs from the database |
| `/api/jobs/{id}/fetch-jd` | `POST` | Trigger Playwright JD fetch for a specific job |
| `/api/jobs/{id}/application-materials` | `POST` | Generate cover letter/email/resume (streams NDJSON) |
| `/api/jobs/{id}/resume/pdf` | `GET` | Compile saved `tailored_resume` LaTeX → PDF download |
| `/api/generate/on-demand` | `POST` | Generate materials without a saved job (streams NDJSON) |
| `/api/generate/on-demand/pdf` | `POST` | Compile pasted LaTeX → PDF download |

### `Job` Database Model

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | Auto-increment |
| `company` | String | Indexed |
| `title` | String | Indexed |
| `url` | String | **Unique** — deduplication key |
| `location` | String | e.g. `"Manual - Extension (LinkedIn)"`, `"Greenhouse"` |
| `description` | Text | AI-cleaned Markdown JD |
| `status` | String | Default: `"NEW"` |
| `notes` | Text | User freetext notes |
| `cover_letter` | Text | AI-generated |
| `tailored_resume` | Text | AI-generated (LaTeX or Markdown) |
| `cold_email` | Text | AI-generated |
| `match_score` | Integer | 0–100 |
| `match_reason` | Text | 1–2 sentence explanation |
| `external_id` | String | Req ID extracted from the JD |
| `yoe` | String | e.g. `"3-5 years"`, `"8+"` |
| `created_at` | DateTime | Server default: `now()` |
| `updated_at` | DateTime | Auto-updated on write |
| `applied_at` | DateTime | Nullable — set when status → `APPLIED` |

---

## 9. Cron Scheduler (`scheduler.py`)

- **Library**: APScheduler `BackgroundScheduler` with `CronTrigger`.
- **Default cron**: `"0 */12 * * *"` (every 12 hours). Stored in `Settings.cron_schedule`.
- **Dynamic reschedule**: `reschedule(cron_expr)` calls `scheduler.add_job(..., replace_existing=True)` — no restart needed.
- **Startup**: Called from FastAPI `lifespan` context manager. Reads the cron expression from DB Settings.
- **Overlap guard**: Checks `has_running_scrape(db)` before starting. If a run is in progress → logs warning and skips.

**Each scheduled run:**
1. Cleans old TRASH items per `Settings.trash_retention_days`.
2. Deletes scraper logs older than 14 days.
3. Runs `run_scraper(db)`.
4. Calls `notify_broken_targets(db)` (Telegram alerts for broken targets).
5. Pings `HEALTHCHECK_PING_URL` (dead-man's switch).

---

## 10. Notifications & Alerting (`notifications.py`)

### Telegram Push Alerts

`send_telegram_message(db, text)` POSTs to:
```
https://api.telegram.org/bot{token}/sendMessage
```
With `parse_mode: "Markdown"` and a 10s timeout. Falls back to `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` env vars if not configured in DB. Failures are logged and swallowed — never propagate to the caller.

**Alert types:**

| Alert | Trigger | Message Emoji |
|---|---|---|
| Scrape Run Failed | Exception escapes `run_scraper()` | 🚨 |
| Target Health Alert — explicit failure | Company hits exactly `N=3` consecutive `FAILED` runs | ⚠️ |
| Target Health Alert — silent failure | Company hits `N=3` consecutive `SUCCESS`-but-0-jobs runs (with historical avg ≥ 1 job) | ⚠️ |

### Healthchecks.io Dead-Man's Switch

`ping_healthcheck(success)` is called **only after scheduled runs** (not manual triggers):
- Success → `GET {HEALTHCHECK_PING_URL}`
- Failure → `GET {HEALTHCHECK_PING_URL}/fail`

Purpose: catches the failure mode where the scheduler process itself crashes. An external service (healthchecks.io) notices the ping stopped arriving and alerts independently of any Python code running.

---

## 11. Target Health Analytics

`crud.get_target_health(db, run_limit=20)` builds a per-company scrape health report from the last N scraper log entries.

**Algorithm:**

For each company across all recent runs (newest first):

| Metric | Calculation |
|---|---|
| `consecutive_failures` | Count of leading `FAILED` statuses before the first non-failure |
| `success_rate` | `successes / total_runs_seen` |
| `last_success_at` | Timestamp of most recent `SUCCESS` entry |
| `zero_streak` | Count of leading `SUCCESS`-but-`jobs_found==0` runs |
| `historical_avg_jobs_found` | Average `jobs_found` from runs *before* the zero streak (i.e., "what this company normally finds") |
| `possibly_silent_failure` | `True` if `zero_streak >= 3 AND historical_avg_jobs_found >= 1` |

**Sort order:** Worst offenders first: explicit failure streaks → possible silent failures → lowest success rate.

Exposed at `GET /api/companies/health` and rendered in the Analytics page's health table.

---

## 12. Settings Reference

All settings are stored in a single `Settings` row in SQLite. Encrypted fields are Fernet-encrypted before writing, decrypted on read.

**Encrypted fields:** `telegram_bot_token`, `gemini_api_key`, `openai_api_key`, `anthropic_api_key`, `grok_api_key`

### Complete Settings Table

| Setting | Default | Description |
|---|---|---|
| `telegram_chat_id` | `null` | Telegram chat ID for push alerts |
| `telegram_bot_token` | `null` | Telegram bot token *(encrypted)* |
| `telegram_alerts_enabled` | `true` | Master toggle for Telegram alerts |
| `gemini_api_key` | `null` | Google AI Studio API key *(encrypted)* |
| `gemini_model` | `"gemini-2.5-flash, gemini-flash-latest, gemini-2.5-pro"` | Comma-separated model fallback chain |
| `cron_schedule` | `"0 */12 * * *"` | APScheduler cron expression (standard 5-field format) |
| `trash_retention_days` | `30` | Days before TRASH jobs are permanently deleted |
| `active_companies` | `null` | JSON array of company names to scrape. `null` = scrape all. |
| `search_keywords` | `null` | JSON array of custom search keywords |
| `extracted_keywords` | `null` | JSON array of ATS keywords auto-extracted from resume after upload |
| `debug_logging_enabled` | `false` | Dynamically sets root logger to `DEBUG`. Applied immediately on settings save. |
| `min_match_score` | `50` | Jobs below this score are auto-set to `IGNORED` |
| `total_prompt_tokens` | `0` | Cumulative Gemini prompt token counter (all time) |
| `total_candidate_tokens` | `0` | Cumulative Gemini output token counter (all time) |
| `custom_guidelines` | `null` | Free-text directives injected as `CRITICAL USER PERSONAL DIRECTIVES` into every generation prompt |
| `model_telemetry` | `null` | JSON blob: per-model `requests`, `prompt_tokens`, `candidate_tokens`, `today_requests`, `last_request_date`, `rate_limited_until` |
| `api_key_tag` | `null` | Optional human-readable label for the current API key |
| `max_pages` | `3` | Maximum pagination pages for Playwright scraper |
| `ai_mode` | `"gemini"` | Active AI provider: `gemini`, `openai`, `anthropic`, `grok`, `ollama` |
| `openai_api_key` | `null` | OpenAI API key *(encrypted)* — stored, not yet wired |
| `anthropic_api_key` | `null` | Anthropic API key *(encrypted)* — stored, not yet wired |
| `grok_api_key` | `null` | Grok API key *(encrypted)* — stored, not yet wired |
| `ollama_url` | `"http://localhost:11434"` | Ollama daemon base URL |
| `ollama_model` | `"llama3"` | Ollama model name (comma-separated chain supported) |

---

## 13. Security

### Authentication (`auth.py`)

Custom HMAC-SHA256 bearer tokens — no third-party JWT library.

**Token format:** `base64url({"u": username, "exp": unix_timestamp}).HMAC_SHA256_signature`

| Config | Default | Env var |
|---|---|---|
| Username | `admin` | `APP_USERNAME` |
| Password | `admin` | `APP_PASSWORD` |
| Token TTL | 7 days | `AUTH_TOKEN_TTL` (seconds) |
| Signing secret | Fernet key file | `AUTH_SECRET` |

The signing secret prefers `AUTH_SECRET`; falls back to the persistent Fernet key file so tokens survive restarts without extra config.

### Auth Middleware

Applied as a Starlette `BaseHTTPMiddleware` **before** CORS (so CORS headers appear even on 401 responses — required for browsers to read 401 bodies).

**Public paths** (no token required):
- `POST /api/login`
- `GET /api/ws/logs`
- `GET /healthz`
- `POST /api/auth/sso` — GitHub OAuth code exchange for the crowdsourcing connect flow (see below)
- `POST /api/crowdsource/connect` — stores a crowdsourcing token; deliberately narrow, see below

All other `/api/*` routes require `Authorization: Bearer {token}`.

### Crowdsourcing SSO — two separate trust boundaries

Signing in with Google or GitHub (Login page) connects this instance to the "Give-to-Get"
crowdsourcing credit economy in the sibling `career-agent-api` project. This is **not** the
same thing as local dashboard access, and the two must not be conflated:

1. **Local dashboard access** — the HMAC bearer token above, from `POST /api/login` only.
2. **Crowdsourcing identity** — a JWT issued by `career-agent-api`, used only to push/pull
   the shared job pool.

`POST /api/auth/sso` exists solely to exchange a GitHub OAuth `code` for a GitHub access
token server-side (the `client_secret` must never reach the browser); the frontend then
forwards that access token to `career-agent-api` itself. Google sign-in skips the local
backend entirely — the browser talks to `career-agent-api` directly with the Google
credential. **Neither path mints a local session.** An earlier version of this endpoint did,
for any Google/GitHub account holder with no allowlist — that was removed as a security fix,
not a design choice to preserve.

`POST /api/crowdsource/connect` persists the resulting `career-agent-api` JWT server-side
(`Settings.career_agent_cloud_token`, encrypted) so the scheduled push/pull sync (§ Crowdsourcing
Sync, below) can run headless without a browser tab open. It's public because connecting
happens *before* a local session exists — but it accepts only a bare `{token: string}`, never
the general Settings schema, so an unauthenticated caller can change which crowdsourcing
account this instance syncs as, but cannot touch any other setting (Gemini/Telegram/OpenAI
keys, etc. still require local auth).

### Fernet Encryption (`crypto.py`)

- Key file location: `backend/.encryption_key` (local) or `/app/data/.encryption_key` (Docker volume).
- Auto-generates a new key if the file doesn't exist.
- `encrypt_value(str) → str`: `Fernet.encrypt().decode()`
- `decrypt_value(str) → str`: Returns `""` on any exception (safe degradation — never crashes on corrupted data).

---

## 14. Real-Time Logging

### WebSocket Log Streaming

- **`ConnectionManager`**: Maintains a list of active WebSocket connections and a ring buffer (`deque(maxlen=10000)`) of recent log lines.
- **Catch-up replay**: New WebSocket connections immediately receive the entire current buffer.
- **`WebSocketLogHandler`**: A Python `logging.Handler` subclass. Every log record emitted by the root logger is forwarded to the WebSocket broadcast via `asyncio.run_coroutine_threadsafe` (safe cross-thread async dispatch).
- Endpoint: `GET /api/ws/logs` (exempt from auth middleware).

### Per-Run Log Capture

- A `RunLogCaptureHandler` is attached to the root logger at the **start** of each scrape run (both manual and cron) and **removed** in the `finally` block.
- Captures all log lines into an in-memory list.
- After the run completes, the full captured log string is saved to `ScraperLog.raw_logs`.
- Per-company results (`{company, status, jobs_found, message}`) are saved to `ScraperLog.detailed_logs` as a JSON array.

The `HistoryPage` renders both fields: a collapsible per-company results table and a scrollable raw log textarea.

### Log Level

Controlled by two mechanisms:
- `LOG_LEVEL` environment variable at startup (`DEBUG` or `INFO`).
- `Settings.debug_logging_enabled` — applied dynamically when settings are saved (no restart needed). Also sets all attached handlers' levels.

---

## 15. On-Demand Generation

The **Quick Generate** page (`QuickGeneratePage.tsx`) and its backend (`POST /api/generate/on-demand`) allow generating application materials without a scraped job in the DB.

**Flow:**
1. User pastes job title, company name, and raw JD text.
2. Backend calls `sanitize_job_description()` to clean the JD first.
3. Passes through the full `generate_application_materials()` 3-phase pipeline.
4. Streams NDJSON results identically to the per-job endpoint.
5. Results are **not** saved to the DB (ephemeral).

**On-demand PDF** (`POST /api/generate/on-demand/pdf`): Accepts `{"latex_content": "...", "company": "..."}`, compiles via `pdflatex`, and returns a PDF download. No DB interaction.

---

## 16. Resume Management

### Upload & Storage

- **Endpoint**: `POST /api/resumes/upload` (multipart form: `file`, optional `name`)
- **Accepted types**: `.pdf` and `.tex` only (enforced server-side)
- **Storage path**: `backend/uploads/resumes/{filename}`
- **Custom naming**: If `name` param is provided, the file is saved under that name (with original extension preserved if not included in the name).
- **Security**: `safe_resume_name()` strips directory components (`Path(name).name`) to prevent path traversal.

**Post-upload processing:**
1. Reads the file text (`PyPDF2` for PDF, raw UTF-8 for `.tex`).
2. Calls `extract_resume_keywords()` to get top 20-30 ATS keywords.
3. Saves the keyword JSON array to `Settings.extracted_keywords`.

### Multi-Resume Support

- `list_resumes()` returns all `.pdf` and `.tex` files in `resumes/`, sorted alphabetically.
- Generation endpoints accept an optional `resume` parameter to specify which file to use. If omitted, uses the first file alphabetically.
- `DELETE /api/resumes/{name}` — removes a named file.
- **Legacy migration**: On first run, if an old `uploads/resume.pdf` exists and `resumes/` is empty, the file is automatically moved to `resumes/resume.pdf`.

---

## 17. Crowdsourcing Sync (`backend/crowdsourcing.py`)

Syncs with **career-agent-api** — a sibling project (a Cloudflare Worker, not part of this
backend) running a "Give-to-Get" credit economy: push jobs you've scraped to earn credits,
pull jobs other users have contributed to spend them. See § 13 for how the crowdsourcing
JWT differs from local dashboard auth.

**Two directions, both dedupe against the local `jobs` table by `url`:**

| Function | Direction | Notes |
|---|---|---|
| `push_jobs(db)` | local → shared pool | Sends only jobs where `Job.crowdsource_pushed_at IS NULL` (capped at 1000/request, `career-agent-api`'s limit). Marks them pushed **only** on a confirmed `200` — a network failure or non-200 leaves them eligible for the next cycle instead of silently dropping them from the backlog. |
| `pull_jobs(db, limit)` | shared pool → local | Inserts via `sources.common.record_job()`, the same dedup-by-URL path scrapers and the Chrome extension use. |

**Scheduling (`backend/scheduler.py`):** both run on a fixed 10-minute `IntervalTrigger`
(not user-configurable, unlike the scrape cron), installed in `scheduler.start()` alongside
the scrape job. Each opens its own DB session and swallows its own exceptions — a
crowdsourcing hiccup must never affect the scrape schedule or vice versa.

**On-demand triggers (`backend/routers/crowdsourcing.py`):**
- `POST /api/crowdsource/connect` — stores the token (public; see § 13).
- `POST /api/crowdsource/push` / `POST /api/crowdsource/pull` — manually run one cycle now,
  behind normal local auth. Currently wired to temporary test buttons on the Job
  Applications page (`KanbanBoard.tsx`) — see § 19, Known Limitations.

**No token refresh.** The `career-agent-api` JWT expires 7 days after connecting
(`expires_in: 604800`); there's no refresh-token flow, so push/pull silently starts failing
with 401 a week after connecting until the user reconnects via the Login page. Both
functions return `{"success": false, ...}` rather than raising in that case — check
`backend.log` for `[Crowdsource]`-prefixed warnings if the sync appears to have stopped.

---

## 18. Deployment

### Docker Compose (Recommended)

```bash
# Download compose file and start
curl -O https://raw.githubusercontent.com/koteshrv/career-agent/main/docker-compose.yml
docker compose up -d
```

Access at `http://localhost:5173`. Data persisted via Docker volumes.

**Services:**
- `backend`: Python 3.11-slim with Playwright Chromium, `pdflatex` (TeX Live), and `pyvirtualdisplay` + Xvfb installed.
- `frontend`: Vite production build served by Nginx.

### Manual (For Developers)

**Prerequisites:** Python 3.11+, Node.js 20+, `pdflatex` (TeX Live / MiKTeX)

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..
./scripts/run.sh
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_USERNAME` | No | `admin` | Web UI login username |
| `APP_PASSWORD` | No | `admin` | Web UI login password |
| `AUTH_SECRET` | Recommended | *(Fernet key file)* | HMAC signing secret for bearer tokens |
| `AUTH_TOKEN_TTL` | No | `604800` (7 days) | Token lifetime in seconds |
| `GEMINI_API_KEY` | No | *(from DB Settings)* | Google AI Studio key fallback |
| `LOG_LEVEL` | No | `INFO` | `DEBUG` or `INFO` |
| `TELEGRAM_BOT_TOKEN` | No | *(from DB Settings)* | Telegram bot token fallback |
| `TELEGRAM_CHAT_ID` | No | *(from DB Settings)* | Telegram chat ID fallback |
| `HEALTHCHECK_PING_URL` | No | — | healthchecks.io ping URL |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth App client ID — enables the "Sign in with GitHub" crowdsourcing connect button (§13) |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth App client secret (server-side only, used to exchange the OAuth code) |
| `CROWDSOURCE_API_URL` | No | `https://career-agent-api.kotesh-rv.workers.dev` | Override to point at a local/self-hosted `career-agent-api` instance |

---

## 19. Known Limitations

> These are documented gaps in the current implementation — not bugs.

1. **No automatic DB schema migration.** Adding a new `Settings` column requires a manual SQL `ALTER TABLE` on the existing `jobs.db`. See `backend/migrate_v5.py` as a reference template.

2. **OpenAI / Anthropic / Grok are stubs.** API key fields exist in Settings and are encrypted/stored correctly. The `_route_generation()` router dispatches to `_generate_cloud_private()`, which currently returns an error string. Not yet implemented.

3. **TCS debug dump is live code.** `playwright_engine.py` contains a hardcoded write to `/home/hari/job-scraper/tests/dump/tcs_debug_{keyword}.html`. Remove before production use.

4. **SQLite only.** All data is in a single `jobs.db` file. Suitable for single-user self-hosting. Not designed for concurrent multi-user writes.

5. **Chrome Extension `allowedSites`** defaults to `linkedin.com, naukri.com, indeed.com` but the content script only has actual injection logic for LinkedIn and Naukri. Indeed support would require additional `injectIndeed*()` functions.

6. **`max_pages` setting** applies globally to all Playwright targets. Some targets may need target-specific overrides (not currently supported in `targets.json` schema).

7. **Crowdsourcing push/pull triggers are temporary test UI.** The "Push (temp)" / "Pull (temp)" buttons on the Job Applications page (§17) call the same on-demand endpoints used for manual testing during development. They work, but weren't designed as permanent UI — remove or redesign once the 10-minute background schedule is confirmed reliable in normal use.

8. **Crowdsourcing JWT has no refresh.** It's a snapshot from whenever the user last connected via SSO, expiring 7 days later. Push/pull silently start failing (logged, not raised) until the user reconnects from the Login page. No in-app indicator surfaces this yet.

---

*This document was auto-generated from the CareerAgent source code. When in doubt, the source is the ground truth.*
