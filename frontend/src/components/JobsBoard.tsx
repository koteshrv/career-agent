import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { formatISTDate } from "@/lib/datetime"
import { api } from "@/lib/api"
import { BriefcaseBusiness, Calendar, ExternalLink, ChevronDown, ChevronUp, Search, Trash2, Check, X, Globe, DownloadCloud, Database, RefreshCw, Filter, Inbox } from "lucide-react"
import { JobModal } from "./JobModal"
import { useToast } from "./Toast"
import { ConfirmDialog } from "./ConfirmDialog"

let globalJobsCache: Job[] | null = null;

export type Job = {
  id: number
  company: string
  title: string
  url: string
  location: string | null
  status: string
  notes: string | null
  description: string | null
  cover_letter?: string
  tailored_resume?: string
  cold_email?: string
  match_score?: number
  match_reason?: string
  score_tech_stack?: string
  score_experience?: string
  score_domain?: string
  score_culture?: string
  external_id?: string
  yoe?: string
  created_at: string
  applied_at?: string
}

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  NEW: { label: "New", dot: "bg-status-new", badge: "bg-status-new/15 text-status-new border-status-new/30" },
  APPLIED: { label: "Applied", dot: "bg-status-applied", badge: "bg-status-applied/15 text-status-applied border-status-applied/30" },
  INTERVIEWING: { label: "Interviewing", dot: "bg-status-interviewing", badge: "bg-status-interviewing/15 text-status-interviewing border-status-interviewing/30" },
  REJECTED: { label: "Rejected", dot: "bg-status-rejected", badge: "bg-status-rejected/15 text-status-rejected border-status-rejected/30" },
  IGNORED: { label: "Ignored", dot: "bg-status-ignored", badge: "bg-muted text-muted-foreground border-border" },
  TRASH: { label: "Trash", dot: "bg-status-rejected", badge: "bg-muted text-muted-foreground border-border" },
}

const CLOSED_STATUSES = ["REJECTED", "IGNORED", "TRASH"]

const TABS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: "ALL", label: "All", statuses: null },
  { id: "NEW", label: "New", statuses: ["NEW"] },
  { id: "APPLIED", label: "Applied", statuses: ["APPLIED"] },
  { id: "INTERVIEWING", label: "Interviewing", statuses: ["INTERVIEWING"] },
  { id: "CLOSED", label: "Closed", statuses: CLOSED_STATUSES },
]

const TAB_EMPTY: Record<string, string> = {
  ALL: "No jobs yet. Sync Jobs to pull in new roles from your configured sources.",
  NEW: "No new matches. Sync Jobs to check for new roles.",
  APPLIED: "Nothing applied to yet — select a match and move it here once you apply.",
  INTERVIEWING: "No interviews in progress.",
  CLOSED: "Nothing closed out yet.",
}

const CLOSED_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "REJECTED", label: "Rejected" },
  { id: "IGNORED", label: "Ignored" },
  { id: "TRASH", label: "Trash" },
]

