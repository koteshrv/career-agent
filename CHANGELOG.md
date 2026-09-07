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
- **Crowdsourcing sync** (`backend/crowdsourcing.py`): pushes locally scraped jobs to and pulls
  community-contributed jobs from `career-agent-api`, a sibling project's Give-to-Get credit
  economy. Runs on a 10-minute background schedule (`backend/scheduler.py`) so it works without a
  browser tab open; `POST /api/crowdsource/push`/`/pull` trigger a cycle on demand. Connecting an
  account is Google/GitHub SSO on the Login page, kept deliberately separate from local dashboard
  auth (see Security, below).
- **GitHub OAuth login** (`GithubCallback.tsx`) alongside the existing Google Sign-In, both used only
  to connect the crowdsourcing account above.
- `tests/test_health_manager.py` and `tests/test_crowdsourcing.py` — regression coverage for the
  fixes and feature described below.
- **README Screenshots gallery**: eight product screenshots (analytics, generation, run history,
  settings, extension, queue) were sitting in `frontend/public/screenshots/` unreferenced by any
  doc — added a proper gallery section instead of leaving them unused.

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
- **Telegram health alerts were silently broken in three independent ways**: `health_manager.py` read
  the Fernet-encrypted bot-token column directly instead of decrypting it (every alert 404'd),
  ignored the `telegram_alerts_enabled` toggle, and crashed with `TypeError` on a provider's
  first-ever recorded failure — which aborted health tracking for every other company in that scrape
  run. All three fixed; alerts now route through `notifications.send_telegram_message`, and dynamic
  content (error messages, company names) is Markdown-escaped so Telegram doesn't reject the whole
  message on a stray `_`/`*`/`` ` ``.
- The 24-hour `BLOCKED`-provider cooldown actually expired after a single scrape cycle: a cooldown
  skip was logged as `FAILED`, which reclassified the provider to `BROKEN` and ended the cooldown
  early. Skips are now logged as `SKIPPED` and excluded from health/cooldown state and target-health
  stats.
- Generated resume PDFs were written to a fixed filename under `/tmp` and never deleted — a
  world-readable file leaked per generation, indefinitely. Now written to a unique temp file cleaned
  up by a `BackgroundTask` after the response is sent; `pdflatex` also gets a timeout so a
  hallucinated runaway LaTeX macro can't hang a worker thread forever.
- `clean_old_trash` compared a naive local `datetime.now()` against UTC-stamped rows, deleting trash
  early or late depending on the server's timezone.
- The RAG embedding pipeline could silently fall back to a different Gemini embedding model mid-session
  with no pinning, mixing incompatible vectors in the same ChromaDB collection and producing
  meaningless similarity scores. Now pins one model per process and records it per chunk, with a
  warning if the knowledge base ever ends up mixed.
- A corrupted/duplicated code block in `backend/main.py`'s Google SSO handler (unterminated string
  literal, dead code from a bad merge, `PyJWT` used but never installed) left the endpoint unable to
  even start.
- README/CONTRIBUTING/manual all pointed at `./start.sh`, which doesn't exist — it was relocated to
  `scripts/run.sh` in an earlier commit and every reference to it was missed. Fixed across all three.
- GitHub links, GHCR image references, and the docker-compose curl URL throughout README, CHANGELOG,
  the manual, and the landing page pointed at the stale `hariharavk` account instead of `koteshrv`.

### Security
- `POST /api/auth/sso`'s `google` and `career_agent_cloud` branches used to mint a full local
  dashboard session token for **any** Google or GitHub account holder — no allowlist, and the Google
  branch never checked the token's `audience` (would accept an ID token issued for any Google
  OAuth client, not just this app's). Removed both branches entirely: local dashboard access is now
  exclusively `POST /api/login`, and SSO is scoped only to obtaining a token for the crowdsourcing
  API (see Added, above). See `CLAUDE.md`'s "two separate trust boundaries" note.
- `POST /api/crowdsource/connect` is deliberately public (connecting happens before a local session
  exists) but accepts only a bare `{token}`, never the general Settings schema, so it can't be used
  to overwrite unrelated secrets (Gemini/Telegram/OpenAI keys, etc.).

### Removed
- The orphaned root `Dockerfile`, which built and ran `scraper.py` — a file that doesn't exist anywhere
  in the repo. Unused by both `docker-compose.yml` and CI.
- Dead code: `ai_agent.filter_job_links`, `main._process_extension_job`,
  `scraper_core.fetch_and_strip_html`, `scraper_core.update_target_selector` — all confirmed zero-caller.
- `clearbit.png`, `google.png`, `test.png` at repo root — not images at all, but plain-text "not
  allowed by policy" responses from failed logo-download requests, saved with a `.png` extension.
  Unreferenced anywhere in the codebase.
- `chrome-extension/favicon.svg` (an exact duplicate of `frontend/public/favicon.svg`) and
  `chrome-extension/icon.svg` (a superseded early icon design) — neither referenced by
  `manifest.json` or `popup.html`; the extension actually uses `icon{16,48,128}.png`.
- `frontend/public/icons.svg` — an unused social-icon sprite sheet (Bluesky/Discord/X/GitHub symbols)
  from whatever starter template this project was bootstrapped from; never referenced via `<use>`
  anywhere, and this app uses `lucide-react` for icons instead.
- `frontend/public/screenshots/modal.png` — byte-identical duplicate of `generation.png`.

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
curl -O https://raw.githubusercontent.com/koteshrv/career-agent/main/docker-compose.yml

# 2. Start the application in the background
docker compose up -d
```

*For manual developer installation instructions, please refer to the [README](https://github.com/koteshrv/career-agent).*
