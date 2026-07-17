# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Test suite**: `pytest` coverage for scraper link-filtering, job status transitions, settings
  encryption, and the new target-health rollup, running against an in-memory SQLite DB
  (`tests/`, `pytest.ini`, `requirements-dev.txt`).
- **CI test gate**: `docker-publish.yml` now runs the test suite as a required job before either
  Docker image is built and pushed, and also runs on pull requests (build/publish stays push-only).
- **Target Health rollup**: `GET /api/companies/health` aggregates per-company scrape success rate
  and consecutive-failure streaks across recent runs; surfaced in a new "Target Health" tab on the
  Analytics page, so a scraper broken by a site markup change doesn't just silently return 0 jobs.
- **Docker hardening**: `.dockerignore` (root + `frontend/`), `HEALTHCHECK` on both Dockerfiles, and
  `docker-compose.yml`'s frontend now waits for the backend's healthcheck instead of just its start.

### Changed
- Split the 1,470-line `backend/scraper_core.py` into `backend/scraper_core.py` (slim orchestrator)
  plus `backend/sources/{common,greenhouse,lever,api_post,tech_mahindra,zwayam,playwright_engine}.py`.
  Public API unchanged — existing imports still work via re-exports.
- OpenAI/Anthropic/Grok are disabled in the Settings AI-provider picker with a "Coming soon" notice —
  the backend routing for them was never implemented, but the UI looked fully functional.
- `openai_api_key`, `anthropic_api_key`, and `grok_api_key` are now encrypted at rest, matching
  `gemini_api_key` and `telegram_bot_token` (previously stored in plaintext).
- A scrape run (manual or cron) now checks for an already-`RUNNING` run and skips/rejects instead of
  overlapping it, avoiding SQLite write contention and duplicate job commits.

### Fixed
- `record_job` checked for status `"TRASHED"` (typo) instead of `"TRASH"`, so a job you trashed never
  resurfaced when the scraper found it again.
- Startup was attaching a second console log handler on top of the one installed at import time,
  duplicating every log line.
- The manual "Run Scraper" background task reused the request-scoped DB session, which FastAPI closes
  once the HTTP response is sent — replaced with its own session, matching the scheduled-run path.

### Removed
- The orphaned root `Dockerfile`, which built and ran `scraper.py` — a file that doesn't exist anywhere
  in the repo. Unused by both `docker-compose.yml` and CI.
- Dead code: `ai_agent.filter_job_links`, `main._process_extension_job`,
  `scraper_core.fetch_and_strip_html`, `scraper_core.update_target_selector` — all confirmed zero-caller.

## [v0.1.0-beta] - Initial Beta Release

Welcome to the first public beta release of **CareerAgent**! 🎉

This release introduces the core automation engine and UI dashboard designed to help ambitious IT professionals automate the most exhausting parts of their job hunt.

### ✨ Key Features
- **Automated Playwright Scraper**: Silently scrapes job boards and ATS platforms (Greenhouse, Lever, etc.) in the background via cron.
- **Bring Your Own AI (BYOK)**: Supports OpenAI, Anthropic, and Google Gemini. We natively handle Google's free tier rate limits (Gemma 4 & Gemini Flash) so you can automate your search for $0!
- **AI Match Evaluation**: Cross-references raw Job Descriptions against your base profile to generate a definitive 0-100 fit score.
- **ATS-Optimized Resumes**: Dynamically injects missing keywords and natively compiles pristine LaTeX PDF resumes on the fly using `pdflatex`.
- **Kanban Dashboard**: A sleek, drag-and-drop pipeline UI for tracking New, Applied, and Interviewing roles.

### 🐳 Quick Start (Docker)
We highly recommend running CareerAgent via our pre-built GitHub Container Registry (GHCR) images. You don't need to install Node or Python!

```bash
# 1. Download the docker-compose file
curl -O https://raw.githubusercontent.com/hariharavk/career-agent/main/docker-compose.yml

# 2. Start the application in the background
docker compose up -d
```

*For manual developer installation instructions, please refer to the [README](https://github.com/hariharavk/career-agent).*
