# Plain Python base — job-listing pulling is zero-token HTTP now
# (backend/universal/providers/), no browser needed for that. Node is
# required at runtime for that layer's .mjs modules; Chromium (via
# Playwright, npm-side — same as career-ops's own usage, never a Python
# dependency) is for features that need real rendering: a JS-only JD page
# process-jobs.mjs's plain fetch can't extract, and the planned automated
# apply-form-fill (see docs/TODO.md) — not for ATS-listing scraping itself.
FROM python:3.13-slim

WORKDIR /app

# Prevent tzdata from prompting for geographic area and hanging the build
ENV DEBIAN_FRONTEND=noninteractive

# Node.js (for backend/universal/*.mjs) + LaTeX (for resume PDF generation)
RUN apt-get update && apt-get install -y nodejs npm texlive-latex-base texlive-fonts-recommended texlive-latex-extra texlive-fonts-extra && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /app/backend

# Copy backend source
COPY backend/ ./backend/
COPY providers.json keywords.json ./

# Playwright + Chromium for backend/universal/ (npm-side, matching career-ops's
# own dependency — see backend/universal/package.json). --with-deps pulls the
# OS-level libraries Chromium needs on this base image.
RUN cd backend/universal && npm install --omit=dev && npx playwright install --with-deps chromium

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz', timeout=3)" || exit 1

CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
