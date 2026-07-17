<div align="center">
  <img src="frontend/public/favicon.svg" alt="CareerAgent Logo" width="120" />
  
  # CareerAgent
  
  **Your personal AI-powered job search automation platform.**  
  Quietly scrape job boards, evaluate match scores, and programmatically compile ATS-friendly LaTeX resumes and cold emails.

  [![GitHub Stars](https://img.shields.io/github/stars/hariharavk/career-agent.svg?style=for-the-badge&color=blue)](https://github.com/hariharavk/career-agent/stargazers)
  [![GitHub Forks](https://img.shields.io/github/forks/hariharavk/career-agent.svg?style=for-the-badge&color=blue)](https://github.com/hariharavk/career-agent/network/members)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
  [![React](https://img.shields.io/badge/React-19-blue.svg?style=for-the-badge&logo=react)](https://react.dev/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.138-green.svg?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=for-the-badge&logo=docker)](https://www.docker.com/)

  <p align="center">
    <a href="#-why-careeragent">Why CareerAgent?</a> •
    <a href="#-features">Features</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-getting-started">Installation</a> •
    <a href="#-contributing">Contributing</a>
  </p>

</div>

---

**CareerAgent** is a sophisticated, 100% free automation platform built for ambitious software engineers and IT professionals. It replaces the exhausting manual job hunt with an intelligent engine that scrapes target companies, evaluates your precise fit using your choice of AI, and compiles professionally formatted LaTeX PDFs designed to bypass corporate Applicant Tracking Systems.

<div align="center">
  <img src="frontend/public/screenshots/kanban.png" alt="Kanban Pipeline Screenshot" width="800" />
  <p><em>Track your job applications in a beautiful, dynamic Kanban pipeline.</em></p>
</div>

---

## 🚀 Why CareerAgent?

Unlike generic AI job wrappers that spam "Easy Apply" buttons, **CareerAgent focuses on quality and precision.** It acts as your personal career agent, ensuring your resume mathematically aligns with the raw Job Description and generating personalized outreach materials that recruiters actually read.
## ✨ Features

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

    %% Cross-subgraph edges must live outside every subgraph block — Mermaid assigns a
    %% node's subgraph membership to wherever it's FIRST referenced (edge or declaration),
    %% so an edge to API placed inside "Client Side" would silently render API inside the
    %% wrong box even though it's declared under "Server Side".
    UI <-->|REST API| API
    Ext -->|Syncs Scraped Jobs<br>Batch Processing| API
    API <-->|Extracts Competencies &<br>Scores Match| LLM
```

## 🚀 Getting Started

### Method 1: Docker (Recommended)
The easiest way to run CareerAgent is using our pre-built GitHub Container Registry (GHCR) images. You don't need to install Node or Python!

```bash
# 1. Download the docker-compose file
curl -O https://raw.githubusercontent.com/hariharavk/career-agent/main/docker-compose.yml

# 2. Start the application in the background
docker compose up -d
```
*Visit `http://localhost:5173` to access the dashboard. Your database and files will be safely stored in the local directory via Docker volumes.*

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
./start.sh
```

## 🤝 Contributing
We welcome contributions from the community! Check out our [Contributing Guide](CONTRIBUTING.md) to get started. See what we're working on in the [Roadmap](ROADMAP.md).

## 📄 License
This project is open-source under the [MIT License](https://opensource.org/licenses/MIT).
