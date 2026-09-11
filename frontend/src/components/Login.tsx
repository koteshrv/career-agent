import { useState, useEffect } from "react"
import axios from "axios"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api, setToken, setCloudToken } from "@/lib/api"
import { runtimeConfig } from "@/lib/runtime-config"
import { Zap, Clock } from "lucide-react"
import { GoogleLogin } from '@react-oauth/google'
import { useToast } from "./Toast"

export function Login() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pendingApproval, setPendingApproval] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Exchanges a verified crowdsourcing identity for a local dashboard session. The backend
  // re-verifies `cloudToken` against career-agent-api itself (never trusts a client-side
  // decode) before deciding whether this email is an already-approved user, a first-time
  // signup (creates a PENDING request, no session), or a rejected one.
  const completeSsoLogin = async (cloudToken: string, provider: string, email: string) => {
    try {
      const res = await api.post("/api/auth/sso", { cloud_token: cloudToken, provider })
      if (res.data.status === "active") {
        setToken(res.data.token)
        try {
          await setCloudToken(cloudToken, email)
        } catch (e) {
          console.error("Failed to save crowdsourcing connection", e)
        }
        navigate("/app/applications", { replace: true })
      } else {
        setPendingApproval(true)
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError("Your access request was rejected. Contact the administrator.")
      } else {
        setError(err.response?.data?.detail || "Sign-in failed.")
      }
    }
  }

  // Handle GitHub OAuth callback if 'code' is present in URL. The raw code is exchanged
  // directly with career-agent-api (which holds its own GitHub OAuth app secret) — this
  // backend has no part in that exchange and never sees the code itself.
  useEffect(() => {
    const code = searchParams.get("code")
    if (!code) return

    const exchangeCode = async () => {
      setLoading(true)
      try {
        const apiUrl = runtimeConfig.crowdsourceApiUrl
        if (!apiUrl) throw new Error("Crowdsourcing API URL is not configured")
        // Plain axios, NOT the shared `api` instance — that instance attaches the local
        // dashboard bearer token to every request, which must never reach a third-party host.
        const cloudRes = await axios.post(`${apiUrl}/api/auth/login`, {
          idp_token: code,
          sso_provider: "github"
        })

        const cloudToken = cloudRes.data.token || cloudRes.data.access_token
        let email = "GitHub User"
        try {
          if (cloudToken) {
            const payload = JSON.parse(atob(cloudToken.split('.')[1]))
            email = payload.email || payload.login || "GitHub User"
          }
        } catch (e) {
          console.error("Failed to decode JWT for email", e)
        }

        setSearchParams({}) // Clear the code from URL so it doesn't re-trigger on refresh
        await completeSsoLogin(cloudToken, "github", email)
      } catch (err: any) {
        console.error(err)
        setError(err.response?.data?.detail || err.response?.data?.error || err.message || "GitHub verification failed.")
        setSearchParams({})
      }
      setLoading(false)
    }

    exchangeCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, navigate, setSearchParams])

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError(null)
    setLoading(true)
    try {
      const apiUrl = runtimeConfig.crowdsourceApiUrl
      if (!apiUrl) throw new Error("Crowdsourcing API URL is not configured")
      const cloudRes = await axios.post(`${apiUrl}/api/auth/login`, {
        idp_token: credentialResponse.credential,
        sso_provider: "google"
      })

      let email = ""
      try {
        const payload = JSON.parse(atob(credentialResponse.credential.split('.')[1]))
        email = payload.email || ""
      } catch (e) { /* best-effort only, used for display */ }

      await completeSsoLogin(cloudRes.data.token || cloudRes.data.access_token, "google", email)
    } catch (err: any) {
      console.error(err)
      toast("Failed to connect with Google.", "error")
    }
    setLoading(false)
  }

  const handleGithubLogin = () => {
    const clientId = runtimeConfig.githubClientId
    const redirectUri = encodeURIComponent(`${window.location.origin}/login`)
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user user:email`
  }

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.post("/api/login", { username, password })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid username or password.")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100">
      <div className="w-full max-w-sm bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden">

        {loading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
            <Zap className="w-8 h-8 text-blue-500 animate-pulse" />
          </div>
        )}

        <div className="flex flex-col items-center justify-center space-y-4 mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">CareerAgent</h1>
            <p className="text-zinc-400 text-sm mt-2">Your automated job search assistant</p>
          </div>
        </div>

        {pendingApproval ? (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Request pending approval</h2>
              <p className="text-sm text-zinc-400 mt-1">The administrator needs to approve your account before you can sign in. Try again once you've been approved.</p>
            </div>
            <button
              onClick={() => setPendingApproval(false)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleLocalLogin} className="space-y-3">
              <input
                type="text"
                autoComplete="username"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                required
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Log in
              </button>
            </form>

            <div className="space-y-4 flex flex-col items-center mt-6">
              <div className="flex items-center w-full py-1">
                <div className="flex-1 border-t border-white/10"></div>
                <span className="px-3 text-xs text-zinc-500 uppercase tracking-wider">or sign in with</span>
                <div className="flex-1 border-t border-white/10"></div>
              </div>

              <div className="w-full relative">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google Sign-In failed.")}
                  theme="filled_black"
                  size="large"
                  shape="rectangular"
                  width="100%"
                />
              </div>

              <button
                onClick={handleGithubLogin}
                disabled={loading}
                className="w-full h-10 rounded flex items-center justify-center gap-2 bg-[#202124] hover:bg-[#2c3137] text-[#e3e3e3] text-sm font-medium transition-colors"
              >
                <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Sign in with GitHub
              </button>

              <p className="text-[11px] leading-relaxed text-zinc-500 text-center mt-2 pt-2">
                First time setting up this instance? The first Google/GitHub account to sign in becomes the administrator. After that, new sign-ins need the administrator's approval.
              </p>

              {error && (
                <div className="w-full bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 text-center">
                  {error}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
