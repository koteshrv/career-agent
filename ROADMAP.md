# CareerAgent Roadmap & Upcoming Features

This document tracks upcoming features, infrastructure improvements, and production-grade monitoring capabilities planned for CareerAgent.

## 1. Production-Grade Monitoring & Observability
- ~~**Target Health Rollup**~~ ✅ Partially done — `GET /api/companies/health` + an Analytics page tab now surface per-company scrape success rate and consecutive-failure streaks across recent runs, so a broken site scraper doesn't just silently return 0 jobs forever.
- **Telegram Health Alerts — NOT YET IMPLEMENTED**: The `telegram_bot_token`/`telegram_chat_id` Settings fields and encrypted storage exist, but there is currently no backend code that actually calls the Telegram Bot API. Wiring this up (e.g. triggered off the target-health rollup above, or a high-match job) is the highest-value next step here — it turns the passive dashboard into a push notification.
- **Error Tracking (Sentry)**: Integrate Sentry into the FastAPI backend to catch unhandled exceptions (e.g., Playwright scraping failures, LLM API timeouts) and trace performance bottlenecks. Optional given this is a single-user local tool — weigh against sending error data to a third party.
- **Application Metrics (Prometheus + Grafana)**: Expose a `/metrics` endpoint in FastAPI to track scraper success/failure rates, average LLM response times, and jobs processed per day. The target health rollup above covers the first of these already at much lower setup cost; only worth the extra infra if trend graphs over time become genuinely useful.

## 2. Chrome Extension Improvements
- **Batch Processing & Multi-Save**: Allow users to queue up multiple jobs from a search results page (e.g., LinkedIn Jobs page) and send them to the backend in a single batch for parallel AI processing.
- **Automated DOM Parsing**: Improve the content script to automatically extract the Job Title, Company, and full Job Description from LinkedIn/Indeed/Naukri without requiring the user to highlight text.
- **One-Click Inject**: Ability to click a button in the extension to automatically populate the company's application form (Workday/Greenhouse) using data from the local SQLite database.
- **Sync Status**: Show the Kanban status (e.g., "Already Applied") directly on the LinkedIn job posting via the extension.

## 3. Advanced AI & Scraping Features
- **CAPTCHA Bypass**: Implement sophisticated stealth mechanisms (e.g., rotating proxies, undetected-chromedriver) to bypass Cloudflare/DataDome protection on strict ATS portals.
- **Multi-Resume Support**: Allow users to upload multiple base resumes (e.g., one for Backend, one for DevOps) and have the AI dynamically select the best base template before tailoring it to the specific JD.
- **Automated Email Follow-ups**: A background cron job that checks the database for jobs in the "Applied" column older than 7 days, and automatically drafts a polite follow-up email.

## 4. Architectural & Codebase Health
- ~~**Scraper module split**~~ ✅ Done — `backend/scraper_core.py` was a 1,470-line file mixing pure link-filtering logic, five per-vendor scrapers, and the Playwright engine. Split into `backend/sources/{common,greenhouse,lever,api_post,tech_mahindra,zwayam,playwright_engine}.py`, with `scraper_core.py` now a slim orchestrator that re-exports the public API for backward compatibility.
- ~~**Concurrent scrape runs**~~ ✅ Partially done — a manual trigger or cron tick now checks for an already-`RUNNING` scrape and skips/rejects instead of overlapping, which was the main practical trigger for SQLite write contention. The `WAL` item below is still open for true concurrent reads+writes.
- **Database Concurrency (SQLite WAL)**: Enable `PRAGMA journal_mode=WAL;` to allow simultaneous reads and writes from the API, APScheduler, and Playwright scrapers without hitting database locks.
- **Robust Rate Limit Handling**: Implement exponential backoff and a dead-letter queue for AI evaluations. If a strict `429 Too Many Requests` is hit, the job should be gracefully queued for retry rather than failing completely.
- **LaTeX Compilation Safety**: Build a robust sanitization pipeline to escape special LaTeX characters (like `%`, `&`, `_`, `$`) from the AI-generated text before injecting it into the `.tex` file to prevent `pdflatex` compilation crashes.

## 5. Security & Privacy
- ~~**.dockerignore**~~ ✅ Done — added at repo root and in `frontend/`. Previously `backend/Dockerfile`'s `COPY backend/ ./backend/` had no excludes, so a local `docker build` from a dirty working tree could bake `backend/.encryption_key` (the key protecting stored API keys) or real resume uploads straight into an image layer, which the CI workflow then pushes to a public GHCR registry.
- **Secure Secret Management**: Migrate the master Fernet encryption key out of the local `.secret.key` file in the volume and require it to be injected securely via Docker `.env` variables at runtime.
- **Dependency Scanning**: Integrate Dependabot or Snyk to track and automatically update outdated Python and Node.js packages.
- **Browser Sandboxing**: Harden the Playwright browser context by stripping unnecessary permissions (geolocation, camera) and enforcing strict sandboxing to protect against malicious scripts on third-party job boards.

## 6. Open Source Standards & Testing
- **GitHub Issue Templates**: Add standard templates for users to easily report broken job board scrapers.
- ~~**Automated Test Suite**~~ ✅ Done — `pytest` suite in `tests/` covers scraper link filtering, job status transitions, settings encryption, and target health rollup. Runs in CI (`docker-publish.yml`) and blocks the Docker image build on failure.
- **CI/CD Validation (remaining)**: The backend `pytest` gate is live; still need to add `eslint`/`tsc` checks for the React frontend to the same workflow (or a `pull_request`-triggered one) so frontend regressions are caught the same way.
- **Expand test coverage**: The current suite covers pure logic and CRUD; it doesn't mock LLM responses or exercise the per-vendor scrapers (`backend/sources/`) or the LaTeX sanitization pipeline. Worth adding as the codebase grows.
