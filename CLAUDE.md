# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CareerAgent is a self-hosted, single-user job search automation platform: it scrapes ~40 company career sites on a cron schedule, scores each posting against the user's resume with an LLM, and generates ATS-friendly application materials (cover letter, cold email, LaTeX resume PDF) via a 3-phase Actor→Critic→Fixer AI pipeline grounded in a RAG knowledge base. A companion Chrome extension saves jobs from sites that block server-side scraping (LinkedIn, Naukri).

**Before making non-trivial changes, read the fuller docs — this file is deliberately a summary:**
- `CAREERAGENT_MANUAL.md` — full system manual (architecture, every module, DB schema, settings reference). Auto-generated from source; treat source as ground truth if they diverge.
- `docs/agents/DEVELOPER_GUIDE.md` — task-oriented instructions: adding a scraper target, modifying DB models, extending the AI pipeline, Chrome extension conventions, and a troubleshooting guide for common failure modes (Playwright timeouts, Gemini rate limits, missing DB columns, LaTeX compile errors).

## Commands

**Backend** (from repo root, with `venv` activated):
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
python -m uvicorn backend.main:app --reload   # dev server on :8000
pytest                                         # full suite (testpaths = tests/)
pytest tests/test_ai_agent.py                  # single file
pytest tests/test_ai_agent.py::test_name -v    # single test
```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build
npm run lint       # eslint .
```

**Both at once:** `./scripts/run.sh` from repo root.

**Docker:** `docker compose up -d` (pulls prebuilt GHCR images; see `docker-compose.yml`). Backend build context uses `.dockerignore` to keep secrets/`backend/config.json`/`*.db` out of published image layers — check it before adding new root-level files with local state.

