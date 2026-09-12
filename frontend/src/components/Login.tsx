import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, setToken } from "../lib/api"
import { Loader2, Zap } from "lucide-react"

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.post("/api/login", { username, password })
      setToken(res.data.token)
      navigate("/app/home", { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid username or password.")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-8 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-10">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2">
            <Zap className="w-7 h-7 text-primary fill-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">CareerAgent</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-2">Your automated job search assistant</p>
        </div>

        <form onSubmit={handleLocalLogin} className="space-y-3">
          <input
            type="text"
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium transition-opacity disabled:opacity-50"
          >
            Log in
          </button>
        </form>

        {error && (
          <div className="w-full mt-4 bg-destructive/10 border border-destructive/25 rounded-md p-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
