<p align="center">
  <img src="frontend/public/favicon.svg" alt="CareerAgent" width="100" height="100">
</p>

<h1 align="center">CareerAgent</h1>

<p align="center">
  <em>An open-source AI job search command center.</em><br>
  <strong>Automate ATS scraping, deeply evaluate your resume fit, and compile optimized LaTeX CVs instantly.</strong>
</p>

<p align="center">
  <a href="https://github.com/koteshrv/career-agent/stargazers"><img src="https://img.shields.io/github/stars/koteshrv/career-agent.svg?style=flat-square&color=blue" alt="GitHub Stars"></a>
  <a href="https://github.com/koteshrv/career-agent/network/members"><img src="https://img.shields.io/github/forks/koteshrv/career-agent.svg?style=flat-square&color=blue" alt="GitHub Forks"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-blue.svg?style=flat-square&logo=react" alt="React"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.138-green.svg?style=flat-square&logo=fastapi" alt="FastAPI"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker" alt="Docker"></a>
</p>

<p align="center">
  <a href="#-why-careeragent">Why CareerAgent?</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-getting-started">Installation</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

> **⚠️ Active Development:** CareerAgent is currently in rapid development (Beta). APIs, database schemas, and features may change frequently as we build towards `v1.0`. We highly recommend backing up your `jobs.db` file before pulling major updates.

---

**CareerAgent** is a sophisticated, 100% free automation platform built for ambitious software engineers and IT professionals. It replaces the exhausting manual job hunt with an intelligent engine that scrapes target companies, evaluates your precise fit using your choice of AI, and compiles professionally formatted LaTeX PDFs designed to bypass corporate Applicant Tracking Systems.



---

## 🚀 Why CareerAgent?

Unlike generic AI job wrappers that spam "Easy Apply" buttons, **CareerAgent focuses on quality and precision.** It acts as your personal career agent, ensuring your resume mathematically aligns with the raw Job Description and generating personalized outreach materials that recruiters actually read.

## ✨ Features

- 🌐 **[New] Global Crowdsourced Network**: Opt-in to the community job pool to sync and share jobs with other users. Features a decentralized credit economy to prevent spam, automatic local deduplication, and community-driven reporting to instantly flag and remove dead or fake job links.
- **Automated Job Discovery**: A powerful hybrid approach. Uses Playwright backend scrapers for standard ATS platforms, and a companion Chrome Extension to directly scrape heavily protected sites (LinkedIn, Indeed) completely bypassing IP bans.
- **Kanban Pipeline**: Organize your job search visually. Drag and drop jobs across columns (New, Applied, Interviewing, Rejected) to track your pipeline at a glance.
- **AI Match Scoring**: Instantly evaluates your exact profile against the raw job description, providing a definitive 0-100 match score.
- **1-Click Application Materials**: Dynamically injects missing keywords into your base resume and natively compiles a pristine ATS-friendly PDF using LaTeX. Also generates tailored cover letters and cold emails.
- **Bring Your Own Keys**: Bring your own OpenAI/Anthropic keys, or use Google AI Studio for 100% free AI processing. Natively manages API rate limits. For complete privacy, it supports executing fully locally via **Ollama**.

## 🏗 Architecture

CareerAgent uses an elegant, decoupled microservice architecture:

```mermaid
graph TD
    %% Define styles for modern dark theme look
    classDef frontend fill:#1E293B,stroke:#3B82F6,stroke-width:2px,color:#F8FAFC
    classDef backend fill:#1E293B,stroke:#10B981,stroke-width:2px,color:#F8FAFC
    classDef storage fill:#1E293B,stroke:#8B5CF6,stroke-width:2px,color:#F8FAFC
    classDef ai fill:#1E293B,stroke:#F59E0B,stroke-width:2px,color:#F8FAFC

    subgraph "Client Side"
        UI[React 19 / Tailwind Dashboard]:::frontend
        Ext[Chrome Extension]:::frontend
        LinkedIn[Job Boards<br>LinkedIn/Naukri]:::frontend
        Ext -.->|Injects Agent UI &<br>Extracts JD DOM| LinkedIn
    end

    subgraph "Server Side"
        API[FastAPI Backend]:::backend
        Cron[Playwright<br>Background Workers]:::backend
        API <-->|Reads/Writes| DB[(SQLite Database)]:::storage
        Cron -->|Scrapes ATS platforms<br>Greenhouse/Lever| API
    end

    subgraph "AI Engine"
        LLM[Multi-LLM Manager<br>Gemini / OpenAI / Ollama]:::ai
        Compiler[LaTeX PDF Compiler]:::ai
        LLM -->|Injects Keywords| Compiler
    end

    subgraph "Community Network"
        CF[Serverless Worker<br>Crowdsource API]:::backend
        DB2[(Edge Database<br>Global Job Pool)]:::storage
        CF <-->|Persists| DB2
    end

    %% Cross-subgraph edges must live outside every subgraph block
    UI <-->|REST API| API
    Ext -->|Syncs Scraped Jobs<br>Batch Processing| API
    API <-->|Extracts Competencies &<br>Scores Match| LLM
    API <-->|Pushes Scraped Jobs &<br>Pulls Community Jobs| CF
```



---

## 🚀 Getting Started

### Method 1: Docker (Recommended)
The easiest way to run CareerAgent is using our pre-built GitHub Container Registry (GHCR) images. You don't need to install Node or Python!

```bash
# 1. Download the docker-compose file
curl -O https://raw.githubusercontent.com/koteshrv/career-agent/main/docker-compose.yml

# 2. Set your own login credentials (defaults to admin/admin otherwise — change this
#    before exposing the app past localhost)
echo '{"app_username": "admin", "app_password": "change-me"}' > backend-config.json

# 3. (Optional) Enable "Sign in with Google/GitHub" by copying in your own OAuth client IDs
curl -o frontend-config.json https://raw.githubusercontent.com/koteshrv/career-agent/main/frontend/public/runtime-config.json

# 4. Start the application in the background
docker compose up -d
```
*Visit `http://localhost:5173` to access the dashboard. Your database and files will be safely stored in the local directory via Docker volumes.*

**Multi-user note:** CareerAgent supports more than one person using the same instance, each with their own isolated jobs, resume, and settings. The username/password from step 2 always logs in as the administrator. If you enabled Google/GitHub sign-in in step 3, the **first** Google/GitHub account to ever sign in also becomes an administrator automatically — this is the easiest way to get started if you'd rather not touch `backend-config.json` at all. Every sign-in after that first one lands in a pending state until an administrator approves it from the Settings page.

---

### Method 2: Manual Installation (For Developers)

#### Prerequisites
- Node.js (v20+)
- Python (3.11+)
- `pdflatex` (TexLive / MiKTeX) for resume compilation

#### Setup & Run
```bash
# 1. Setup Python Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Setup Node Frontend
cd frontend
npm install
cd ..

# 3. Run the full application (Frontend + Backend APIs)
./scripts/run.sh
```

### 🧩 Installing the Chrome Extension
To scrape highly protected sites like LinkedIn, load the companion extension:
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right corner).
3. Click **Load unpacked** and select the `chrome-extension` folder from this repository.
4. Pin the extension to your browser bar for 1-click job saving!

---

## 🤝 Contributing
We welcome contributions from the community! Check out our [Contributing Guide](CONTRIBUTING.md) to get started. See what we're working on in the [Roadmap](ROADMAP.md).

## 📄 License
This project is open-source under the [MIT License](https://opensource.org/licenses/MIT).
