import fs from 'fs';

const plan = `# Onboarding Flow: Resume Parsing & Explore Initialization

## Goal
Implement a seamless onboarding experience for new users where they are guided to upload their resume (PDF/DOCX/TXT). The system will automatically parse the resume using AI to extract target roles, exclusions (e.g. seniority mismatches), and candidate profile data. This extracted data will then pre-populate the "Explore" page's ATS scan filters, mimicking the \`career-ops\` \`config/profile.yml\` & \`seedExploreFilters\` flow.

## User Review Required
> [!IMPORTANT]
> - **Database Changes:** I will add fields to the \`User\` model to store the parsed resume text, target roles, exclusions, and onboarding status.
> - **AI Integration:** Resume parsing will invoke the AI model via a new FastAPI endpoint.
> - **UI Flow:** If a user logs in and \`onboarding_completed\` is false (or \`resume_text\` is null), they will be forced into an onboarding modal/page before they can access the Explore or Pipeline tools.

## Proposed Changes

### Backend Component

#### [MODIFY] \`backend/database/models.py\`
- Add fields to the \`User\` model:
  - \`resume_text = Column(Text, nullable=True)\`
  - \`target_roles = Column(JSON, nullable=True)\` (e.g., ["Backend Engineer", "Solutions Architect"])
  - \`excludes = Column(JSON, nullable=True)\` (e.g., ["Junior", "Intern"])
  - \`onboarding_completed = Column(Boolean, default=False)\`

#### [MODIFY] \`backend/database/schemas.py\`
- Update \`UserResponse\` and \`UserUpdate\` Pydantic schemas to include the new fields (\`resume_text\`, \`target_roles\`, \`excludes\`, \`onboarding_completed\`).

#### [NEW] \`backend/routers/onboarding.py\`
- Create a new API router dedicated to onboarding.
- **Endpoint:** \`POST /api/onboarding/upload-resume\`
  - Accepts a file upload (\`UploadFile\`).
  - Uses \`PyPDF2\`, \`python-docx\`, or simple text reading to extract raw text.
  - Passes the raw text to a structured LLM prompt to extract:
    - Target roles (based on experience).
    - Exclusion keywords (e.g. "Junior" for a senior candidate, or irrelevant tech stacks).
  - Updates the \`User\` record and marks \`onboarding_completed = True\`.
  - Returns the extracted profile data.

#### [MODIFY] \`backend/main.py\`
- Include the new \`onboarding.py\` router.

---

### Frontend Component

#### [NEW] \`frontend/src/components/OnboardingPage.tsx\`
- A sleek, centered onboarding wizard.
- Step 1: Welcome message explaining that Career Agent needs a resume to auto-scan the ATS network.
- Step 2: Drag-and-drop file upload zone (accepts PDF/DOCX/TXT).
- Loading State: "Analyzing your profile..." while the backend processes the resume.
- Step 3: Success state confirming the extracted roles and allowing the user to proceed to the app.

#### [MODIFY] \`frontend/src/App.tsx\`
- Create an \`OnboardingGuard\` wrapper component.
- If the authenticated user has \`onboarding_completed === false\`, redirect them to \`/app/onboarding\`.
- Add the \`/app/onboarding\` route to render \`OnboardingPage.tsx\`.

#### [MODIFY] \`frontend/src/components/ExplorePage.tsx\`
- Instead of using the hardcoded \`roles\` and \`excludes\` state arrays:
  - \`const [roles, setRoles] = useState(["AI", "ML", ...])\`
- Fetch the user's saved profile from the backend (\`/api/users/me\`).
- Seed the \`roles\` and \`excludes\` state from the \`User.target_roles\` and \`User.excludes\` fields.
- Keep the UI editable so users can still manually tweak the chips.

## Verification Plan

### Automated Tests
- N/A for frontend UI, but backend schemas and routes will be verified by running the FastAPI server and checking Swagger (\`/docs\`).

### Manual Verification
1. Log in with a fresh user account (or artificially reset the admin user's onboarding state).
2. Ensure the app redirects to the Onboarding UI.
3. Upload a sample PDF resume.
4. Verify the backend successfully extracts text, parses it using the AI agent, and returns the JSON payload.
5. Proceed to the Explore tab and confirm the "Roles to find" and "Exclude" chips are correctly populated with the AI-extracted data.
`;
fs.writeFileSync('/home/hari/.gemini/antigravity/brain/e8a218b4-02fe-457d-b389-18f7b730accb/implementation_plan.md', plan);
console.log("Plan written!");
