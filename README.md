<p align="center">
  <img src="frontend/public/favicon.svg" alt="CareerAgent Logo" width="64" height="64" />
</p>

<h1 align="center">CareerAgent</h1>

<p align="center">
  <strong>Automate the job hunt. Keep your privacy intact.</strong>
</p>

<p align="center">
  Open-source AI-powered job search. Runs locally via Docker. Evaluates every job against your resume, generates tailored LaTeX CVs, and tracks your pipeline — completely autonomously in the background.
</p>

<p align="center">
  <a href="https://careeragent.fyi">careeragent.fyi</a> •
  <a href="https://github.com/koteshrv/career-agent/stargazers"><img src="https://img.shields.io/github/stars/koteshrv/career-agent.svg?style=flat-square&color=orange" alt="GitHub Stars"></a>
  <a href="https://github.com/koteshrv/career-agent/network/members"><img src="https://img.shields.io/github/forks/koteshrv/career-agent.svg?style=flat-square&color=blue" alt="GitHub Forks"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker" alt="Docker Ready"></a>
</p>

---

> **⚠️ Active Development (Beta):** APIs and database schemas may change between updates. Back up your `jobs.db` before pulling major updates.

---

## Why CareerAgent?

ATS was built to save recruiters' time. CareerAgent was built to save yours.

The average software engineer spends hours each week manually filtering job boards, copy-pasting descriptions, and reformatting resumes. CareerAgent replaces all of that with a local, autonomous agent that runs in the background — it finds jobs, scores them against your profile using a rubric-guided LLM, and prepares every application material right up to the submit button. You stay in control; the drudgery disappears.

