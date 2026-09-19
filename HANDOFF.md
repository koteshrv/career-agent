# Career Agent - Session Handoff Context

## Context & Rules to Follow (Critical)
- **Documentation**: You MUST strictly adhere to `sources/providers/ADDING_A_PROVIDER.md` when building or modifying providers. 
- **Zero-Dependency**: Do not use Playwright, Puppeteer, or external scrapers. We are running from datacenter IPs that are heavily blocked by Cloudflare (Bot Fight Mode).
- **Network Resiliency**: All network requests must use `fetchJsonWithRetry` or `fetchTextWithRetry` from `sources/providers/_http.mjs`. Do not use native `ctx.fetchText` directly unless wrapped in retry logic.
- **Rate Limiting**: When paginating, you must import `sleep` from `_http.mjs` (e.g. `await sleep(250, ctx)`) between page requests. Do not use standard `setTimeout` because it breaks the test clocks.
- **Provider Ideology**: The engine relies on the provider fetching the FULL inventory (no default filtering). If the user configures keywords (`entry.keywords` array), pass them to the backend API to save bandwidth, but default to fetching everything if keywords are omitted.

## What was accomplished in the previous session:
1. **Cognizant Integration (`cognizant.mjs`)**: Successfully bypassed Cloudflare Bot Fight Mode by directly parsing their public XML sitemap. Extracts all ~2000 jobs in a single request. (Refactored to use `fetchTextWithRetry`).
2. **Capgemini Integration (`capgemini.mjs`)**: Built a fully compliant, paginated provider against their Azure JSON API.
3. **Infosys & TCS**: Completed in earlier turns.
4. **Deloitte, HCLTech & Wipro Integration**: Discovered via HAR analysis that all three run on **SAP SuccessFactors** (RMK and CSB architectures). We mapped them to the existing `successfactors.mjs` provider in `providers.json` rather than building custom scrapers.
5. **Accenture Integration (`accenture.mjs`)**: Extracted Accenture's internal ElasticSearch `findjobs` API via HAR analysis. Built a fully compliant, paginated provider against this endpoint using `fetchJsonWithRetry` and `FormData`. Added exhaustive unit tests ensuring compliance with `verify-portals` health probes. It handles `{0}` placeholders correctly in URLs by parsing the locale out of the user-provided `careers_url`. It iterates over `entry.keywords` just like `successfactors.mjs` to offload filtering to the ElasticSearch backend.

## SuccessFactors (`successfactors.mjs`) Fixes & Learnings:
- **Massive Inventories**: The original SF provider was capped at 1,000 jobs for smaller German industrials. We bumped `MAX_JOBS` to 20,000 and `MAX_PAGES` to 2,000 to support megacorps like HCLTech (13k+ jobs).
- **Throttling**: Because pulling 1,300+ pages consecutively will trigger WAF IP bans, we injected `await sleep(250, ctx)` into both the CSB and RMK pagination loops. This limits execution to 4 req/sec, safely staying under WAF radar.
- **Keyword Filtering Optimization**: Refactored `successfactors.mjs` to dynamically iterate over the `entry.keywords` array config, piping the values directly into the backend SAP APIs (CSB payload `{"keywords": "..."}` and RMK url `&q=...`) to offload filtering to the server. If `entry.keywords` is missing, it passes `['']` to extract the full global inventory.

## Next Steps / Pending Work for the New Agent:
1. **Continue Missing Providers**: Check `missing_providers.json` and grab the next unassigned company HAR file or requirement from the user. Move completed providers to `providers.json`.

*Note to new agent: Once you have read and understood this, delete this `HANDOFF.md` file and let the user know you are ready!*
