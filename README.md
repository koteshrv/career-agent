<div align="center">
  <img src="frontend/public/favicon.svg" alt="CareerAgent Logo" width="120" />
  
  # CareerAgent
  
  **Enterprise-grade AI Career Platform.**  
  Automates job discovery, dynamically aligns resumes to JD requirements, and generates pristine LaTeX PDFs for flawless ATS parsing.

  [![GitHub Stars](https://img.shields.io/github/stars/koteshrv/career-agent.svg)](https://github.com/koteshrv/career-agent/stargazers)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)](https://fastapi.tiangolo.com/)

</div>

<br/>

CareerAgent is an open-source, multi-LLM platform engineered to automate your job search while maintaining the highest standards of data privacy and professional formatting. 

It finds jobs via Telegram/web scraping, extracts competencies using AI, perfectly aligns your qualifications with the job description, and compiles mathematically perfect LaTeX PDFs designed to bypass corporate Applicant Tracking Systems (ATS) cleanly.

## ✨ Features

- **Intelligent ATS Alignment**: Ensure your true qualifications are recognized. CareerAgent dynamically aligns your resume with job requirements for accurate parsing by enterprise ATS platforms (Taleo, Workday, Greenhouse).
- **LaTeX Precision**: Generates mathematically perfect PDFs via LaTeX. Ensuring 100% data fidelity when parsed by automated systems.
- **100% Private (Local LLMs)**: Plug in Ollama and run Llama-3 locally. Your career data never touches Google or OpenAI servers if you require strict privacy.
- **Multi-LLM Routing**: Configure prioritized fallback chains (e.g., Gemini → Claude → OpenAI) for maximum reliability and rate-limit management.
- **Automated Pipeline**: A beautiful Kanban dashboard to track jobs from `NEW` to `APPLIED` to `INTERVIEWING`.

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+)
- Python (3.11+)
- API Keys (OpenAI, Gemini, Anthropic) or local Ollama running.

### 1. Start the Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

### 2. Start the Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to access the CareerAgent dashboard.

## 📸 Demo Mode
Want to see the UI without running a backend? You can run the frontend in demo mode with mocked data:
```bash
cd frontend
VITE_DEMO_MODE=true npm run dev
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/koteshrv/career-agent/issues).

## 📄 License
This project is [MIT](https://opensource.org/licenses/MIT) licensed.
