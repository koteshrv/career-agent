import axios from "axios"

// Centralized API base URL. Override at build/run time with VITE_API_URL.
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const api = axios.create({ baseURL: API_BASE })

export const TOKEN_KEY = "authToken"

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// Attach the auth token to every request.
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, drop the token and bounce to the login page.
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearToken()
      if (window.location.pathname !== "/login") {
        window.location.href = "/login"
      }
    }
    return Promise.reject(err)
  }
)
