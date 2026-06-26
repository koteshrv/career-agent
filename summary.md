# Claude Session Summary

## Completed Work & Verified

1. **In-UI Confirm Dialog**: Replaced browser `window.confirm` popups with a reusable `ConfirmDialog` component (used for Clear All and per-job delete).
2. **Authentication (JWT)**:
   - Added token-based login (default: `admin/admin`).
   - Backend: `auth.py` with HMAC-signed tokens, `AuthMiddleware` protecting API routes.
   - Frontend: Login page, Axios interceptors for 401 handling, route guard, and sidebar Logout button.
3. **Resume Management**:
   - Resume upload now supports custom names for `.tex` files.
   - Tailored resume section in Job Modal includes Copy, Download `.tex`, and Download PDF (via jsPDF).
   - Backend outputs compilable LaTeX if the source resume is `.tex`.
4. **Run History Improvements**:
   - Immediately logs a `RUNNING` status when "Run Now" is clicked.
   - History auto-polls every 4 seconds.
   - Backend auto-heals and marks orphaned `RUNNING` logs as `FAILED` on startup.
   - All timestamps across the app (Run History, Kanban Board, Job Modal) now format correctly in IST (Asia/Kolkata).
5. **Scraper Deduplication**: Presence-only scraper engines (Playwright fallback, Tech Mahindra, etc.) now collapse multiple keyword hits into a single synthetic card per company.
6. **Bulk Multi-select**: Added a checkbox on every Kanban card and a floating action bar to bulk update statuses (Applied, Interviewing, Rejected) or bulk delete jobs.

## Outstanding Work (To Pick Up Next)

1. **Static Demo Page**: Rebuild the static demo page for GitHub Pages (`portfolio-demo/index.html`).
2. **Bulk Actions Testing**: Give the newly added bulk-status/bulk-delete UI a manual test against live data.
3. **Optional Polish**: Add per-site `job_selectors` for large enterprise portals (e.g., JP Morgan, Wipro) to extract exact roles rather than falling back to presence-only entries.

## Important Notes

- **Auth is Active**: Your local app is now protected by authentication. Use the default `admin/admin` credentials to log in. Ensure you change `APP_USERNAME` and `APP_PASSWORD` in your `.env` file.
- **Resumes**: Legacy `resume.pdf` has been migrated. Your primary `.tex` resume was successfully restored to `backend/uploads/resumes/resume.tex`.
