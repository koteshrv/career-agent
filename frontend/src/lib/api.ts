import axios from "axios"
import {
  MOCK_JOBS, MOCK_SETTINGS, MOCK_RUN_HISTORY,
  MOCK_RESUMES, MOCK_TOKEN_VALIDATE, MOCK_COMPANIES,
} from "./mock-data"

// ── Demo mode ──────────────────────────────────────────────────────────────────
// When VITE_DEMO_MODE=true (set at GitHub Pages build time), all API calls
// return static mock data so the site works without a running backend.
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true"

// Centralized API base URL. Override at build/run time with VITE_API_URL.
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const api = axios.create({ baseURL: API_BASE })

export const TOKEN_KEY = "authToken"
export const getToken  = () => localStorage.getItem(TOKEN_KEY)
export const setToken  = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// Attach the auth token to every request.
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Demo-mode response interceptor ────────────────────────────────────────────
// Returns mock payloads for known endpoints before the request ever leaves
// the browser. Unknown endpoints are allowed through (will fail gracefully).
if (IS_DEMO) {
  api.interceptors.request.use(config => {
    const url = config.url || ""
    const method = (config.method || "get").toLowerCase()

    // Helper — seamlessly override the Axios adapter to short-circuit the network
    const respond = (data: unknown, status = 200) => {
      config.adapter = async () => ({
        data,
        status,
        statusText: "OK (demo)",
        headers: {},
        config,
      })
      return config
    }

    if (url.startsWith("/api/jobs") && method === "get")   return respond(MOCK_JOBS)
    if (url.startsWith("/api/jobs") && method !== "get")   return respond({ ok: true })
    if (url.startsWith("/api/settings") && method === "get") return respond(MOCK_SETTINGS)
    if (url.startsWith("/api/settings") && method !== "get") return respond(MOCK_SETTINGS)
    if (url.startsWith("/api/history"))                    return respond(MOCK_RUN_HISTORY)
    if (url.startsWith("/api/companies"))                  return respond({ companies: MOCK_COMPANIES })
    if (url.startsWith("/api/resumes") && method === "get")return respond({ resumes: MOCK_RESUMES })
    if (url.startsWith("/api/resumes"))                    return respond({ ok: true })
    if (url.startsWith("/api/auth/validate-token"))        return respond(MOCK_TOKEN_VALIDATE)
    if (url.startsWith("/api/auth/login"))                 return respond({ access_token: "demo-token" })
    if (url.startsWith("/api/generate"))                   return respond({ latex_source: "% Demo mode — backend not available", cover_letter: "Demo mode cover letter." })
    if (url.startsWith("/api/scrape"))                     return respond({ status: "queued" })

    return config
  })
}

// ── 401 handler (skip in demo mode) ──────────────────────────────────────────
if (!IS_DEMO) {
  api.interceptors.response.use(
    res => res,
    err => {
      if (err.response?.status === 401) {
        clearToken()
        if (window.location.pathname !== "/login") window.location.href = "/login"
      }
      return Promise.reject(err)
    }
  )
}
