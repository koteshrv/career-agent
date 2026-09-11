import { useState, useEffect, useRef } from "react"
import { api, generateMaterialsStream } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Download, Copy, Check, Sparkles, AlertCircle, FilePlus, PenTool } from "lucide-react"

export function QuickGeneratePage() {
  const [company, setCompany] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  
  const [resumes, setResumes] = useState<string[]>([])
  const [selectedResume, setSelectedResume] = useState<string>("")
  
  const [activeTab, setActiveTab] = useState<"cover_letter" | "resume" | "logs">("cover_letter")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  const [generatedCL, setGeneratedCL] = useState("")
  const [generatedResume, setGeneratedResume] = useState("")
  
  const [copiedCL, setCopiedCL] = useState(false)
  const [copiedResume, setCopiedResume] = useState(false)
  const [downloading, setDownloading] = useState(false)
  
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs])

  useEffect(() => {
    api.get("/api/resumes").then(res => {
      const list = res.data.resumes || []
      setResumes(list)
      if (list.length > 0) setSelectedResume(list[0])
    }).catch(() => {})
  }, [])

  const handleGenerate = async (type: "cover_letter" | "resume") => {
    if (!description.trim()) {
      setError("Please provide a Job Description to generate materials.")
      return
    }
    
    setError("")
    setLoading(true)
    setActiveTab(type)
    setLogs([])
    setGeneratedCL("")
    setGeneratedResume("")
    
    try {
      const mode = localStorage.getItem("generation_mode") || "gemini"
      
      const payload = {
        company: company.trim() || "Unknown Company",
        title: title.trim() || "Applicant",
        description,
        resume: selectedResume || undefined,
        generation_mode: mode,
        type: type
      }
      
      await generateMaterialsStream("/api/generate/on-demand", payload, (msg) => {
        if (msg.status === "progress") {
          setLogs(prev => [...prev, msg.message])
        } else if (msg.status === "error") {
          setError(msg.message)
        } else if (msg.status === "success" && msg.data) {
          setGeneratedCL(msg.data.cover_letter || "")
          setGeneratedResume(msg.data.tailored_resume || "")
        }
      })
      
    } catch (e: any) {
      setError(e.message || `Failed to generate ${type.replace("_", " ")}`)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, type: "cover_letter" | "resume") => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === "cover_letter") {
        setCopiedCL(true)
        setTimeout(() => setCopiedCL(false), 2000)
      } else {
        setCopiedResume(true)
        setTimeout(() => setCopiedResume(false), 2000)
      }
    } catch (err) {}
  }

  const downloadPdf = async () => {
    if (!generatedResume) return
    setDownloading(true)
    try {
      const res = await api.post("/api/generate/on-demand/pdf", {
        latex_content: generatedResume,
        company: company.trim() || "Unknown Company"
      }, { responseType: 'blob' })
      
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${(company || "Company").replace(/[^a-zA-Z0-9]/g, '_')}_Resume.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setError("Failed to compile PDF. Ensure LaTeX syntax is valid.")
    }
    setDownloading(false)
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6">
      {/* Left Panel: Form */}
      <div className="lg:w-1/2 flex flex-col bg-card border border-border rounded-lg p-6 overflow-y-auto custom-scrollbar">
        {error && (
          <div className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">{error}</div>
          </div>
        )}

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Company Name <span className="text-muted-foreground/60">(Optional)</span></label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                placeholder="e.g. Google"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Job Title <span className="text-muted-foreground/60">(Optional)</span></label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Base Resume</label>
            <div className="relative">
              <select
                value={selectedResume}
                onChange={e => setSelectedResume(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2.5 pr-10 text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer text-sm"
              >
                <option value="" disabled>Select a resume to use...</option>
                {resumes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[300px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Job Description <span className="text-destructive">*</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="flex-1 w-full bg-secondary border border-border rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60 resize-none custom-scrollbar"
              placeholder="Paste the full job description here..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
            <Button
              onClick={() => handleGenerate("cover_letter")}
              disabled={loading || !description.trim()}
              className="bg-secondary text-foreground hover:bg-accent border border-border"
            >
              <PenTool className="w-4 h-4 mr-2" />
              Write Cover Letter
            </Button>

            <Button
              onClick={() => handleGenerate("resume")}
              disabled={loading || !selectedResume || !description.trim()}
              className="bg-primary text-primary-foreground hover:opacity-90"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Tailor Resume
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel: Output */}
      <div className="lg:w-1/2 flex flex-col bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex px-4 pt-4 border-b border-border gap-2">
          <button
            onClick={() => setActiveTab("cover_letter")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "cover_letter"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cover Letter
          </button>
          <button
            onClick={() => setActiveTab("resume")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "resume"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tailored Resume
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "logs"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              AI Logs
            </button>
          )}
        </div>

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar relative group">
          {loading || (activeTab === "logs" && logs.length > 0) ? (
            <div className="h-full flex flex-col text-muted-foreground font-mono text-sm">
              <div className="flex items-center space-x-3 mb-6">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Check className="w-5 h-5 text-status-interviewing" />
                )}
                <span className="text-primary font-semibold">
                  {loading ? `AI is crafting your ${activeTab === 'logs' ? 'materials' : activeTab.replace("_", " ")}...` : "AI Generation Complete"}
                </span>
              </div>
              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pb-4">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-muted-foreground/60 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                    <span className="text-muted-foreground whitespace-pre-wrap">{log}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          ) : activeTab === "cover_letter" && generatedCL ? (
            <>
              <div className="absolute top-6 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  onClick={() => copyToClipboard(generatedCL, "cover_letter")}
                  size="sm"
                  className="bg-secondary hover:bg-accent text-foreground"
                >
                  {copiedCL ? <Check className="w-4 h-4 mr-1.5 text-status-interviewing" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copiedCL ? "Copied!" : "Copy"}
                </Button>
              </div>
              <pre className="text-sm text-foreground font-sans whitespace-pre-wrap overflow-x-auto pb-8">
                {generatedCL}
              </pre>
            </>
          ) : activeTab === "resume" && generatedResume ? (
            <>
              <div className="absolute top-6 right-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button
                  onClick={() => copyToClipboard(generatedResume, "resume")}
                  size="sm"
                  className="bg-secondary hover:bg-accent text-foreground"
                >
                  {copiedResume ? <Check className="w-4 h-4 mr-1.5 text-status-interviewing" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copiedResume ? "Copied!" : "Copy LaTeX"}
                </Button>
                <Button
                  onClick={downloadPdf}
                  disabled={downloading}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:opacity-90"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  {downloading ? "Compiling..." : "Download PDF"}
                </Button>
              </div>
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto pb-8">
                {generatedResume}
              </pre>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <FilePlus className="w-10 h-10 opacity-50" />
              <p className="text-sm">Output will appear here after generation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
