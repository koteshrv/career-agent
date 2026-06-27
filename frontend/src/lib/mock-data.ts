/**
 * Mock data returned in VITE_DEMO_MODE=true builds (GitHub Pages static demo).
 * All API calls are intercepted and return these objects instead.
 */

export const MOCK_SETTINGS = {
  id: 1,
  gemini_api_key: "••••••••••••••••••••••••••••••",
  gemini_model: "gemini-2.5-flash, gemini-1.5-flash",
  api_key_tag: "Demo Key",
  is_free_tier: true,
  telegram_chat_id: "123456789",
  telegram_bot_token: "••••••••••••••••••••••••••••",
  cron_schedule: "0 */4 * * *",
  trash_retention_days: 30,
  active_companies: "Google, Meta, Stripe, Notion, Linear, Vercel, Anthropic",
  extracted_keywords: JSON.stringify([
    "Python", "FastAPI", "React", "TypeScript", "LLM", "RAG",
    "Kubernetes", "PostgreSQL", "System Design", "API Gateway"
  ]),
  search_keywords: JSON.stringify([
    "python", "backend engineer", "software engineer", "api developer", "data engineer"
  ]),
  custom_guidelines: "Focus on impact metrics. Sound humble but confident.",
  ai_mode: "gemini",
  openai_api_key: null,
  anthropic_api_key: null,
  ollama_url: "http://localhost:11434",
  ollama_model: "llama3.1",
  model_telemetry: JSON.stringify({
    "gemini-2.5-flash": {
      requests: 47,
      prompt_tokens: 124500,
      candidate_tokens: 31200,
      today_requests: 12,
      last_request_date: new Date().toISOString().split("T")[0],
    },
    "gemini-1.5-flash": {
      requests: 8,
      prompt_tokens: 21000,
      candidate_tokens: 5800,
      today_requests: 2,
      last_request_date: new Date().toISOString().split("T")[0],
    },
  }),
}

const today = new Date()
const daysAgo = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export const MOCK_JOBS = [
  {
    id: 1, status: "NEW",
    title: "Senior Backend Engineer", company: "Stripe", location: "Remote",
    description: "Build the infrastructure powering global payments. Work with distributed systems at scale.",
    url: "https://stripe.com/jobs", salary: "$180k–$240k", experience_required: "5+ years",
    match_score: 94, source: "telegram", created_at: daysAgo(0), updated_at: daysAgo(0),
    skills_matched: ["Python", "PostgreSQL", "System Design"], notes: "",
  },
  {
    id: 2, status: "NEW",
    title: "Staff Software Engineer – AI Platform", company: "Anthropic", location: "San Francisco / Remote",
    description: "Help build safe AI systems. Work on inference infrastructure, tooling, and model deployment pipelines.",
    url: "https://anthropic.com/careers", salary: "$200k–$300k", experience_required: "7+ years",
    match_score: 89, source: "telegram", created_at: daysAgo(1), updated_at: daysAgo(1),
    skills_matched: ["Python", "LLM", "API Gateway", "Kubernetes"], notes: "",
  },
  {
    id: 3, status: "APPLIED",
    title: "Software Engineer – Developer Experience", company: "Vercel", location: "Remote",
    description: "Improve the DX for millions of developers building on Next.js and the Vercel platform.",
    url: "https://vercel.com/careers", salary: "$160k–$210k", experience_required: "3+ years",
    match_score: 82, source: "telegram", created_at: daysAgo(2), updated_at: daysAgo(1),
    skills_matched: ["React", "TypeScript", "System Design"], notes: "Applied via referral",
  },
  {
    id: 4, status: "APPLIED",
    title: "GenAI Platform Engineer", company: "Google DeepMind", location: "London / Remote",
    description: "Build production GenAI infrastructure — model serving, API gateway, safety layers.",
    url: "https://deepmind.google/careers", salary: "£130k–£180k", experience_required: "4+ years",
    match_score: 91, source: "telegram", created_at: daysAgo(3), updated_at: daysAgo(2),
    skills_matched: ["Python", "LLM", "API Gateway", "RAG"], notes: "Strong match — Gemini experience",
  },
  {
    id: 5, status: "INTERVIEWING",
    title: "Backend Engineer – Payments", company: "Notion", location: "Remote",
    description: "Join the platform team scaling Notion's backend to 100M+ users worldwide.",
    url: "https://notion.com/careers", salary: "$170k–$220k", experience_required: "4+ years",
    match_score: 78, source: "telegram", created_at: daysAgo(5), updated_at: daysAgo(1),
    skills_matched: ["Python", "PostgreSQL", "FastAPI"], notes: "Final round scheduled",
  },
  {
    id: 6, status: "INTERVIEWING",
    title: "API Platform Engineer", company: "Linear", location: "Remote",
    description: "Own the API layer powering Linear's integrations and developer ecosystem.",
    url: "https://linear.app/careers", salary: "$150k–$200k", experience_required: "3+ years",
    match_score: 85, source: "telegram", created_at: daysAgo(6), updated_at: daysAgo(2),
    skills_matched: ["TypeScript", "API Gateway", "System Design"], notes: "",
  },
  {
    id: 7, status: "OFFER",
    title: "Senior ML Engineer", company: "Meta", location: "Menlo Park / Remote",
    description: "Build ML infrastructure for ranking and recommendation systems at massive scale.",
    url: "https://meta.com/careers", salary: "$220k–$320k", experience_required: "5+ years",
    match_score: 76, source: "telegram", created_at: daysAgo(10), updated_at: daysAgo(0),
    skills_matched: ["Python", "Kubernetes", "LLM"], notes: "Offer received — evaluating",
  },
  {
    id: 8, status: "REJECTED",
    title: "Principal Engineer", company: "OpenAI", location: "San Francisco",
    description: "Lead architectural decisions for OpenAI's flagship product infrastructure.",
    url: "https://openai.com/careers", salary: "$300k+", experience_required: "10+ years",
    match_score: 61, source: "telegram", created_at: daysAgo(14), updated_at: daysAgo(7),
    skills_matched: ["Python", "System Design"], notes: "Moved forward with more senior candidates",
  },
]

export const MOCK_RUN_HISTORY = [
  {
    id: 1, status: "SUCCESS", jobs_found: 12,
    timestamp: daysAgo(0), trigger_source: "CRON", error_message: null,
  },
  {
    id: 2, status: "SUCCESS", jobs_found: 8,
    timestamp: daysAgo(0), trigger_source: "MANUAL", error_message: null,
  },
  {
    id: 3, status: "FAILED", jobs_found: 0,
    timestamp: daysAgo(1), trigger_source: "CRON", error_message: "Telegram API timeout\nCheck your bot token.",
  },
  {
    id: 4, status: "SUCCESS", jobs_found: 21,
    timestamp: daysAgo(1), trigger_source: "CRON", error_message: null,
  },
  {
    id: 5, status: "SUCCESS", jobs_found: 15,
    timestamp: daysAgo(2), trigger_source: "CRON", error_message: null,
  },
]

export const MOCK_RESUMES = ["my_resume_v3.pdf", "resume_google_2025.pdf"]

export const MOCK_COMPANIES = ["Google", "Meta", "Stripe", "Notion", "Linear", "Vercel", "Anthropic"]

export const MOCK_TOKEN_VALIDATE = { valid: true, message: "Token valid (demo)" }