**DB schema changes:** There is no Alembic — SQLAlchemy models in `backend/models.py` are the source of truth for new installs (`Base.metadata.create_all` on startup), but existing SQLite databases need a hand-written migration script performing raw `ALTER TABLE` (see `backend/migrate_v6.py` as the template — it's never auto-invoked, the user runs it manually). Always update `backend/schemas.py` to match new model columns.

## Architecture

**Layout:** FastAPI backend (`backend/`) + React/Vite frontend (`frontend/src/`) + vanilla-JS Chrome MV3 extension (`chrome-extension/`) + `pytest` suite (`tests/`), sharing one SQLite DB (`jobs.db`). No multi-tenant concurrency support — designed for one user, one instance.

**Request flow:** `backend/main.py` wires a Starlette `AuthMiddleware` (checked *before* CORS, so 401 responses still carry CORS headers) in front of everything under `/api/*` except the paths in `PUBLIC_PATHS`. Feature routers live in `backend/routers/*.py` and are mounted onto the shared `app` at the bottom of `main.py`; `/api/auth/*` and a couple of legacy endpoints stay directly in `main.py`.

**Scraper dispatch (`backend/scraper_core.py`):** `run_scraper()` reads `targets.json`, filters to `Settings.active_companies`, and fans each target out by `type` to a module under `backend/sources/` (`greenhouse`, `lever`, `api_post`, `tech_mahindra`, `zwayam`) or batches `"playwright"` targets into one shared-browser pass in `backend/sources/playwright_engine.py`. `has_running_scrape(db)` is the concurrency guard against overlapping runs (both cron and the manual-trigger endpoint check it) — SQLite writes are not safe under concurrent scrapes. New scraper targets are added via `targets.json` config first; a bespoke `backend/sources/<company>.py` is only needed for non-standard pagination/auth (see the Developer Guide's step-by-step).

**AI pipeline (`backend/ai_agent.py`, 727 lines — the largest module):**
- `_route_generation()` dispatches by `Settings.ai_mode`: `"cloud_free"` (Gemini, fully implemented) and `"ollama"` (local, fully implemented) work; `"openai"`/`"anthropic"`/`"grok"` are stubs that return an error string — don't assume they're wired up.
- Gemini calls go through a comma-separated model fallback chain with two-layer rate limiting: an in-process sliding-window RPM limiter (`backend/rate_limiter.py`) plus a DB-persisted cooldown (`Settings.model_telemetry`) that survives restarts and is checked before every call.
- `generate_application_materials()` is an async generator streaming NDJSON (`{"status": ..., "message"|"data": ...}` lines) through `StreamingResponse` — Actor drafts → Critic reviews (must end in `[APPROVED]`/`[REVISION_REQUIRED]`) → Fixer only runs on revision-required. Any new streamed endpoint must follow this same NDJSON shape; the frontend consumes it via raw `fetch` + `ReadableStreamDefaultReader`, not Axios (see `JobModal.tsx` for the pattern).
- RAG grounding (`backend/rag_engine.py`) is a local ChromaDB `PersistentClient` at `backend/vector_store/`, queried by `retrieve_relevant_experience()` for top-k chunks used in generation prompts.

**Frontend conventions:** Axios instance in `frontend/src/lib/api.ts` injects the bearer token and redirects on 401 — use it for all non-streaming calls. Toasts go through the custom `useToast()` in `Toast.tsx`, never a third-party toast lib. New routes are added in `App.tsx`'s `<Routes>` and, if sidebar-visible, the `NAV` array there. Kanban DnD (`KanbanBoard.tsx`, `@hello-pangea/dnd`) requires strictly sequential integer indices even across nested company groupings — easy to break when changing grouping logic. UI is real shadcn/ui (`frontend/components.json`: style `new-york`, base color `zinc`, icons `lucide`) — add new primitives via the shadcn CLI/registry into `components/ui/` rather than hand-rolling ones that already exist there.

**Chrome extension sync:** stateless until the user hits "Submit Batch" in the popup — jobs queue in `chrome.storage.local` (`jobQueue`), then POST to `/api/jobs/extension/batch`, which processes them in background chunks of 5 through the same AI extraction path used by the manual scrape flow (`backend/routers/extension.py`).

**Config & secrets — two tiers, do not conflate them:**
1. *Bootstrap config* (`backend/config.json`, loaded by `backend/config.py`; copy `backend/config.example.json` to start) — login credentials, token signing secret, DB URL, log level. These gate or configure the DB-backed app itself, so they can't live inside the DB they gate. File-based, not env vars — mirrors `backend/crypto.py`'s `.encryption_key` handling (prefers `/app/data/` when present, i.e. the Docker volume, so it persists across container restarts).
2. *Everything else* — API keys/tokens (`gemini_api_key`, `openai_api_key`, `telegram_bot_token`, `career_agent_cloud_token`, etc.) — are Settings fields, Fernet-encrypted in the DB (`backend/crypto.py`) and transparently decrypted/encrypted by `crud.get_settings()`/`update_settings()`. Don't add a new secret-bearing settings field without adding it to `ENCRYPTED_FIELDS` in `backend/crud.py`. There is no `.env` file anywhere in this project — don't reintroduce one.

**Auth — two separate trust boundaries, do not conflate them:**
1. *Local dashboard access* is a custom HMAC-SHA256 bearer token (`backend/auth.py`, username/password from `backend/config.json`) issued **only** by `POST /api/login`. See the auth section of `CAREERAGENT_MANUAL.md` for the token format.
2. *Crowdsourcing identity* (the "Give-to-Get" credit economy in the sibling `career-agent-api` project, a Cloudflare Worker) is a separate JWT the browser gets by signing in with Google/GitHub. `career-agent-api` holds its own GitHub OAuth app secret and exchanges the authorization code itself — this backend has no GitHub OAuth config and never sees the code.

There is no `POST /api/auth/sso` in this backend (it was removed — it duplicated an exchange step that belongs to, and now only happens in, `career-agent-api`). `frontend/src/components/Login.tsx` calls `career-agent-api` directly for both Google and GitHub, using a plain `axios` call — **never** the shared `api` instance from `lib/api.ts`, whose interceptor attaches the local dashboard bearer token to every request; using it here would leak that token to a third-party host. The resulting cloud token is only persisted (via `POST /api/crowdsource/connect`) after a real local login succeeds, since that endpoint requires the normal bearer token like every other `/api/*` route — SSO identity must never grant local dashboard access on its own, since anyone with a Google/GitHub account can obtain one.

Run the `/security-review` skill before merging any change touching `backend/auth.py`, `backend/crowdsourcing.py`, `backend/crypto.py`, `backend/routers/crowdsourcing.py`, or `frontend/src/components/Login.tsx` — an earlier version of the SSO flow minted a local session for any Google/GitHub account holder with no allowlist (see `docs/agents/DEVELOPER_GUIDE.md` §5), and a later version leaked the local bearer token to `career-agent-api` and auto-logged in with hardcoded default credentials — so this boundary has broken twice and is worth re-checking on every touch.

**Crowdsourcing sync (`backend/crowdsourcing.py`):** once the frontend has a real local session, `setCloudToken()` in `api.ts` calls `POST /api/crowdsource/connect` to persist the career-agent-api JWT server-side (encrypted `Settings.career_agent_cloud_token`), so `push_jobs()`/`pull_jobs()` can run headless from the APScheduler `scheduler.py` every 10 minutes, independent of any open browser tab. `push_jobs()` only sends jobs where `Job.crowdsource_pushed_at IS NULL` and marks them pushed only on a confirmed 200, so a failed cycle retries instead of losing jobs from the backlog. The JWT is a snapshot with no refresh — pushes/pulls start failing 401 a week after connecting until the user reconnects. `POST /api/crowdsource/push`/`/pull` are on-demand triggers for the same functions, currently wired to temporary test buttons on the Job Applications page (`KanbanBoard.tsx`) — remove those once the schedule is confirmed working.
