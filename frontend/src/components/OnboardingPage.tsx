import { getToken } from "@/lib/api";
import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Upload, FileText, CheckCircle, Loader2 } from "lucide-react"

export function OnboardingPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [extracted, setExtracted] = useState<{roles: string[], excludes: string[]} | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError("")
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError("")

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/onboarding/upload-resume", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      })

      if (!res.ok) {
        throw new Error(await res.text() || "Failed to upload")
      }

      const data = await res.json()
      setExtracted({
        roles: data.target_roles || [],
        excludes: data.excludes || []
      })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }


  const handleSkip = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/onboarding/skip", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        }
      })
      if (!res.ok) {
         throw new Error("Failed to skip onboarding");
      }
      window.location.href = "/app/explore"
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleContinue = () => {
    window.location.href = "/app/explore"
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 relative z-50">
      <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-lg p-8 relative">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Career Agent</h1>
          <p className="text-sm text-muted-foreground mt-2">
            To unlock AI-powered ATS scanning and personalized job matching, we need to analyze your profile.
          </p>
        </div>

        {!success ? (
          <div className="space-y-6">
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  setFile(e.dataTransfer.files[0])
                }
              }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf,.txt,.md,.tex" 
                className="hidden" 
              />
              
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <button 
                    onClick={() => setFile(null)}
                    className="text-xs text-muted-foreground hover:text-destructive underline mt-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Drag & drop your resume</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, TXT, MD, or TEX</p>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 text-sm bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    Browse files
                  </button>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md font-medium disabled:opacity-50 transition-opacity"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : "Analyze Profile"}
            </button>
            <div className="pt-2 text-center">
              <button 
                onClick={handleSkip}
                disabled={loading}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Skip for now
              </button>
            </div>

          </div>
        ) : (
          <div className="space-y-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-secondary/30 rounded-lg p-4 mb-6 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3 text-left">We found matches for:</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {extracted?.roles.map(r => (
                  <span key={r} className="bg-primary/20 text-primary px-2 py-1 rounded text-xs font-medium">{r}</span>
                ))}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-3 text-left">And we will exclude:</h3>
              <div className="flex flex-wrap gap-2">
                {extracted?.excludes.map(e => (
                  <span key={e} className="bg-destructive/10 text-destructive px-2 py-1 rounded text-xs font-medium">{e}</span>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleContinue}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors"
            >
              Start Exploring
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
