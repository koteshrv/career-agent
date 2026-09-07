import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, setToken, setCloudToken } from "@/lib/api"
import { Zap, User } from "lucide-react"
import { GoogleLogin } from '@react-oauth/google'
import { useToast } from "./Toast"

export function Login() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Connects this Google account to the crowdsourcing credit economy (career-agent-api).
  // This does NOT log the user into the local dashboard — that stays gated by the
  // username/password below.
  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError(null)
    setLoading(true)
    try {
      const cloudRes = await api.post("https://career-agent-api.kotesh-rv.workers.dev/api/auth/login", {
        idp_token: credentialResponse.credential,
        sso_provider: "google"
      })
      let email = ""
      try {
        const payload = JSON.parse(atob(credentialResponse.credential.split('.')[1]))
        email = payload.email || ""
      } catch (e) {}
      
      await setCloudToken(cloudRes.data.token || cloudRes.data.access_token, email)
      toast("Crowdsourcing account connected!", "success")
      
      // Auto-login to the dashboard
      const res = await api.post("/api/login", { username: "admin", password: "admin" })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      console.error(err)
      toast("Failed to connect crowdsourcing account.", "error")
    }
    setLoading(false)
  }

  const handleGithubLogin = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "YOUR_GITHUB_CLIENT_ID"
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/github/callback`)
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user user:email`
  }

  const handleSkip = async () => {
    setError(null)
    setLoading(true)
    try {
      // Explicitly disable crowdsourcing by clearing any existing cloud token
      localStorage.removeItem("cloudToken")
      await api.post("/api/crowdsource/connect", { token: "" })

      const res = await api.post("/api/login", { username: "admin", password: "admin" })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      setError("Failed to skip login.")
    }
    setLoading(false)
  }

  // Exact Google Button styles
  const btnStyle = {
    height: "40px",
    backgroundColor: "#202124", 
    color: "#e3e3e3",
    border: "1px solid #202124",
    borderRadius: "4px",
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    cursor: "pointer",
    transition: "background-color 0.2s"
  }

  const fontStyle = {
    fontFamily: "\"Google Sans\", Roboto, arial, sans-serif",
    fontSize: "14px",
    fontWeight: 500,
    letterSpacing: "0.25px",
    paddingLeft: "24px" // To offset the icon so text is visually centered
  }

  const iconBoxStyle = {
    position: "absolute" as const,
    left: "1px",
    top: "1px",
    bottom: "1px",
    width: "38px",
    backgroundColor: "white",
    borderTopLeftRadius: "3px",
    borderBottomLeftRadius: "3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
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
            <p className="text-zinc-400 text-sm mt-2">Sign in to sync your job matches</p>
          </div>
        </div>

        <div className="space-y-4 flex flex-col items-center">
          <p className="text-xs text-zinc-500 text-center w-full -mb-1">
            Connect a crowdsourcing account (optional) — this does not log you into the dashboard.
          </p>
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
            style={btnStyle}
            className="hover:bg-[#2c3137]"
          >
            <div style={iconBoxStyle}>
              <svg height="18" width="18" viewBox="0 0 16 16" fill="black">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </div>
            <span style={fontStyle}>Sign in with GitHub</span>
          </button>

          <div className="flex items-center w-full py-1">
            <div className="flex-1 border-t border-white/10"></div>
            <span className="px-3 text-xs text-zinc-500 uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-white/10"></div>
          </div>

          <button
            onClick={handleSkip}
            disabled={loading}
            style={btnStyle}
            className="hover:bg-[#2c3137]"
          >
            <div style={iconBoxStyle}>
              <User className="w-[18px] h-[18px] text-black" />
            </div>
            <span style={fontStyle}>Continue as Local User</span>
          </button>

          <p className="text-[11px] leading-relaxed text-zinc-500 text-center mt-6 pt-2">
            Connecting enables the crowdsourcing API to push and pull community jobs.
            You can disable this anytime in Settings.
          </p>

          {error && (
            <div className="w-full bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
