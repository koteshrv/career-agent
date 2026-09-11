import { useState, useEffect, useRef } from "react"
import type { Job } from "./JobsBoard"
import { Button } from "@/components/ui/button"
import { Sparkles, MapPin, Calendar, ExternalLink, X, FileText, Trash2, Download, Globe, MessageSquare, Check, Flag } from "lucide-react"
import { formatISTDate } from "@/lib/datetime"
import { api, generateMaterialsStream } from "@/lib/api"
import { useToast } from "./Toast"
import { ConfirmDialog } from "./ConfirmDialog"

interface JobModalProps {
  job: Job
  onClose: () => void
  onUpdate: (updatedJob: Job) => void
  onDelete: (jobId: number, silent?: boolean) => void // Used for permanent deletion now
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
  const [reportModalOpen, setReportModalOpen] = useState(false)
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

  const handleReportJob = async () => {
    try {
      const res = await api.post("/api/crowdsource/report", { job_id: job.external_id, reason: "dead_link" })
      if (res.data.success) {
        toast("Job reported successfully and removed from your board.", "success")
        setReportModalOpen(false)
        onDelete(job.id, true) // Automatically remove locally regardless of global threshold
      } else {
        toast(res.data.reason || res.data.message || "Failed to report.", "error")
        setReportModalOpen(false)
      }
    } catch (e: any) {
      toast("Error reporting job.", "error")
      setReportModalOpen(false)
    }
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
              <span className="font-semibold text-status-new">{job.company}</span>
              {job.location && (
                <span className="flex items-center gap-1">
                  {job.location.startsWith("Extension") ? (
                    <Globe className="w-3.5 h-3.5 text-status-new" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {job.location}
                </span>
              )}
              {job.external_id && (
                <span className="flex items-center gap-1 text-foreground font-mono text-xs bg-secondary px-1.5 py-0.5 rounded" title={`Community ID: ${job.external_id}`}>
                  <span className="font-semibold text-muted-foreground font-sans text-sm">ID:</span> {job.external_id.split('-')[0]}
                </span>
              )}
              {job.yoe && (
                <span className="flex items-center gap-1 text-foreground">
                  <span className="font-semibold text-muted-foreground">Exp:</span> {job.yoe}
                </span>
              )}
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatISTDate(job.created_at, true)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${showNotes ? 'text-status-new bg-status-new/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
              title="Toggle Notes"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
              <ExternalLink className="w-5 h-5" />
            </a>
            {job.external_id && (
              <button
                onClick={() => setReportModalOpen(true)}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Report & Delete Community Job"
              >
                <Flag className="w-5 h-5" />
              </button>
            )}
            {job.status === "TRASH" ? (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-2 text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-2"
                title="Permanently Delete"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Delete Forever</span>
              </button>
            ) : (
              <button
                onClick={handleSoftDelete}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Move to Trash"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Notes Section */}
          {showNotes && (
            <div className="space-y-3 bg-status-new/10 border border-status-new/30 p-4 rounded-xl animate-in slide-in-from-top-2 fade-in duration-200">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Status & Notes</h3>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Ghosted, HR screening completed, passed OA..."
                className="w-full h-32 bg-secondary border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none"
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
                  className="bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 h-8 text-xs"
                >
                  Clear Notes
                </Button>
                <Button 
                  onClick={handleSaveNotes} 
                  disabled={savingNotes || notes === (job.notes || "")}
                  className="bg-secondary hover:bg-accent text-foreground h-8 text-xs"
                >
                  {savingNotes ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          )}

          {/* JD Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Job Description</h3>
            </div>
            
            {job.match_score !== undefined && job.match_score !== null && (
              <div className="bg-card border border-border rounded-xl p-4 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${job.match_score >= 80 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : job.match_score >= 50 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                  <span className="font-bold text-foreground text-sm">AI Match Score: {job.match_score}%</span>
                </div>
                
                {(job.score_tech_stack || job.score_experience || job.score_domain || job.score_culture) && (
                  <div className="flex flex-wrap gap-2 mt-3 mb-3">
                    {[
                      { label: "Tech", val: job.score_tech_stack },
                      { label: "Experience", val: job.score_experience },
                      { label: "Domain", val: job.score_domain },
                      { label: "Culture", val: job.score_culture }
                    ].map(s => s.val ? (
                      <div key={s.label} className={`px-2 py-1 rounded-md border text-xs font-semibold flex gap-1.5 items-center ${
                        ['A', 'B'].includes(s.val.toUpperCase()) ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        s.val.toUpperCase() === 'C' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                        'bg-destructive/10 text-destructive border-destructive/20'
                      }`}>
                        <span className="text-foreground/60 font-medium">{s.label}:</span> 
                        <span>{s.val.toUpperCase()}</span>
                      </div>
                    ) : null)}
                  </div>
                )}

                {job.match_reason && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{job.match_reason}</p>
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
              className="w-full min-h-[200px] bg-secondary border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none overflow-hidden text-sm font-sans"
            />
          </div>

          {/* Shared Resume Selector for AI generation */}
          <div className="flex items-center justify-between gap-3 bg-secondary border border-border rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Resume</span>
            {resumes.length ? (
              <select
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-blue-500 max-w-[60%]"
              >
                {resumes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <span className="text-xs text-muted-foreground">No resumes uploaded — add one in Settings.</span>
            )}
          </div>

          {/* AI Cover Letter Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> AI Application Materials
              </h3>
              <Button 
                onClick={handleGenerateMaterials}
                disabled={generatingMaterials}
                className="bg-purple-600 hover:bg-purple-500 text-foreground h-8 text-xs shadow-lg shadow-purple-500/20"
              >
                {generatingMaterials ? "Generating Both..." : "Generate Materials"}
              </Button>
            </div>
            
            {materialsError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive flex items-start gap-2">
                <span className="font-semibold shrink-0">Error:</span>
                <span className="break-words">{materialsError}</span>
              </div>
            )}
            
            {logs.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 text-sm text-foreground font-mono h-[200px] flex flex-col">
                <div className="flex items-center space-x-3 mb-4 shrink-0">
                  {generatingMaterials ? (
                    <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className="text-status-new font-semibold">
                    {generatingMaterials ? "AI Drafter is running..." : "AI Generation Complete"}
                  </span>
                </div>
                <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  {logs.map((log, i) => (
                    <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3 items-start text-xs">
                      <span className="text-muted-foreground shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span className="text-foreground whitespace-pre-wrap">{log}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cover Letter</h4>
                  {job.cover_letter && (
                    <Button onClick={handleCopyLetter} className="bg-secondary hover:bg-accent text-foreground h-7 text-xs px-3">
                      {copiedLetter ? "Copied!" : "Copy"}
                    </Button>
                  )}
                </div>
                {job.cover_letter ? (
                  <div className="bg-card border border-purple-500/20 rounded-xl p-6 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed h-[300px] overflow-y-auto custom-scrollbar">
                    {job.cover_letter}
                  </div>
                ) : (
                  <div className="bg-secondary border border-border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm h-[300px] flex items-center justify-center">
                    No cover letter generated yet.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cold Email / LinkedIn DM</h4>
                  {job.cold_email && (
                    <div className="flex gap-2">
                      <Button onClick={handleCopyEmail} className="bg-secondary hover:bg-accent text-foreground h-7 text-xs px-3">
                        {copiedEmail ? "Copied!" : "Copy"}
                      </Button>
                      <Button onClick={handleOpenEmail} className="bg-primary hover:bg-primary/80 text-foreground h-7 text-xs px-3 shadow-lg shadow-primary/20 flex items-center gap-1">
                        Open in Email
                      </Button>
                    </div>
                  )}
                </div>
                {job.cold_email ? (
                  <div className="bg-card border border-blue-500/20 rounded-xl p-6 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed h-[300px] overflow-y-auto custom-scrollbar">
                    {job.cold_email}
                  </div>
                ) : (
                  <div className="bg-secondary border border-border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm h-[300px] flex items-center justify-center">
                    No cold email generated yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Tailored Resume Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> Tailored Resume
              </h4>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {tailoredResume && (
                  <>
                    <Button onClick={handleCopyResume} className="bg-secondary hover:bg-accent text-foreground h-8 text-xs">
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button onClick={handleDownloadTex} className="bg-secondary hover:bg-accent text-foreground h-8 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" /> .tex
                    </Button>
                    <Button onClick={handleDownloadPdf} disabled={downloadingPdf} className="bg-secondary hover:bg-accent text-foreground h-8 text-xs">
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
              <div className="bg-card border border-emerald-500/20 rounded-xl p-6 text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed h-[400px] overflow-y-auto custom-scrollbar">
                {tailoredResume}
              </div>
            ) : (
              <div className="bg-secondary border border-border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
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

      <ConfirmDialog
        open={reportModalOpen}
        danger
        title="Report this community job?"
        message="If this job is fake, spam, or a dead link, you can report it to the crowdsourcing network. The job will be instantly deleted from your board, and if enough users report it, it will be removed from the global pool."
        confirmLabel="Report & Delete"
        onConfirm={handleReportJob}
        onCancel={() => setReportModalOpen(false)}
      />
    </div>
  )
}
