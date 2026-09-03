import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, setToken } from "@/lib/api"
import { Zap, ArrowRight } from "lucide-react"
import { GoogleLogin } from '@react-oauth/google'

export function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.post("/api/auth/sso", {
        idp_token: credentialResponse.credential,
        sso_provider: "google"
      })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.detail || "Google Sign-In failed or was rejected by the server.")
    }
    setLoading(false)
  }

  const handleSkip = async () => {
    setError(null)
    setLoading(true)
    try {
      // Local fallback using the default environment credentials
      const res = await api.post("/api/login", { 
        username: "admin", 
        password: "admin" 
      })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      console.error(err)
      setError("Failed to skip login. Default credentials may have been changed.")
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
            <p className="text-zinc-400 text-sm mt-2">Sign in to sync your job matches</p>
          </div>
        </div>

        <div className="space-y-6 flex flex-col items-center">
          <div className="w-full relative">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => {
                setError("Google Sign-In failed.")
              }}
              theme="filled_black"
              size="large"
              shape="rectangular"
              width="100%"
            />
          </div>

          <div className="flex items-center w-full">
            <div className="flex-1 border-t border-white/10"></div>
            <span className="px-3 text-xs text-zinc-500 uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-white/10"></div>
          </div>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="w-full group flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
          >
            Skip for now (Local Mode)
            <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
          </button>

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