**No accounts. No subscriptions. No cloud. 100% free and open-source.**

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Playwright Hybrid Scrapers** | Headless background scrapers for standard ATS platforms (Greenhouse, Lever, Ashby). For heavily protected sites like LinkedIn, the companion Chrome Extension bypasses IP bans entirely. |
| 🎯 **Agentic Deep Evaluation** | A massive LLM rubric grades each job against your resume across 5 dimensions: technical match, experience level, compensation, cultural signals, and red flags. Outputs a strict 0–100 score. |
| 📄 **Native LaTeX CVs** | 1-click injects missing keywords into your base resume and natively compiles a pristine ATS-friendly PDF. No cloud PDF service, no templates. |
| ✍️ **Drafts Open-Ended Answers** | Greenhouse, Ashby, and Lever forms ask "Why this role?". The agent reads the form, drafts paste-ready answers based on your CV, and leaves the final click to you. It never auto-submits. |
| 🌐 **Global Crowdsourced Job Network** | Opt-in to a shared, anonymous job pool powered by [career-agent-api](https://github.com/koteshrv/career-agent-api) — a standalone open-source serverless API. Your instance pushes scraped job postings to the network and pulls back jobs scraped by others. **Only public job listing data is ever exchanged. Your resume, profile, scores, and any personal information never leave your machine.** Deduplication is automatic. Community flagging removes fake and expired listings. |
| 🛡️ **Your Data, Your Machine** | All personal data — your resume, scores, notes, and application history — lives in a local SQLite database. No telemetry, no accounts, no third-party data mining. The only external calls your instance makes are: (1) the Gemini API for job scoring (replaceable with Ollama), and (2) the crowdsource API if you choose to opt in. |
| 📊 **Kanban Pipeline** | Track every application across New, Applied, Interviewing, and Rejected columns with a visual board. Full history log included. |
| 🤖 **Bring Your Own AI** | Works with Google Gemini (free tier available), OpenAI, Anthropic, or fully locally via Ollama. You control the model. |

---

## 🚀 Getting Started

### Requirements
- **Docker** (Desktop or Engine) — that's it.
- A free [Google AI Studio](https://aistudio.google.com/) Gemini API key.

### Run in 60 seconds

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/koteshrv/career-agent/main/docker-compose.yml

# 2. Start the app
docker compose up -d
```

Visit **[http://localhost:5173](http://localhost:5173)** — no sign-up, no OAuth, no accounts required.

Your jobs, resume, and settings are stored locally in a SQLite database via Docker volumes. Nothing leaves your machine except the Gemini API call for resume scoring.

> **AI Key:** On first launch, go to **Settings → Resume & AI** and paste your free Gemini API key. The app won't score jobs until you do.

---

### Chrome Extension (Optional — for LinkedIn & Naukri)

Standard Playwright scrapers are blocked by LinkedIn and similar platforms. The companion Chrome Extension bypasses this by extracting job data directly from the page you're browsing:

1. Open `chrome://extensions/` → Enable **Developer mode**
2. Click **Load unpacked** → Select the `chrome-extension/` folder from this repo
3. Pin the extension and use it on any job page to instantly save it to your pipeline

---

### Manual Setup (For Developers)

```bash
# Backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..

# Run everything
./scripts/run.sh
```

**Prerequisites:** Node.js 20+, Python 3.11+, `pdflatex` (TexLive/MiKTeX)

---

## 🏗 Architecture

```mermaid
graph TD
    classDef frontend fill:#1E293B,stroke:#3B82F6,stroke-width:2px,color:#F8FAFC
    classDef backend fill:#1E293B,stroke:#10B981,stroke-width:2px,color:#F8FAFC
    classDef storage fill:#1E293B,stroke:#8B5CF6,stroke-width:2px,color:#F8FAFC
    classDef ai fill:#1E293B,stroke:#F59E0B,stroke-width:2px,color:#F8FAFC

    subgraph "Your Machine"
        UI[React 19 Dashboard]:::frontend
        Ext[Chrome Extension]:::frontend
        API[FastAPI Backend]:::backend
        Cron[Playwright Scrapers]:::backend
        Compiler[LaTeX PDF Compiler]:::backend
        DB[(SQLite — Local)]:::storage
        API <--> DB
        Cron --> API
        UI <--> API
        Ext --> API
        API --> Compiler
    end

    subgraph "External AI"
        LLM[Gemini / OpenAI / Ollama]:::ai
    end

    subgraph "Optional — Community Network"
        CF[Crowdsource API]:::backend
        DB2[(Community Job Pool)]:::storage
        CF <--> DB2
    end

    API <--> LLM
    API <-.->|enabled by default| CF
```

---

## ❓ FAQ

**Does CareerAgent apply to jobs for me?**
No. It prepares every application right up to the click — resume, cover letter, open-ended answers. Then it hands the decision back to you. Mass auto-apply burns your ATS standing; CareerAgent removes the busywork but keeps the choice yours.

**How does job scoring work?**
A rubric-guided LLM evaluation across 5 dimensions (technical match, experience, compensation, culture, red flags) produces a 0–100 score. Anything below your configured threshold is auto-moved to Ignored so it doesn't clutter your New Matches.

**Is this really free?**
Yes, permanently. MIT-licensed. No paid tier, no waitlist, no accounts. The only optional cost is an AI API key — and Google's Gemini free tier is more than enough for personal use.

**Where does my data go?**
Almost nowhere. All personal data — your resume, scores, notes, and application history — stays in a local SQLite file on your own disk. Your instance makes exactly two types of external calls:
1. **Gemini API** — to score and tailor jobs against your resume. Replaceable with a local Ollama model for fully air-gapped operation.
2. **Crowdsource API** — *only if you opt in*. See below.

**What is the Global Crowdsourced Job Network?**
An optional, opt-in feature backed by [career-agent-api](https://github.com/koteshrv/career-agent-api) — a separate open-source serverless API anyone can self-host. When enabled, your CareerAgent instance pushes public job listing data (title, company, URL, description) to the shared network and pulls back listings scraped by other users. This dramatically expands the number of jobs you see without any extra scraping effort on your part.

**What is and isn't shared with the crowdsource network:**
- ✅ Shared: public job listing data (title, company, URL, description) — the same information publicly visible on job boards
- ❌ Never shared: your resume, your match scores, your application notes, your settings, or any information about you

**Does it need an account or sign-in?**
No. CareerAgent is single-user and runs entirely locally. No SSO, no OAuth, no Google/GitHub sign-in. Just Docker.

---

## 🤝 Contributing

Contributions are welcome! Check the open issues or open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT License](https://opensource.org/licenses/MIT) — free forever.
