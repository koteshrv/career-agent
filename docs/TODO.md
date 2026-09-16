# CareerAgent Roadmap & TODOs

## 🚀 Active Initiative: One-Click Auto-Onboarding
**Goal:** Replace scattered manual forms (`/app/knowledge`, `.tex` configs) with a single "Upload CV and Boom" flow, mirroring `career-ops` simplicity but with a SaaS GUI.

### Phase 1: Backend AI Extraction
- [ ] Create `/api/onboard/resume` endpoint in FastAPI.
- [ ] Implement PDF text extraction (PyPDF2 or similar).
- [ ] Import the battle-tested AI prompt templates (e.g., `titles.md`, `oferta.md`) from `career-ops/modes/` to power the backend.
- [ ] Write the Gemini/Claude prompt to extract `positive`, `negative`, and `location` keywords from the uploaded CV.
- [ ] Save the extracted keywords directly to the User's database profile.

### Phase 2: The Fast Pre-Filter Engine
- [ ] Modify `scraper_core.py` to fetch the user's keywords from the DB.
- [ ] Implement the regex fast-filter (like `career-ops`) to drop jobs before they hit the expensive LLM evaluation.
- [ ] Merge the 137 companies from `temp.json` into the active target engine.

### Phase 3: Frontend UX Overhaul
- [ ] Build `MagicUpload.tsx` drag-and-drop component.
- [ ] Move `/app/knowledge` and `.tex` settings into an "Advanced Settings" dropdown/tab (hidden from default onboarding).
- [ ] Wire the upload component to the backend endpoint.
- [ ] Implement auto-redirect to the Kanban board upon successful extraction.

### Phase 4: Verification
- [ ] E2E test with a dummy PDF resume.
- [ ] Verify jobs populate on the board automatically based on auto-extracted keywords.

---

## 📝 Future Tasks
- [ ] Implement automated application filling via Playwright MCP (Phase 2).
