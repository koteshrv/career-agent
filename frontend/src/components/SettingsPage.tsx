import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrapeConfig } from "./ScrapeConfig"
import { SystemHealth } from "./SystemHealth"
import { useToast } from "./Toast"
import { FileText, Trash2, X, Check, ShieldCheck, ShieldAlert, Lock } from "lucide-react"

// ── Model Priority Picker (drag-to-reorder) ────────────────────────────────────
type ModelSuggestion = { value: string; label: string; badge?: string }

function ModelPriorityPicker({ label, value, onChange, suggestions }: {
  label: string; value: string; onChange: (v: string) => void; suggestions: ModelSuggestion[]
}) {
  const parseSelected = (v: string) => v.split(",").map(s => s.trim()).filter(Boolean)
  const [selected, setSelected] = useState<string[]>(() => parseSelected(value))
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  useEffect(() => { setSelected(parseSelected(value)) }, [value])

  const emit = (next: string[]) => { setSelected(next); onChange(next.join(", ")) }

  const toggle = (modelValue: string) => {
    if (selected.includes(modelValue)) emit(selected.filter(s => s !== modelValue))
    else emit([...selected, modelValue])
  }

  const moveUp   = (i: number) => { if (i === 0) return; const n=[...selected];[n[i-1],n[i]]=[n[i],n[i-1]]; emit(n) }
  const moveDown = (i: number) => { if (i===selected.length-1) return; const n=[...selected];[n[i],n[i+1]]=[n[i+1],n[i]]; emit(n) }

  // ── Drag handlers ──
  const onDragStart = (idx: number) => { dragIdx.current = idx }
  const onDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOver(idx) }
  const onDrop      = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(null); return }
    const next = [...selected]
    const [item] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, item)
    dragIdx.current = null
    setDragOver(null)
    emit(next)
  }
  const onDragEnd = () => { dragIdx.current = null; setDragOver(null) }

  const allModels = [
    ...suggestions,
    ...selected
      .filter(s => !suggestions.some(sg => sg.value === s))
      .map(s => ({ value: s, label: s, badge: "custom" }))
  ]

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-2">{label}</label>

      {/* ── Priority list (draggable) ── */}
      {selected.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {selected.map((modelVal, idx) => {
            const suggestion = allModels.find(s => s.value === modelVal)
            const isOver = dragOver === idx
            return (
              <div
                key={modelVal}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={e => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all select-none
                  ${isOver
                    ? "border-primary/60 bg-primary/10 scale-[1.01]"
                    : "border-primary/20 bg-primary/5"}`}
              >
                {/* Drag handle */}
                <span
                  className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                  title="Drag to reorder"
                >
                  <svg className="w-3.5 h-5" viewBox="0 0 10 16" fill="currentColor">
                    <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
                    <circle cx="3" cy="6.5" r="1.2"/><circle cx="7" cy="6.5" r="1.2"/>
                    <circle cx="3" cy="10.5" r="1.2"/><circle cx="7" cy="10.5" r="1.2"/>
                    <circle cx="3" cy="14.5" r="1.2"/><circle cx="7" cy="14.5" r="1.2"/>
                  </svg>
                </span>

                {/* Position badge */}
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 font-mono text-sm text-foreground truncate">{modelVal}</span>
                {suggestion?.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground shrink-0">{suggestion.badge}</span>
                )}

                {/* ↑↓ nudge buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="w-5 h-4 flex items-center justify-center rounded hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                    title="Move up">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === selected.length - 1}
                    className="w-5 h-4 flex items-center justify-center rounded hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                    title="Move down">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                </div>

                {/* Remove */}
                <button onClick={() => toggle(modelVal)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          <p className="text-[10px] text-muted-foreground pl-1">Drag ⠿ to reorder · #1 is tried first on failure</p>
        </div>
      )}

      {/* ── Add Model Input ── */}
      <div className="mt-2">
        <input 
          type="text" 
          placeholder="+ Type a model name to add and press Enter..." 
          className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              e.preventDefault();
              const val = e.currentTarget.value.trim();
              if (!selected.includes(val)) emit([...selected, val]);
              e.currentTarget.value = '';
            }
          }}
          list={`models-${label.replace(/\s+/g, '')}`}
        />
        <datalist id={`models-${label.replace(/\s+/g, '')}`}>
          {suggestions.filter(s => !selected.includes(s.value)).map(s => (
            <option key={s.value} value={s.value}>{s.badge || ''}</option>
          ))}
        </datalist>
      </div>

    </div>
  )
}

// ── TOS / Privacy Warning Banner ──────────────────────────────────────────────
type TosLevel = "warn" | "ok" | "private"
function TosWarning({ level, text }: { level: TosLevel; text: string }) {
  const cfg = {
    warn:    { icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-status-applied/10 border-status-applied/20", txt: "text-status-applied", prefix: "Data Privacy" },
    ok:      { icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-status-interviewing/10 border-status-interviewing/20", txt: "text-status-interviewing", prefix: "Privacy Safe" },
    private: { icon: <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-primary/10 border-primary/20", txt: "text-primary", prefix: "Fully Private" },
  }[level]
  return (
    <div className={`p-2.5 border rounded-md ${cfg.bg}`}>
      <div className={`flex items-start gap-2 text-xs ${cfg.txt}`}>
        {cfg.icon}
        <div>
          <span className="font-semibold">{cfg.prefix} — </span>
          <span className="text-muted-foreground">{text}</span>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: "jobsearch", label: "Job Search" },
  { id: "resume", label: "Resume & AI" },
  { id: "notifications", label: "Notifications" },
  { id: "data", label: "Data" },
  { id: "health", label: "System Health" },
] as const
type TabId = typeof TABS[number]["id"] | "members"

export function SettingsPage() {
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<any>({
    telegram_chat_id: "",
    telegram_bot_token: "",
    telegram_alerts_enabled: true,
    healthcheck_ping_url: "",
    debug_logging_enabled: false,
    min_match_score: 50,
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
    cron_schedule: "0 */4 * * *",
    trash_retention_days: 30,
    active_companies: "",
    api_key_tag: ""
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeName, setResumeName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [resumes, setResumes] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState("")
  const [users, setUsers] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  const requestedTab = searchParams.get("tab") as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(requestedTab || "jobsearch")
  const setTab = (id: TabId) => { setActiveTab(id); setSearchParams(id === "jobsearch" ? {} : { tab: id }) }

  const handleAddSkill = async () => {
    if (!newSkill.trim()) return
    let current = []
    try {
      if (settings.extracted_keywords) {
        current = JSON.parse(settings.extracted_keywords)
      }
    } catch (e) {}
    if (!Array.isArray(current)) current = []
    if (current.includes(newSkill.trim())) {
      toast("Skill already exists", "error")
      return
    }
    const updatedKws = [...current, newSkill.trim()]
    const updatedSettings = { ...settings, extracted_keywords: JSON.stringify(updatedKws) }
    setSettings(updatedSettings)
    setNewSkill("")
  }

  const handleDeleteSkill = async (skillToDelete: string) => {
    let current = []
    try {
      if (settings.extracted_keywords) {
        current = JSON.parse(settings.extracted_keywords)
      }
    } catch (e) {}
    if (!Array.isArray(current)) current = []
    const updatedKws = current.filter((k: string) => k !== skillToDelete)
    const updatedSettings = { ...settings, extracted_keywords: JSON.stringify(updatedKws) }
    setSettings(updatedSettings)
  }

  useEffect(() => {
    api.get("/api/settings").then(res => {
      setSettings(res.data)
      setLoading(false)
    })
    refreshResumes()
    refreshUsers()
  }, [])

  // GET /api/users is admin-only (403 for everyone else) — a non-admin just never sees
  // this section, same pattern App.tsx's Layout already uses for its own settings fetch.
  const refreshUsers = () => {
    api.get("/api/users")
      .then(res => { setUsers(res.data); setIsAdmin(true) })
      .catch(() => setIsAdmin(false))
  }

  const approveUser = async (id: number) => {
    await api.post(`/api/users/${id}/approve`)
    refreshUsers()
  }

  const rejectUser = async (id: number) => {
    await api.post(`/api/users/${id}/reject`)
    refreshUsers()
  }

  const refreshResumes = () => {
    api.get("/api/resumes").then(res => setResumes(res.data.resumes || []))
  }

  const [cleaningTrash, setCleaningTrash] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState(false)

  const handleCleanTrash = async () => {
    setCleaningTrash(true)
    try {
      const res = await api.delete("/api/jobs/trash/empty")
      toast(`Deleted ${res.data.deleted} items from trash`, "success")
    } catch {
      toast("Error emptying trash", "error")
    }
    setCleaningTrash(false)
    setConfirmTrash(false)
  }

  const handleDeleteResume = async (name: string) => {
    try {
      const res = await api.delete(`/api/resumes/${encodeURIComponent(name)}`)
      setResumes(res.data.resumes || [])
      toast(`Deleted ${name}`, "success")
    } catch {
      toast("Failed to delete resume", "error")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put("/api/settings", settings)
      toast("Settings saved successfully!", "success")
    } catch (e) {
      toast("Error saving settings", "error")
    }
    setSaving(false)
  }

  const handleResumeUpload = async () => {
    if (!resumeFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", resumeFile)
    if (resumeName.trim()) formData.append("name", resumeName.trim())
    try {
      await api.post("/api/upload-resume", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      toast("Resume uploaded! AI cover letters & tailored resumes are now enabled.", "success")
      setResumeFile(null)
      setResumeName("")
      refreshResumes()
    } catch (e) {
      toast("Error uploading resume. Use a .pdf or .tex file.", "error")
    }
    setUploading(false)
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  )

  const visibleTabs = isAdmin ? [...TABS, { id: "members" as const, label: "Members" }] : TABS
  const showSaveButton = activeTab !== "health" && activeTab !== "members"

  return (
    <div className="max-w-4xl mx-auto pb-16">

      {/* Sticky header: title + tabs + save */}
      <div className="sticky top-0 z-50 bg-background pt-6 pb-2">
        <div className="bg-card rounded-lg border border-border shadow-sm">
          <div className="p-6 pb-0">
            <div className="flex justify-between items-center pb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Application Settings</h2>
                <p className="text-xs text-muted-foreground">Configure your scraper, AI models, and preferences.</p>
              </div>
              {showSaveButton && (
                <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:opacity-90">
                  <Check className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
              {visibleTabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    activeTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 space-y-6">
        {activeTab === "jobsearch" && (
          <>
            <ScrapeConfig settings={settings} onChange={setSettings} />

            <div className="bg-card rounded-lg border border-border p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Minimum Match Score (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.min_match_score ?? 50}
                  onChange={e => setSettings({...settings, min_match_score: parseInt(e.target.value) || 0})}
                  className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Jobs with a match score below this threshold will be automatically marked as Ignored and won't clutter your New Matches.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Cron Schedule</label>
                <input
                  type="text"
                  value={settings.cron_schedule || ""}
                  onChange={e => setSettings({...settings, cron_schedule: e.target.value})}
                  className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  placeholder="0 */4 * * *"
                />
              </div>
            </div>
          </>
        )}

        {activeTab === "resume" && (
          <div className="space-y-6">
            <div className="bg-card rounded-lg border border-border p-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">Resume Configuration</h3>
                <p className="text-sm text-muted-foreground">Upload one or more resumes (.pdf or .tex). You can pick which one to use when generating a tailored resume or cover letter for a job.</p>
              </div>

              {resumes.length > 0 && (
                <div className="space-y-2">
                  {resumes.map(name => (
                    <div key={name} className="flex items-center justify-between bg-secondary border border-border rounded-md px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-foreground truncate">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate">{name}</span>
                      </span>
                      <button
                        onClick={() => handleDeleteResume(name)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0"
                        title="Delete resume"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <input
                  type="file"
                  accept=".pdf,.tex"
                  onChange={e => setResumeFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={resumeName}
                    onChange={e => setResumeName(e.target.value)}
                    placeholder="Optional custom name (e.g. backend-resume)"
                    className="flex-1 bg-secondary border border-border rounded-md px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button
                    onClick={handleResumeUpload}
                    disabled={!resumeFile || uploading}
                    className="bg-primary text-primary-foreground hover:opacity-90 shrink-0"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Leave the name blank to keep the original filename. The extension is added automatically.</p>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-6 space-y-4">
              <div>
                <h4 className="text-base font-semibold text-foreground mb-1">Baseline Match Skills</h4>
                <p className="text-sm text-muted-foreground">Skills are automatically extracted when you upload a resume. The AI uses these baseline skills to evaluate job descriptions. You can manually adjust them below if needed.</p>
              </div>

              {(() => {
                try {
                  const kws = settings?.extracted_keywords ? JSON.parse(settings.extracted_keywords) : []
                  if (Array.isArray(kws) && kws.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-2 mb-1">
                        {kws.map((k: string) => (
                          <span key={k} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
                            {k}
                            <button
                              onClick={() => handleDeleteSkill(k)}
                              className="hover:text-destructive hover:bg-destructive/10 rounded-sm p-0.5 transition-colors"
                              title="Remove skill"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )
                  }
                } catch (e) {}
                return <div className="text-xs text-muted-foreground italic mb-2">No baseline skills saved yet. Upload a resume or add some manually below.</div>
              })()}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  placeholder="Add skill (e.g. Docker, APIM)"
                  className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSkill() }}
                />
                <Button
                  onClick={handleAddSkill}
                  disabled={!newSkill.trim()}
                  className="bg-secondary text-foreground hover:bg-accent border border-border h-8 text-xs shrink-0"
                >
                  Add Skill
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-6 space-y-4">
              <div>
                <h4 className="text-base font-semibold text-foreground mb-1">AI Generation Mode</h4>
                <p className="text-sm text-muted-foreground">Configure the models used for scoring and formatting.</p>
              </div>
              <div>
                <div className="relative">
                  <select
                    value={localStorage.getItem("generation_mode") || "gemini"}
                    onChange={e => {
                      localStorage.setItem("generation_mode", e.target.value)
                      setSettings({...settings, ai_mode: e.target.value})
                    }}
                    className="w-full bg-secondary border border-border rounded-md px-4 py-2.5 pr-10 text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai" disabled>OpenAI (Coming soon)</option>
                    <option value="anthropic" disabled>Anthropic Claude (Coming soon)</option>
                    <option value="grok" disabled>xAI Grok (Coming soon)</option>
                    <option value="ollama">Local Ollama (Private)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-muted-foreground">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
              </div>

              {(localStorage.getItem("generation_mode") || "gemini") === "gemini" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Gemini API Key</label>
                    <div className="flex gap-3">
                      <input
                        type="password"
                        value={settings.gemini_api_key || ""}
                        onChange={e => setSettings({...settings, gemini_api_key: e.target.value})}
                        className="flex-1 bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                        placeholder="AIza..."
                      />
                      <input
                        type="text"
                        value={settings.api_key_tag || ""}
                        onChange={e => setSettings({...settings, api_key_tag: e.target.value})}
                        className="w-1/3 bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                        placeholder="Label (e.g. Work)"
                      />
                    </div>
                  </div>
                  <ModelPriorityPicker
                    label="Model Priority List (fallbacks in order)"
                    value={settings.gemini_model || "gemini-3.1-flash-lite, gemini-3.5-flash, gemini-2.5-flash"}
                    onChange={v => setSettings({...settings, gemini_model: v})}
                    suggestions={[
                      { value: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite", badge: "500 RPD · High Capacity" },
                      { value: "gemini-3.5-flash",      label: "gemini-3.5-flash",      badge: "20 RPD · Premium" },
                      { value: "gemini-3-flash",        label: "gemini-3-flash",        badge: "20 RPD" },
                      { value: "gemini-2.5-flash",      label: "gemini-2.5-flash",      badge: "20 RPD" },
                      { value: "gemma-4-31b",           label: "gemma-4-31b",           badge: "1500 RPD · Text Only" },
                    ]}
                  />
                  <TosWarning level="warn" text="Google Free Tier API may use your prompts and outputs for model training. Switch to a paid key or use Local Ollama for full privacy." />
                </>
              )}

              {["openai", "anthropic", "grok"].includes(localStorage.getItem("generation_mode") || "gemini") && (
                <div className="p-4 bg-status-applied/10 border border-status-applied/20 rounded-md text-sm text-status-applied">
                  This provider isn't wired up on the backend yet — generation requests will fail with an error.
                  Switch to Google Gemini or Local Ollama above.
                </div>
              )}

              {(localStorage.getItem("generation_mode") || "gemini") === "ollama" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Ollama Server URL</label>
                    <input
                      type="text"
                      value={settings.ollama_url || "http://localhost:11434"}
                      onChange={e => setSettings({...settings, ollama_url: e.target.value})}
                      className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      placeholder="http://localhost:11434"
                    />
                  </div>
                  <ModelPriorityPicker
                    label="Model Priority List (fallbacks in order)"
                    value={settings.ollama_model || "llama3.1, llama3.2"}
                    onChange={v => setSettings({...settings, ollama_model: v})}
                    suggestions={[
                      { value: "llama3.1", label: "llama3.1", badge: "recommended" },
                      { value: "llama3.2", label: "llama3.2", badge: "latest" },
                      { value: "llama3.1:8b", label: "llama3.1:8b", badge: "lighter" },
                      { value: "deepseek-coder-v2", label: "deepseek-coder-v2", badge: "coding" },
                      { value: "mistral", label: "mistral", badge: "fast" },
                      { value: "qwen2.5", label: "qwen2.5", badge: "multilingual" },
                    ]}
                  />
                  <TosWarning level="private" text="100% local. Your data never leaves your machine. Pull models with: ollama pull llama3.1" />
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Custom AI Tailoring Guidelines</label>
                <textarea
                  value={settings.custom_guidelines || ""}
                  onChange={e => setSettings({...settings, custom_guidelines: e.target.value})}
                  className="w-full h-24 bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm resize-none custom-scrollbar"
                  placeholder="e.g. Keep resume job titles exactly as they are. Sound humble, focus on system design and scaling bullet points, avoid corporate jargon."
                />
                <p className="text-xs text-muted-foreground mt-1">These custom directives are safely appended to all resume and cover letter generation prompts.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground mb-2">Notifications</h3>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Telegram Chat ID</label>
              <input
                type="text"
                value={settings.telegram_chat_id || ""}
                onChange={e => setSettings({...settings, telegram_chat_id: e.target.value})}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. 123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Telegram Bot Token (Stored Encrypted)</label>
              <input
                type="password"
                value={settings.telegram_bot_token || ""}
                onChange={e => setSettings({...settings, telegram_bot_token: e.target.value})}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. 1234:ABCDEF..."
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="telegram_toggle"
                checked={settings.telegram_alerts_enabled !== false}
                onChange={e => setSettings({...settings, telegram_alerts_enabled: e.target.checked})}
                className="w-4 h-4 rounded bg-secondary border-border text-primary focus:ring-ring"
              />
              <label htmlFor="telegram_toggle" className="text-sm font-medium text-foreground">Enable Telegram Push Alerts</label>
            </div>

            <div className="pt-4 border-t border-border">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Healthcheck Ping URL</label>
              <input
                type="text"
                value={settings.healthcheck_ping_url || ""}
                onChange={e => setSettings({...settings, healthcheck_ping_url: e.target.value})}
                className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. https://hc-ping.com/your-uuid"
              />
              <p className="text-xs text-muted-foreground mt-1">Pinged after every scheduled (cron) scrape run so a healthchecks.io-compatible service can alert you if the schedule ever stops firing entirely.</p>
            </div>
          </div>
        )}

        {activeTab === "data" && (
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground mb-2">Data & Sync</h3>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="crowdsource_toggle"
                checked={settings.crowdsourcing_enabled !== false}
                disabled={!settings.career_agent_account_email}
                onChange={e => setSettings({...settings, crowdsourcing_enabled: e.target.checked})}
                className="w-4 h-4 rounded bg-secondary border-border text-primary focus:ring-ring disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              />
              <label htmlFor="crowdsource_toggle" className={`text-sm font-medium ${settings.career_agent_account_email ? 'text-foreground' : 'text-muted-foreground'}`}>
                Enable Crowdsourcing API Sync
              </label>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {settings.career_agent_account_email
                ? "Sync unpushed jobs and pull new jobs from the community pool every 10 minutes."
                : "Permanently disabled for local users. Connect a Google/GitHub account to enable."}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="debug_toggle"
                checked={settings.debug_logging_enabled === true}
                onChange={e => setSettings({...settings, debug_logging_enabled: e.target.checked})}
                className="w-4 h-4 rounded bg-secondary border-border text-primary focus:ring-ring"
              />
              <label htmlFor="debug_toggle" className="text-sm font-medium text-foreground">Enable Debug Logging</label>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Enables verbose output for the scraper and AI agent. Logs automatically rotate and delete at 10MB to save disk space.</p>

            <div className="pt-4 border-t border-border">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Trash Retention (Days)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={settings.trash_retention_days ?? 30}
                  onChange={e => setSettings({...settings, trash_retention_days: e.target.value})}
                  className="flex-1 bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  placeholder="30"
                  min="0"
                />
                {!confirmTrash ? (
                  <Button onClick={() => setConfirmTrash(true)} disabled={cleaningTrash} className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/25 shrink-0">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {cleaningTrash ? "Cleaning..." : "Clean Trash Now"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button onClick={() => setConfirmTrash(false)} className="bg-secondary text-foreground hover:bg-accent">Cancel</Button>
                    <Button onClick={handleCleanTrash} disabled={cleaningTrash} className="bg-destructive text-destructive-foreground hover:opacity-90">
                      {cleaningTrash ? "Cleaning..." : "Confirm Delete"}
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Jobs in the Trash state older than this will be permanently deleted during cron scrapes. Set to 0 to disable auto-cleanup.</p>
            </div>
          </div>
        )}

        {activeTab === "health" && <SystemHealth />}

        {activeTab === "members" && isAdmin && (
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground mb-1">Members</h3>
            <p className="text-xs text-muted-foreground -mt-2">People who've signed in with Google/GitHub. New sign-ins need your approval before they can access the app.</p>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sign-in requests yet.</p>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-secondary border border-border rounded-md px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">{u.email || u.username}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary border border-border font-medium text-muted-foreground">
                          {u.role.charAt(0) + u.role.slice(1).toLowerCase()}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${u.status === 'ACTIVE' ? 'bg-status-interviewing/10 text-status-interviewing border-status-interviewing/20' : u.status === 'PENDING' ? 'bg-status-new/10 text-status-new border-status-new/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
                          {u.status.charAt(0) + u.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.status === "PENDING" && (
                        <>
                          <Button onClick={() => rejectUser(u.id)} className="bg-secondary text-foreground hover:bg-accent h-8 px-3 text-xs border border-border">Reject</Button>
                          <Button onClick={() => approveUser(u.id)} className="bg-primary text-primary-foreground hover:opacity-90 h-8 px-3 text-xs">Approve</Button>
                        </>
                      )}
                      {u.status === "ACTIVE" && (
                        <button onClick={() => rejectUser(u.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" title="Revoke Access">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
