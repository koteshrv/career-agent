import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrapeConfig } from "./ScrapeConfig"
import { useToast } from "./Toast"
import { FileText, Trash2, X, Check, ShieldCheck, ShieldAlert, Lock } from "lucide-react"

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
  const refreshResumes = () => {
    api.get("/api/resumes").then(res => setResumes(res.data.resumes || []))
  }

  useEffect(() => {
    api.get("/api/settings").then(res => {
      setSettings(res.data)
      setLoading(false)
    })
    refreshResumes()
    }, [])

  
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
      await api.post("/api/resumes/upload", formData, {
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

  const visibleTabs = TABS
  const showSaveButton = activeTab !== "members"

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

            {/* Autonomous Agent Section */}
            <div className="bg-card rounded-lg border border-border p-6 space-y-4 mb-6 mt-6">
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">Autonomous Agent (Beta)</h3>
                <p className="text-sm text-muted-foreground">Test the self-driving Playwright agent that uses Gemini to navigate search boxes and click buttons automatically.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Target URL</label>
                  <input
                    type="text"
                    id="agent_url"
                    placeholder="https://careers.google.com"
                    className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Target Keyword</label>
                  <input
                    type="text"
                    id="agent_keyword"
                    placeholder="Software Engineer"
                    className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground">This runs a headless browser and LLM loop. May take 20-30 seconds.</p>
                <Button 
                  onClick={async () => {
                    const url = (document.getElementById("agent_url") as HTMLInputElement).value
                    const keyword = (document.getElementById("agent_keyword") as HTMLInputElement).value
                    if (!url || !keyword) {
                      toast("Please enter both URL and keyword", "error")
                      return
                    }
                    toast("Agent is navigating...", "success")
                    try {
                      const res = await api.post("/api/jobs/agent-test", { url, keyword })
                      toast(`Agent finished! Found ${res.data.found_jobs?.length || 0} jobs.`, "success")
                      console.log("Agent results:", res.data.found_jobs)
                    } catch (e: any) {
                      toast(e.response?.data?.detail || "Agent failed.", "error")
                    }
                  }}
                  className="bg-primary hover:bg-primary/80 text-foreground h-8 text-xs px-4"
                >
                  Test Autonomous Agent
                </Button>
              </div>
            </div>

            {/* Global Search Section */}
            <div className="bg-card rounded-lg border border-border p-6 space-y-4 mb-6">
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">Reverse ATS Global Search (Beta)</h3>
                <p className="text-sm text-muted-foreground">Automatically discover fresh postings across thousands of companies on Greenhouse and Lever.</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="global_search_enabled"
                  checked={settings.global_search_enabled || false}
                  onChange={e => setSettings({...settings, global_search_enabled: e.target.checked})}
                  className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary focus:ring-2"
                />
                <label htmlFor="global_search_enabled" className="text-sm font-medium text-foreground">
                  Enable Global Search
                </label>
              </div>

              {settings.global_search_enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Target Titles (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Software Engineer, Frontend"
                      value={settings.global_search_titles || ""}
                      onChange={e => setSettings({...settings, global_search_titles: e.target.value})}
                      className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Target Locations (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Remote, New York"
                      value={settings.global_search_locations || ""}
                      onChange={e => setSettings({...settings, global_search_locations: e.target.value})}
                      className="w-full bg-secondary border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
              {settings.global_search_enabled && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Run a quick test scan on 10 random ATS boards to see what it finds.</p>
                  <Button 
                    onClick={async () => {
                      toast("Running test global scan...", "success")
                      try {
                        const res = await api.post("/api/jobs/global-search-test")
                        toast(`Scan complete! Found ${res.data.found_jobs} jobs.`, "success")
                        console.log("Global search sample:", res.data.sample)
                      } catch (e: any) {
                        toast(e.response?.data?.detail || "Global search failed.", "error")
                      }
                    }}
                    className="bg-primary hover:bg-primary/80 text-foreground h-8 text-xs px-4"
                  >
                    Test Global Search
                  </Button>
                </div>
              )}
            </div>

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
                <h4 className="text-base font-semibold text-foreground mb-1">Extracted Profile Identity</h4>
                <p className="text-sm text-muted-foreground">This narrative and target role configuration was automatically extracted by the AI when you uploaded your resume. It is injected into all future evaluations and material generation.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Target Roles</label>
                {(() => {
                  try {
                    const roles = settings?.target_roles ? JSON.parse(settings.target_roles) : [];
                    if (Array.isArray(roles) && roles.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-2">
                          {roles.map((r: string) => (
                            <span key={r} className="px-2.5 py-1 rounded-md bg-status-interviewing/10 text-status-interviewing border border-status-interviewing/20 text-xs font-medium">
                              {r}
                            </span>
                          ))}
                        </div>
                      )
                    }
                  } catch (e) {}
                  return <div className="text-xs text-muted-foreground italic">No target roles extracted.</div>
                })()}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Base Salary Expectations</label>
                <div className="text-sm text-foreground bg-secondary px-3 py-2 rounded-md border border-border">
                  {settings?.base_salary_expectations || <span className="text-muted-foreground italic">No salary expectation extracted.</span>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Profile Narrative</label>
                <textarea
                  readOnly
                  value={settings?.profile_narrative || ""}
                  className="w-full bg-secondary border border-border rounded-md px-4 py-3 text-sm text-foreground focus:outline-none min-h-[120px] resize-y leading-relaxed"
                  placeholder="Your extracted identity narrative will appear here..."
                />
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
                    <optgroup label="Cloud Providers">
                      <option value="gemini">Google Gemini</option>
                      <option value="openai" disabled>OpenAI (Coming soon)</option>
                      <option value="anthropic" disabled>Anthropic Claude (Coming soon)</option>
                      <option value="grok" disabled>xAI Grok (Coming soon)</option>
                    </optgroup>
                    <optgroup label="Local CLIs (Zero Configuration)">
                      <option value="cli_agy">Antigravity CLI (agy)</option>
                      <option value="cli_claude">Claude Code (claude)</option>
                      <option value="cli_gemini">Gemini CLI (gemini)</option>
                      <option value="cli_copilot">GitHub Copilot CLI (copilot)</option>
                      <option value="cli_opencode">OpenCode (opencode)</option>
                      <option value="cli_grok">Grok Build CLI (grok)</option>
                      <option value="cli_qwen">Qwen CLI (qwen)</option>
                    </optgroup>
                    <optgroup label="Local Servers">
                      <option value="ollama">Local Ollama (Private)</option>
                    </optgroup>
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
                : "Disabled."}
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


      </div>
    </div>
  )
}
