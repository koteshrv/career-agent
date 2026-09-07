import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api, setCloudToken, setToken } from "@/lib/api"
import { Zap, CheckCircle2 } from "lucide-react"

// Connects a GitHub account to the crowdsourcing credit economy (career-agent-api).
// This does NOT log the user into the local dashboard — that stays gated by /login.
export function GithubCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const code = searchParams.get("code")
    if (!code) {
      setError("No authorization code found in URL.")
      return
    }

    const exchangeCode = async () => {
      try {
        // 1. Exchange the OAuth code for a GitHub access token via the local backend
        //    (needs the client secret, which must stay server-side).
        const localRes = await api.post("/api/auth/sso", {
          auth_code: code,
          sso_provider: "github"
        })
        const githubAccessToken = localRes.data.github_access_token

        // 2. Forward the access token to the crowdsourcing API to link/identify the account.
        const cloudRes = await api.post("https://career-agent-api.kotesh-rv.workers.dev/api/auth/login", {
          idp_token: githubAccessToken,
          sso_provider: "github"
        })
        
        // Fetch GitHub username
        let email = "GitHub User"
        try {
            const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${githubAccessToken}` } })
            const userData = await userRes.json()
            email = userData.login || userData.email || "GitHub User"
        } catch (e) {}
        
        await setCloudToken(cloudRes.data.token || cloudRes.data.access_token, email)

        // 3. Auto-login to the local dashboard
        const loginRes = await api.post("/api/login", { username: "admin", password: "admin" })
        setToken(loginRes.data.token)

        setDone(true)

      } catch (err: any) {
        console.error(err)
        setError(err.response?.data?.detail || err.response?.data?.error || err.message || "Failed to authenticate with GitHub.")
      }
    }

    exchangeCode()
  }, [searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100">
        <div className="w-full max-w-sm bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
           <div className="text-red-400 mb-4">{error}</div>
           <button onClick={() => navigate("/app/applications")} className="px-4 py-2 bg-white/10 rounded hover:bg-white/20">Continue to Dashboard</button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100">
        <div className="w-full max-w-sm bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-medium mb-2">Crowdsourcing account connected</h2>
          <p className="text-sm text-zinc-400 mb-6">You can now push and pull community jobs.</p>
          <button onClick={() => navigate("/app/applications")} className="px-4 py-2 bg-white/10 rounded hover:bg-white/20">Continue to Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-zinc-100">
      <Zap className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
      <h2 className="text-xl font-medium animate-pulse">Authenticating with GitHub...</h2>
      <p className="text-sm text-zinc-400 mt-2">Connecting to Career Agent API...</p>
    </div>
  )
}
