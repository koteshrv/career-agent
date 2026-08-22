import axios from "axios"
import {
  MOCK_JOBS, MOCK_SETTINGS, MOCK_RUN_HISTORY,
  MOCK_RESUMES, MOCK_TOKEN_VALIDATE, MOCK_COMPANIES,
} from "./mock-data"

// ── Demo mode ──────────────────────────────────────────────────────────────────
// When VITE_DEMO_MODE=true (set at GitHub Pages build time), all API calls
// return static mock data so the site works without a running backend.
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true"

// Centralized API base URL. Defaulting to empty string allows relative URLs
// which makes the frontend agnostic to the host port in Docker via reverse proxy.
export const API_BASE = import.meta.env.VITE_API_URL || ""

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
    if (url.startsWith("/api/generate/on-demand/pdf")) return respond(new Blob(["% PDF Dummy Data"]), 200)
    if (url.startsWith("/api/generate"))                   return respond({ content: "Demo mode — backend not available. This is a placeholder for the generated material.", latex_source: "% Demo mode — backend not available", cover_letter: "Demo mode cover letter." })
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

export async function generateMaterialsStream(
  url: string,
  payload: any,
  onMessage: (message: any) => void
) {
  if (IS_DEMO) {
    onMessage({ status: "progress", message: "Fetching RAG Context (Mock)..." })
    await new Promise(r => setTimeout(r, 1000))
    onMessage({ status: "progress", message: "Drafting materials (Mock)..." })
    await new Promise(r => setTimeout(r, 1000))
    onMessage({ status: "success", data: { cover_letter: "Demo mode cover letter.", tailored_resume: "Demo mode resume." } })
    return
  }

  const token = getToken()
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    let errText = "Unknown error"
    try {
      const errJson = await res.json()
      errText = errJson.detail || JSON.stringify(errJson)
    } catch (e) {
      errText = await res.text()
    }
    throw new Error(errText || res.statusText)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error("No reader available")

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    
    let boundary = buffer.indexOf('\n')
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 1)
      
      if (line) {
        try {
          const data = JSON.parse(line)
          onMessage(data)
        } catch (e) {
          console.error("Failed to parse SSE chunk:", line, e)
        }
      }
      boundary = buffer.indexOf('\n')
    }
  }
}
