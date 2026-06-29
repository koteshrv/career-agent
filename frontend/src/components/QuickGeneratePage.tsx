import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Download, Copy, Check, Sparkles, AlertCircle, FilePlus, PenTool, Zap } from "lucide-react"

export function QuickGeneratePage() {
  const [company, setCompany] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  
  const [resumes, setResumes] = useState<string[]>([])
  const [selectedResume, setSelectedResume] = useState<string>("")
  
  const [activeTab, setActiveTab] = useState<"cover_letter" | "resume">("cover_letter")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  const [generatedCL, setGeneratedCL] = useState("")
  const [generatedResume, setGeneratedResume] = useState("")
  
  const [copiedCL, setCopiedCL] = useState(false)
  const [copiedResume, setCopiedResume] = useState(false)
  const [downloading, setDownloading] = useState(false)

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
    
    try {
      const mode = localStorage.getItem("generation_mode") || "gemini"
      
      const res = await api.post("/api/generate/on-demand", {
        company: company.trim() || "Unknown Company",
        title: title.trim() || "Applicant",
        description,
        resume: selectedResume || undefined,
        generation_mode: mode,
        type: type
      })
      
      if (type === "cover_letter") {
        setGeneratedCL(res.data.content)
      } else {
        setGeneratedResume(res.data.content)
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || `Failed to generate ${type.replace("_", " ")}`)
    }
    setLoading(false)
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
    <div className="flex h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Left Panel: Form */}
      <div className="w-1/2 flex flex-col border-r border-white/5 bg-[#0f1115] p-6 overflow-y-auto custom-scrollbar">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Generate
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Instantly generate a tailored resume or cover letter without tracking the job in your Kanban board.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Company Name <span className="text-zinc-600">(Optional)</span></label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 placeholder:text-zinc-700"
                placeholder="e.g. Google"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Job Title <span className="text-zinc-600">(Optional)</span></label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 placeholder:text-zinc-700"
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Base Resume</label>
            <div className="relative">
              <select
                value={selectedResume}
                onChange={e => setSelectedResume(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-white appearance-none focus:outline-none focus:border-blue-500 cursor-pointer text-sm"
              >
                <option value="" disabled className="bg-[#12141a]">Select a resume to use...</option>
                {resumes.map(r => <option key={r} value={r} className="bg-[#12141a]">{r}</option>)}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-zinc-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[300px]">
            <label className="block text-sm font-medium text-zinc-400 mb-1">Job Description <span className="text-red-400">*</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="flex-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 placeholder:text-zinc-700 resize-none custom-scrollbar"
              placeholder="Paste the full job description here..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
            <Button
              onClick={() => handleGenerate("cover_letter")}
              disabled={loading || !description.trim()}
              className="bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30"
            >
              <PenTool className="w-4 h-4 mr-2" />
              Write Cover Letter
            </Button>
            
            <Button
              onClick={() => handleGenerate("resume")}
              disabled={loading || !selectedResume || !description.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Tailor Resume
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel: Output */}
      <div className="w-1/2 flex flex-col bg-[#0a0c10]">
        <div className="flex px-4 pt-4 border-b border-white/5 gap-2">
          <button
            onClick={() => setActiveTab("cover_letter")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "cover_letter" 
                ? "border-blue-500 text-blue-400" 
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-white/20"
            }`}
          >
            Cover Letter
          </button>
          <button
            onClick={() => setActiveTab("resume")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "resume" 
                ? "border-blue-500 text-blue-400" 
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-white/20"
            }`}
          >
            Tailored Resume
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar relative group">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm font-medium animate-pulse text-blue-400">AI is crafting your {activeTab.replace("_", " ")}...</p>
            </div>
          ) : activeTab === "cover_letter" && generatedCL ? (
            <>
              <div className="absolute top-6 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  onClick={() => copyToClipboard(generatedCL, "cover_letter")} 
                  size="sm" 
                  className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                >
                  {copiedCL ? <Check className="w-4 h-4 mr-1.5 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copiedCL ? "Copied!" : "Copy"}
                </Button>
              </div>
              <pre className="text-sm text-zinc-300 font-sans whitespace-pre-wrap overflow-x-auto pb-8">
                {generatedCL}
              </pre>
            </>
          ) : activeTab === "resume" && generatedResume ? (
            <>
              <div className="absolute top-6 right-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button 
                  onClick={() => copyToClipboard(generatedResume, "resume")} 
                  size="sm" 
                  className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                >
                  {copiedResume ? <Check className="w-4 h-4 mr-1.5 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copiedResume ? "Copied!" : "Copy LaTeX"}
                </Button>
                <Button 
                  onClick={downloadPdf} 
                  disabled={downloading}
                  size="sm" 
                  className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  {downloading ? "Compiling..." : "Download PDF"}
                </Button>
              </div>
              <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap overflow-x-auto pb-8">
                {generatedResume}
              </pre>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 opacity-50">
              <FilePlus className="w-12 h-12" />
              <p className="text-sm">Output will appear here after generation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