export function JobsBoard() {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<Job[]>(globalJobsCache || [])
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get("tab") || "ALL"
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  // Update URL when tab changes, without triggering a full remount if possible
  useEffect(() => {
    if (searchParams.get("tab") !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true })
    }
  }, [activeTab, setSearchParams])
  const [closedFilter, setClosedFilter] = useState<string>("ALL")
  const [groupByCompany, setGroupByCompany] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"date" | "priority">("priority")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    fetchJobs()

    const handleFocus = () => {
      fetchJobs()
    }

    window.addEventListener("focus", handleFocus)
    return () => {
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const moveToTrash = async (jobId: number) => {
    try {
      await api.put(`/api/jobs/${jobId}`, { status: "TRASH" })
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "TRASH" } : j))
      toast("Moved to Trash", "success")
    } catch (e) {
      toast("Failed to move to Trash", "error")
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const bulkSetStatus = async (status: string) => {
    const ids = selectedIds
    try {
      await api.post("/api/jobs/bulk-status", { ids, status })
      setJobs(prev => prev.map(j => ids.includes(j.id) ? { ...j, status } : j))
      setSelectedIds([])
      toast(`Moved ${ids.length} job${ids.length > 1 ? "s" : ""} to ${status}`, "success")
    } catch (e) {
      toast("Bulk update failed", "error")
    }
  }

  const bulkDelete = async () => {
    const ids = selectedIds
    setConfirmBulkDelete(false)
    try {
      await api.post("/api/jobs/bulk-delete", { ids })
      setJobs(prev => prev.filter(j => !ids.includes(j.id)))
      setSelectedIds([])
      toast(`Deleted ${ids.length} job${ids.length > 1 ? "s" : ""}`, "success")
    } catch (e) {
      toast("Bulk delete failed", "error")
    }
  }

  const handleClearAll = async () => {
    setConfirmClearOpen(false)
    setClearing(true)
    try {
      const { data } = await api.delete("/api/jobs")
      setJobs([])
      toast(`Cleared ${data.deleted} jobs`, "success")
    } catch (e) {
      toast("Failed to clear jobs", "error")
    }
    setClearing(false)
  }

  const handleDeleteJob = async (jobId: number, silent: boolean = false) => {
    try {
      await api.delete(`/api/jobs/${jobId}`)
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setSelectedJob(null)
      if (!silent) toast("Job deleted", "success")
    } catch (e) {
      if (!silent) toast("Failed to delete job", "error")
    }
  }

  const fetchJobs = async () => {
    try {
      const { data } = await api.get("/api/jobs?limit=500")
      const mapped = data.map((j: Job) => ({...j, status: j.status || 'NEW'}))
      globalJobsCache = mapped
      setJobs(mapped)
    } catch (e) {
      console.error(e)
    }
  }

  // TEMP — manual triggers for the 10-minute crowdsourcing push/pull background schedule,
  // for testing without waiting on the interval. Remove once the sync is confirmed working.
  const fetchStats = async () => {
    try {
      const res = await api.get("/api/crowdsource/me")
      if (res.data.success) setStats(res.data)
    } catch (e) {}
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const pushRes = await api.post("/api/crowdsource/push")
      const pullRes = await api.post("/api/crowdsource/pull")

      let msg = "Sync Complete. "
      if (pushRes.data.success) msg += `Pushed ${pushRes.data.jobs_sent ?? 0}. `
      if (pullRes.data.success) msg += `Pulled ${pullRes.data.jobs_received ?? 0}.`

      toast(msg, "success")
      fetchJobs()
      fetchStats()
    } catch (e) {
      toast("Sync failed.", "error")
    }
    setIsSyncing(false)
  }

  const toggleCompany = (company: string) => {
    setExpandedCompanies(prev => ({ ...prev, [company]: !prev[company] }))
  }

  const renderJobRow = (job: Job, showStatusBadge: boolean) => {
    const loc = job.location && job.location.trim() !== "" ? job.location : null
    const isSelected = selectedIds.includes(job.id)
    const meta = STATUS_META[job.status] || STATUS_META.NEW
    return (
      <div
        key={job.id}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a') && !(e.target as HTMLElement).closest('[data-select]')) {
            setSelectedJob(job)
          }
        }}
        className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
      >
        <button
          data-select
          onClick={(e) => { e.stopPropagation(); toggleSelect(job.id) }}
          className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-border hover:border-ring'}`}
          title="Select"
        >
          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
        </button>

        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${job.external_id ? 'bg-primary/10' : 'bg-accent'}`} title={job.external_id ? "Crowdsourced Job" : "Locally Scraped Job"}>
          {job.external_id ? (
            <Globe className="w-3.5 h-3.5 text-primary" />
          ) : (
            <BriefcaseBusiness className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate" title={job.title}>{job.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {job.company}{loc ? ` · ${loc}` : ""}
          </p>
        </div>

        {job.match_score !== undefined && job.match_score !== null && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 w-16" title={job.match_reason || ''}>
            <span className={`w-2 h-2 rounded-full ${job.match_score >= 70 ? 'bg-status-interviewing' : job.match_score >= 50 ? 'bg-status-applied' : 'bg-status-rejected'}`} />
            <span className="text-xs font-semibold text-muted-foreground">{job.match_score}%</span>
          </div>
        )}

        {showStatusBadge && (
          <div className="hidden md:flex shrink-0 w-24 justify-end">
            <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.badge}`}>
              {meta.label}
            </Badge>
          </div>
        )}

        <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium shrink-0 w-20">
          <Calendar className="w-3.5 h-3.5" />
          {formatISTDate(job.created_at)}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a href={job.url} target="_blank" rel="noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors" title="View Job">
            <ExternalLink className="w-4 h-4" />
          </a>
          {job.status !== "TRASH" && (
            <button
              onClick={(e) => { e.stopPropagation(); moveToTrash(job.id) }}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              title="Move to Trash"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  const tab = TABS.find(t => t.id === activeTab) || TABS[0]

  const tabCounts: Record<string, number> = {
    ALL: jobs.length,
    NEW: jobs.filter(j => j.status === "NEW").length,
    APPLIED: jobs.filter(j => j.status === "APPLIED").length,
    INTERVIEWING: jobs.filter(j => j.status === "INTERVIEWING").length,
    CLOSED: jobs.filter(j => CLOSED_STATUSES.includes(j.status)).length,
  }

  let tabJobs = jobs.filter(j => {
    const q = searchQuery.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
  })
  if (tab.statuses) tabJobs = tabJobs.filter(j => tab.statuses!.includes(j.status))
  if (activeTab === "CLOSED" && closedFilter !== "ALL") tabJobs = tabJobs.filter(j => j.status === closedFilter)

  tabJobs = [...tabJobs].sort((a, b) => {
    if (sortBy === "priority") {
      const scoreA = a.match_score ?? -1
      const scoreB = b.match_score ?? -1
      return sortOrder === "desc" ? scoreB - scoreA : scoreA - scoreB
    } else {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB
    }
  })

  const showStatusBadge = activeTab === "ALL" || activeTab === "CLOSED"

  return (
    <div className="flex flex-col h-full relative">

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="relative max-w-md w-full sm:flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search roles, companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">

          <button
            onClick={() => setConfirmClearOpen(true)}
            disabled={clearing || jobs.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors disabled:opacity-40"
            title="Clear All Jobs"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="relative z-50" ref={filtersRef}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold border transition-colors ${showFilters ? 'bg-accent text-foreground border-border' : 'bg-secondary text-muted-foreground border-border hover:bg-accent'}`}
            >
              <Filter className="w-3.5 h-3.5" /> View Options
            </button>

            {showFilters && (
              <div className="absolute top-full right-0 mt-2 w-[300px] bg-popover border border-border rounded-md shadow-lg p-5 z-50 flex flex-col gap-5">

                <div className="flex items-center justify-between gap-4 text-sm text-foreground">
                  <span className="font-medium whitespace-nowrap w-16">Group By</span>
                  <select
                    value={groupByCompany.toString()}
                    onChange={(e) => setGroupByCompany(e.target.value === "true")}
                    className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none w-full"
                  >
                    <option value="false">None</option>
                    <option value="true">Company</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4 text-sm text-foreground">
                  <span className="font-medium whitespace-nowrap w-16">Sort By</span>
                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [s, o] = e.target.value.split("-")
                      setSortBy(s as any)
                      setSortOrder(o as any)
                    }}
                    className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none w-full"
                  >
                    <option value="priority-desc">Priority (High &rarr; Low)</option>
                    <option value="priority-asc">Priority (Low &rarr; High)</option>
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {stats && (
            <div className="flex items-center bg-secondary border border-border rounded-md px-4 py-2 text-xs font-semibold gap-3">
              <span className="flex items-center gap-1.5 text-primary" title="Community Credits">
                <Database className="w-3.5 h-3.5" /> <span className="text-foreground">{stats.current_credits} Credits</span>
              </span>
              {stats.current_credits === 0 && (
                <>
                  <span className="w-px h-3 bg-border" />
                  <span className="flex items-center gap-1.5 text-muted-foreground" title="Free Daily Quota">
                    <DownloadCloud className="w-3.5 h-3.5" /> <span className="text-foreground">{stats.daily_quota_remaining} Free Pulls</span>
                  </span>
                </>
              )}
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncing ? 'Syncing...' : 'Sync Jobs'}
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-4 overflow-x-auto custom-scrollbar">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${activeTab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${activeTab === t.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "CLOSED" && (
        <div className="flex items-center gap-2 mb-4">
          {CLOSED_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setClosedFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${closedFilter === f.id ? 'bg-accent text-foreground border-border' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className={`custom-scrollbar bg-card rounded-lg border border-border ${tabJobs.length === 0 ? 'shrink-0' : 'flex-1 overflow-y-auto'}`}>
        {tabJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-6">
            <Inbox className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">{TAB_EMPTY[activeTab]}</p>
            {jobs.length === 0 && (
              <button onClick={handleSync} className="mt-1 text-xs font-semibold text-primary hover:underline">
                Sync Jobs now
              </button>
            )}
          </div>
        ) : groupByCompany ? (
          Array.from(new Set(tabJobs.map(j => j.company))).map((company) => {
            const companyJobs = tabJobs.filter(j => j.company === company)
            const isExpanded = expandedCompanies[company] ?? true
            return (
              <div key={company} className="border-b border-border last:border-0">
                <button
                  onClick={() => toggleCompany(company)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <span className="font-semibold text-sm text-foreground truncate">{company}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-status-new/15 text-status-new hover:bg-status-new/25">{companyJobs.length}</Badge>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {isExpanded && companyJobs.map(job => renderJobRow(job, showStatusBadge))}
              </div>
            )
          })
        ) : (
          tabJobs.map(job => renderJobRow(job, showStatusBadge))
        )}
      </div>

      {/* Modal Overlay */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={(updatedJob) => {
            setJobs(jobs.map(j => j.id === updatedJob.id ? updatedJob : j))
            setSelectedJob(updatedJob)
          }}
          onDelete={handleDeleteJob}
        />
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        danger
        title="Clear all jobs?"
        message={`This permanently deletes all ${jobs.length} jobs from the database. This cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        danger
        title={`Delete ${selectedIds.length} selected job${selectedIds.length > 1 ? "s" : ""}?`}
        message="The selected jobs will be permanently removed."
        confirmLabel="Delete"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 bg-popover border border-border rounded-full shadow-lg px-3 py-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <span className="text-xs font-semibold text-foreground px-2">{selectedIds.length} selected</span>
          <div className="w-px h-5 bg-border" />
          {[
            { label: "New", status: "NEW" },
            { label: "Applied", status: "APPLIED" },
            { label: "Interviewing", status: "INTERVIEWING" },
            { label: "Rejected", status: "REJECTED" },
            { label: "Ignored", status: "IGNORED" },
            { label: "Trash", status: "TRASH" },
          ].map(a => (
            <button
              key={a.status}
              onClick={() => bulkSetStatus(a.status)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
