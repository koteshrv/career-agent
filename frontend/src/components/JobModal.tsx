import { useState, useEffect, useRef } from "react"
import type { Job } from "./KanbanBoard"
import { Button } from "@/components/ui/button"
import { Sparkles, MapPin, Calendar, ExternalLink, X, FileText, Trash2, Download, Globe, MessageSquare, Check } from "lucide-react"
import { formatISTDate } from "@/lib/datetime"
import { api, generateMaterialsStream } from "@/lib/api"
import { useToast } from "./Toast"
import { ConfirmDialog } from "./ConfirmDialog"

interface JobModalProps {
  job: Job
  onClose: () => void
  onUpdate: (updatedJob: Job) => void
  onDelete: (jobId: number) => void // Used for permanent deletion now
}

export function JobModal({ job, onClose, onUpdate, onDelete }: JobModalProps) {
  const { toast } = useToast()
  const [notes, setNotes] = useState(job.notes || "")
  const [showNotes, setShowNotes] = useState(!!job.notes)
  const [description, setDescription] = useState(job.description || "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingMaterials, setGeneratingMaterials] = useState(false)
  const [materialsError, setMaterialsError] = useState<string | null>(null)
  const [tailoredResume, setTailoredResume] = useState<string | null>(job.tailored_resume || null)
  const [copied, setCopied] = useState(false)
  const [copiedLetter, setCopiedLetter] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [resumes, setResumes] = useState<string[]>([])
  const [selectedResume, setSelectedResume] = useState<string>("")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" })
  }, [logs])
  useEffect(() => {
    api.get("/api/resumes").then(res => {
      const list = res.data.resumes || []
      setResumes(list)
      if (list.length) setSelectedResume(list[0])
    })
  }, [])

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { notes })
      onUpdate(res.data)
      toast("Notes saved", "success")
    } catch (e) {
      toast("Error saving notes", "error")
    }
    setSavingNotes(false)
  }

  const handleSaveDescription = async () => {
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { description })
      onUpdate(res.data)
      toast("Description saved", "success")
    } catch {
      toast("Error saving description", "error")
    }
  }



  const handleSoftDelete = async () => {
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { status: "TRASH" })
      onUpdate(res.data)
      toast("Moved to Trash", "success")
      onClose()
    } catch {
      toast("Failed to move to Trash", "error")
    }
  }

  const handleGenerateMaterials = async () => {
    setGeneratingMaterials(true)
    setMaterialsError(null)
    setLogs([])
    try {
      await generateMaterialsStream(`/api/jobs/${job.id}/application-materials`, {
        resume: selectedResume || null,
        generation_mode: localStorage.getItem("generation_mode") || "gemini"
      }, (msg) => {
        if (msg.status === "progress") {
          setLogs(prev => [...prev, msg.message])
        } else if (msg.status === "error") {
          setMaterialsError(msg.message)
        } else if (msg.status === "success" && msg.data) {
          setTailoredResume(msg.data.tailored_resume)
          onUpdate({...job, cover_letter: msg.data.cover_letter, cold_email: msg.data.cold_email, tailored_resume: msg.data.tailored_resume})
        }
      })
    } catch (e: any) {
      setMaterialsError(e.message || "Error generating materials. Make sure you uploaded a resume and configured a Gemini API key.")
    } finally {
      setGeneratingMaterials(false)
    }
  }

  const handleCopyResume = () => {
    if (!tailoredResume) return
    navigator.clipboard.writeText(tailoredResume)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleCopyLetter = () => {
    if (!job.cover_letter) return
    navigator.clipboard.writeText(job.cover_letter)
    setCopiedLetter(true)
    setTimeout(() => setCopiedLetter(false), 1500)
  }

  const handleCopyEmail = () => {
    if (!job.cold_email) return
    navigator.clipboard.writeText(job.cold_email)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 1500)
  }

  const handleOpenEmail = () => {
    if (!job.cold_email) return
    const subject = encodeURIComponent(`Application for ${job.title} at ${job.company}`)
    const body = encodeURIComponent(job.cold_email)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank')
  }

  const slug = `Hari_${job.company}_${job.title}`.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "")

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTex = () => {
    if (!tailoredResume) return
    downloadFile(tailoredResume, `${slug}.tex`, "application/x-tex")
  }

  const handleDownloadPdf = async () => {
    if (!tailoredResume) return
    setDownloadingPdf(true)
    try {
      const res = await api.get(`/api/jobs/${job.id}/resume/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url
      a.download = `${slug}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast("PDF Downloaded", "success")
    } catch (e) {
      toast("Failed to compile PDF. Ensure LaTeX is working.", "error")
    }
    setDownloadingPdf(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white">{job.title}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
              <span className="font-semibold text-blue-400">{job.company}</span>
              {job.location && (
                <span className="flex items-center gap-1">
                  {job.location.startsWith("Extension") ? (
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {job.location}
                </span>
              )}
              {job.external_id && (
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="font-semibold text-zinc-500">ID:</span> {job.external_id}
                </span>
              )}
              {job.yoe && (
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="font-semibold text-zinc-500">Exp:</span> {job.yoe}
                </span>
              )}
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatISTDate(job.created_at, true)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${showNotes ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              title="Toggle Notes"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <ExternalLink className="w-5 h-5" />
            </a>
            {job.status === "TRASH" ? (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                title="Permanently Delete"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Delete Forever</span>
              </button>
            ) : (
              <button
                onClick={handleSoftDelete}
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Move to Trash"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Notes Section */}
          {showNotes && (
            <div className="space-y-3 bg-blue-950/10 border border-blue-900/30 p-4 rounded-xl animate-in slide-in-from-top-2 fade-in duration-200">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Status & Notes</h3>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Ghosted, HR screening completed, passed OA..."
                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button 
                  onClick={async () => {
                    setNotes("");
                    setSavingNotes(true);
                    try {
                      const res = await api.put(`/api/jobs/${job.id}`, { notes: "" });
                      onUpdate(res.data);
                      toast("Notes cleared", "success");
                    } catch (e) {
                      toast("Error clearing notes", "error");
                    }
                    setSavingNotes(false);
                    setShowNotes(false);
                  }}
                  disabled={savingNotes || !notes}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 h-8 text-xs"
                >
                  Clear Notes
                </Button>
                <Button 
                  onClick={handleSaveNotes} 
                  disabled={savingNotes || notes === (job.notes || "")}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs"
                >
                  {savingNotes ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          )}

          {/* JD Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Job Description</h3>
            </div>
            
            {job.match_score !== undefined && job.match_score !== null && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${job.match_score >= 80 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : job.match_score >= 50 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                  <span className="font-bold text-white text-sm">AI Match Score: {job.match_score}%</span>
                </div>
                {job.match_reason && (
                  <p className="text-sm text-zinc-400 leading-relaxed">{job.match_reason}</p>
                )}
              </div>
            )}
            
            <textarea 
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleSaveDescription}
              placeholder="Paste the full job description here, or click Fetch..."
              className="w-full min-h-[200px] bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none overflow-hidden text-sm font-sans"
            />
          </div>

          {/* Shared Resume Selector for AI generation */}
          <div className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Source Resume</span>
            {resumes.length ? (
              <select
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 max-w-[60%]"
              >
                {resumes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <span className="text-xs text-zinc-500">No resumes uploaded — add one in Settings.</span>
            )}
          </div>

          {/* AI Cover Letter Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> AI Application Materials
              </h3>
              <Button 
                onClick={handleGenerateMaterials}
                disabled={generatingMaterials}
                className="bg-purple-600 hover:bg-purple-500 text-white h-8 text-xs shadow-lg shadow-purple-500/20"
              >
                {generatingMaterials ? "Generating Both..." : "Generate Materials"}
              </Button>
            </div>
            
            {materialsError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 flex items-start gap-2">
                <span className="font-semibold shrink-0">Error:</span>
                <span className="break-words">{materialsError}</span>
              </div>
            )}
            
            {logs.length > 0 && (
              <div className="bg-[#0a0c10] border border-white/5 rounded-xl p-4 text-sm text-zinc-300 font-mono h-[200px] flex flex-col">
                <div className="flex items-center space-x-3 mb-4 shrink-0">
                  {generatingMaterials ? (
                    <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className="text-blue-400 font-semibold">
                    {generatingMaterials ? "AI Drafter is running..." : "AI Generation Complete"}
                  </span>
                </div>
                <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  {logs.map((log, i) => (
                    <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3 items-start text-xs">
                      <span className="text-zinc-600 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span className="text-zinc-300 whitespace-pre-wrap">{log}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cover Letter</h4>
                  {job.cover_letter && (
                    <Button onClick={handleCopyLetter} className="bg-zinc-800 hover:bg-zinc-700 text-white h-7 text-xs px-3">
                      {copiedLetter ? "Copied!" : "Copy"}
                    </Button>
                  )}
                </div>
                {job.cover_letter ? (
                  <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed h-[300px] overflow-y-auto custom-scrollbar">
                    {job.cover_letter}
                  </div>
                ) : (
                  <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm h-[300px] flex items-center justify-center">
                    No cover letter generated yet.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cold Email / LinkedIn DM</h4>
                  {job.cold_email && (
                    <div className="flex gap-2">
                      <Button onClick={handleCopyEmail} className="bg-zinc-800 hover:bg-zinc-700 text-white h-7 text-xs px-3">
                        {copiedEmail ? "Copied!" : "Copy"}
                      </Button>
                      <Button onClick={handleOpenEmail} className="bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs px-3 shadow-lg shadow-blue-500/20 flex items-center gap-1">
                        Open in Email
                      </Button>
                    </div>
                  )}
                </div>
                {job.cold_email ? (
                  <div className="bg-zinc-900/50 border border-blue-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed h-[300px] overflow-y-auto custom-scrollbar">
                    {job.cold_email}
                  </div>
                ) : (
                  <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm h-[300px] flex items-center justify-center">
                    No cold email generated yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Tailored Resume Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> Tailored Resume
              </h4>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {tailoredResume && (
                  <>
                    <Button onClick={handleCopyResume} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button onClick={handleDownloadTex} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" /> .tex
                    </Button>
                    <Button onClick={handleDownloadPdf} disabled={downloadingPdf} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      {downloadingPdf ? (
                        "Compiling PDF..."
                      ) : (
                        <><Download className="w-3.5 h-3.5 mr-1" /> .pdf</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {tailoredResume ? (
              <div className="bg-zinc-900/50 border border-emerald-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed h-[400px] overflow-y-auto custom-scrollbar">
                {tailoredResume}
              </div>
            ) : (
              <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm">
                Generate application materials to instantly create a tailored LaTeX resume and compile it to a ready-to-submit PDF.
              </div>
            )}
          </div>

        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        danger
        title="Delete this job?"
        message={`"${job.title}" at ${job.company} will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDeleteOpen(false); onDelete(job.id) }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}
