import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "@/lib/api"
import { formatISTDate } from "@/lib/datetime"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Briefcase, CalendarClock, RefreshCw, Sparkles, Zap } from "lucide-react"
import type { Job } from "./JobsBoard"

export function HomePage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const fetchJobs = () => {
    api.get("/api/jobs?limit=500").then(res => setJobs(res.data)).catch(() => setJobs([]))
  }

  useEffect(() => { fetchJobs() }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await api.post("/api/crowdsource/push")
      await api.post("/api/crowdsource/pull")
      fetchJobs()
    } catch (e) {}
    setIsSyncing(false)
  }

  if (jobs === null) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  if (jobs.length === 0) {
    return (
      <div className="max-w-lg">
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1.5">Let's find your first matches</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Sync to pull in jobs from your configured sources, or run the scraper to start scoring roles against your resume.
          </p>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncing ? "Syncing..." : "Sync Jobs"}
          </button>
        </div>
      </div>
    )
  }

  const newJobs = jobs.filter(j => j.status === "NEW")
  const applied = jobs.filter(j => j.status === "APPLIED")
  const interviewing = jobs.filter(j => j.status === "INTERVIEWING")
  const topMatches = [...newJobs].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1)).slice(0, 5)
  const recent = [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Status strip — real counts only, no invented metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Link to="/app/applications?tab=NEW" className="bg-card border border-border rounded-lg p-4 hover:border-status-new/50 transition-all hover:shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <span className="w-2 h-2 rounded-full bg-status-new" /> New matches
          </div>
          <p className="text-3xl font-bold text-foreground">{newJobs.length}</p>
        </Link>
        <Link to="/app/applications?tab=APPLIED" className="bg-card border border-border rounded-lg p-4 hover:border-status-applied/50 transition-all hover:shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <span className="w-2 h-2 rounded-full bg-status-applied" /> Applied
          </div>
          <p className="text-3xl font-bold text-foreground">{applied.length}</p>
        </Link>
        <Link to="/app/applications?tab=INTERVIEWING" className="bg-card border border-border rounded-lg p-4 hover:border-status-interviewing/50 transition-all hover:shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <span className="w-2 h-2 rounded-full bg-status-interviewing" /> Interviewing
          </div>
          <p className="text-3xl font-bold text-foreground">{interviewing.length}</p>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* What needs attention */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Top matches to review</h3>
            <Link to="/app/applications?tab=NEW" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {topMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground px-5 py-6">No unreviewed matches right now.</p>
          ) : (
            <div>
              {topMatches.map(job => (
                <a key={job.id} href={job.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                  </div>
                  {job.match_score != null && (
                    <Badge variant="outline" className="shrink-0 bg-status-interviewing/15 text-status-interviewing border-status-interviewing/30">
                      {job.match_score}%
                    </Badge>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Active interviews */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Active interviews</h3>
            <Link to="/app/applications?tab=INTERVIEWING" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {interviewing.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
              <CalendarClock className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No interviews in progress</p>
            </div>
          ) : (
            <div>
              {interviewing.slice(0, 5).map(job => (
                <div key={job.id} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                  <CalendarClock className="w-4 h-4 text-status-interviewing shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Recently added</h3>
          </div>
          <div>
            {recent.map(job => (
              <div key={job.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{formatISTDate(job.created_at)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground mb-1">Quick actions</h3>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center justify-between px-4 py-3 rounded-md bg-background hover:bg-secondary border border-border shadow-sm transition-colors text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> {isSyncing ? "Syncing..." : "Sync Jobs"}
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <Link to="/app/quick-generate" className="flex items-center justify-between px-4 py-3 rounded-md bg-background hover:bg-secondary border border-border shadow-sm transition-colors">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Zap className="w-4 h-4" /> Quick Generate materials
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/app/applications?tab=NEW" className="flex items-center justify-between px-4 py-3 rounded-md bg-background hover:bg-secondary border border-border shadow-sm transition-colors">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Briefcase className="w-4 h-4" /> Review new matches
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  )
}
