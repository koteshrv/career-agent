<div align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="Job Tracker Pro Logo">
  <h1 align="center">Job Tracker Pro</h1>
  <p align="center">
    <strong>A self-hosted, full-stack Personal Applicant Tracking System (ATS).</strong>
    <br />
    <br />
    <a href="https://koteshrv.github.io/job-scraper">View Demo</a>
    ·
    <a href="#-features">Explore Features</a>
    ·
    <a href="#-quick-start">Installation</a>
    ·
    <a href="#-configuration">Configuration</a>
  </p>
</div>

<div align="center">
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react" alt="React"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.109-009688?style=for-the-badge&logo=fastapi" alt="FastAPI"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker" alt="Docker"></a>
  <a href="https://playwright.dev/"><img src="https://img.shields.io/badge/Playwright-Automated-2EAD33?style=for-the-badge&logo=playwright" alt="Playwright"></a>
  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Gemini-AI_Tailored-8E75B2?style=for-the-badge&logo=google" alt="Gemini"></a>
</div>

<br />

Job Tracker Pro is an open-source automation tool designed to streamline your job search. It safely scrapes listings from heavily obfuscated enterprise ATS portals (Taleo, Workday) and modern platforms (Greenhouse, Lever), helps you track your pipeline via a Kanban board, and leverages Gemini AI to generate bespoke `.tex` resumes and cover letters for each specific role.

## ✨ Features

- **Automated Hybrid Scraper** 
  - Extracts direct roles using fast JSON parsing for Lever and Greenhouse endpoints.
  - Bypasses Web Application Firewalls (like Akamai) using a headless Playwright engine with stealth capabilities to scrape enterprise portals.
  - Deduplicates jobs into a local SQLite database (`jobs.db`) to eliminate alert fatigue.

- **Kanban Application Pipeline**
  - A responsive React + Vite frontend with Tailwind CSS and glassmorphism styling.
  - Drag-and-drop jobs through stages (New, Applied, Interviewing, Rejected).
  - Bulk multi-select actions for rapid pipeline triage.

- **AI-Tailored Resumes & Cover Letters** 
  - Integrates directly with Google Gemini AI.
  - Generates bespoke resumes and cover letters mapped specifically to extracted job descriptions.
  - Export tailored resumes as raw `.tex` source or a compiled PDF via jsPDF.

- **Multi-Resume Management** 
  - Upload and manage multiple base resumes (supports both `.pdf` and `.tex` files).
  - Select any base resume as the context source when generating tailored applications.

- **Secure & Containerized**
  - Full JWT authentication (username/password) secures your web dashboard.
  - Entire application runs in a multi-container Docker Compose architecture (FastAPI backend + Vite frontend).

- **Real-Time Telegram Alerts** 
  - Get batched push notifications for newly found job postings directly to your phone.

## 🚀 Quick Start

### 1. Configure Environment
Clone the repository and set up your local environment:
```bash
git clone https://github.com/koteshrv/job-scraper.git
cd job-scraper
cp .env.example .env
```
Open `.env` and fill in your details:
- `APP_USERNAME` & `APP_PASSWORD`: Credentials to secure your web dashboard.
- `GEMINI_API_KEY`: Required for AI resume/cover letter tailoring.
- *(Optional)* `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`: For mobile alerts.

### 2. Build & Run
The easiest way to start both the backend and frontend is via Docker Compose:
```bash
docker-compose up -d --build
```
Alternatively, to run the services natively:
```bash
./start.sh
```
This spawns the FastAPI Backend on `http://localhost:8000` and the Vite Frontend on `http://localhost:5173` (or `5174` if busy).

### 3. Log In
Open your browser to the frontend URL (e.g., `http://localhost:5173`). 
Log in using the credentials defined in your `.env` file.

## 🎯 Configuration

### Managing Targets
The application is driven by `targets.json`, which dictates which companies are scraped:
- **Greenhouse / Lever:** Simply provide the company name and their ATS Board Token.
- **Playwright Targets:** Provide the search URL. The engine extracts job URLs automatically, or gracefully falls back to presence detection if the site structure is highly obfuscated.

### Dashboard Settings
Search keywords, active companies, and the background Cron schedule can be configured directly from the **Settings** page in the web dashboard—no code modifications required.

## 🛠️ Tech Stack
- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, jsPDF.
- **Backend:** Python, FastAPI, SQLite, Playwright, PyPDF2, Google Generative AI (Gemini).
- **Deployment:** Docker, Docker Compose, GitHub Actions.

## 📄 License
This project is licensed under the MIT License.
