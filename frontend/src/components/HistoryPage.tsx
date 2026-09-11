import { useState, useEffect, Fragment } from "react"
import { api } from "@/lib/api"
import { formatISTDateTime } from "@/lib/datetime"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, XCircle, ChevronDown, RefreshCw, Clock, Hand, Loader2, Play, Terminal, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "./Toast"
import { LiveLogsModal } from "./LiveLogsModal"
import { ConfirmDialog } from "./ConfirmDialog"

export function HistoryPage() {
  const { toast } = useToast()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [selectedLogRaw, setSelectedLogRaw] = useState<string | null>(null)

  const hasRunning = logs.some(l => l.status === "RUNNING")

  const fetchLogs = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await api.get("/api/history")
      setLogs(res.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    if (!silent) setRefreshing(false)
  }

  const handleRunNow = async () => {
    setRunning(true)
    try {
      await api.post("/api/run-scraper")
      toast("Scraper started in the background.", "success")
      setTimeout(() => fetchLogs(true), 500)
    } catch {
      toast("Failed to start scraper", "error")
    }
    setTimeout(() => setRunning(false), 2000)
  }

  const handleClearHistory = async () => {
    setConfirmClearOpen(false)
    try {
      await api.delete("/api/history")
      toast("History cleared successfully.", "success")
      fetchLogs(true)
    } catch {
      toast("Failed to clear history", "error")
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  useEffect(() => {
    // Only poll if there is a RUNNING job to prevent idle API spam
    if (hasRunning) {
      const interval = setInterval(() => fetchLogs(true), 4000)
      return () => clearInterval(interval)
    }
  }, [hasRunning, fetchLogs])

  if (loading) return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-6 py-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Local Scraper Run History</h3>
            <p className="text-sm text-muted-foreground">Logs from your local scrape targets (does not include Community synced jobs).</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {hasRunning && (
              <button
                onClick={() => setIsLogsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-status-interviewing/15 text-status-interviewing border border-status-interviewing/30 hover:bg-status-interviewing/25 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5" />
                Live Logs
              </button>
            )}
            <button
              onClick={() => fetchLogs()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-secondary text-muted-foreground border border-border hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={() => setConfirmClearOpen(true)}
              disabled={refreshing || logs.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
            <Button
              onClick={handleRunNow}
              disabled={running || hasRunning}
              className="bg-primary text-primary-foreground hover:opacity-90 shrink-0 rounded-md h-8 px-4 text-xs font-semibold"
            >
              <Play className={`w-3.5 h-3.5 mr-1.5 fill-current ${running ? "animate-pulse" : ""}`} />
              {running ? "Starting..." : "Run Now"}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/50">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">Trigger</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Jobs Found</th>
                <th className="px-6 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No logs found yet. Run the scraper from Settings or wait for the cron schedule.</td>
                </tr>
              ) : logs.map((log) => {
                const hasError = !!log.error_message
                const hasDetails = !!log.detailed_logs
                const isExpandable = hasError || hasDetails
                const isOpen = expanded === log.id

                let filteredDetails: any[] = []
                if (log.detailed_logs) {
                  try {
                    const parsed = JSON.parse(log.detailed_logs)
                    if (Array.isArray(parsed)) {
                      filteredDetails = parsed.filter(d => d.jobs_found > 0 || d.status !== 'SUCCESS')
                    }
                  } catch(e) {}
                }

                return (
                <Fragment key={log.id}>
                <tr
                  onClick={() => isExpandable && setExpanded(isOpen ? null : log.id)}
                  className={`hover:bg-accent/30 transition-colors ${isExpandable ? "cursor-pointer" : ""}`}
                >
                  <td className="px-6 py-4 text-foreground whitespace-nowrap">
                    {formatISTDateTime(log.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      log.trigger_source === "CRON"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-secondary text-muted-foreground border border-border"
                    }`}>
                      {log.trigger_source === "CRON" ? <Clock className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
                      {log.trigger_source === "CRON" ? "Cron" : "Manual"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {log.status === "SUCCESS" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-interviewing/10 text-status-interviewing border border-status-interviewing/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Success
                      </span>
                    ) : log.status === "RUNNING" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-applied/10 text-status-applied border border-status-applied/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                        <XCircle className="w-3.5 h-3.5" />
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    <span className="font-semibold text-foreground">{log.jobs_found}</span> jobs
                  </td>
                  <td className="px-6 py-4 text-muted-foreground max-w-xs">
                    <div className="flex items-center gap-4">
                      {isExpandable ? (
                        <button onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : log.id); }} className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer w-[140px]">
                          <span className="truncate">{hasError ? log.error_message : "View Breakdown"}</span>
                          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                      ) : <span className="w-[140px] text-muted-foreground/50">-</span>}
                      {typeof log.raw_logs === 'string' && log.raw_logs !== "" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLogRaw(log.raw_logs);
                          }}
                          className="flex items-center gap-1.5 text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          Logs
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-secondary/30">
                    <td colSpan={5} className="px-6 py-4">
                      {hasError && (
                        <div className="mb-4">
                          <p className="text-xs text-muted-foreground mb-2 font-semibold">Full error detail</p>
                          <pre className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-4 whitespace-pre-wrap break-words overflow-x-auto">
                            {log.error_message}
                          </pre>
                        </div>
                      )}
                      {filteredDetails.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 font-semibold">Per-Company Results</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredDetails.map((d: any, i: number) => (
                              <div key={i} className={`p-3 rounded-md border ${d.status === 'SUCCESS' ? 'bg-status-interviewing/5 border-status-interviewing/15' : d.status === 'SKIPPED' ? 'bg-status-applied/5 border-status-applied/15' : 'bg-destructive/5 border-destructive/15'}`}>
                                <div className="flex justify-between items-start mb-1">
                                  <span className="font-semibold text-foreground text-sm">{d.company}</span>
                                  {d.status === 'SUCCESS' ? (
                                    <span className="text-xs font-medium text-status-interviewing bg-status-interviewing/10 px-2 py-0.5 rounded-full">{d.jobs_found} jobs</span>
                                  ) : d.status === 'SKIPPED' ? (
                                    <span className="text-xs font-medium text-status-applied bg-status-applied/10 px-2 py-0.5 rounded-full">Skipped</span>
                                  ) : (
                                    <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">Failed</span>
                                  )}
                                </div>
                                {d.message && (
                                  <p className="text-xs text-muted-foreground mt-2 truncate" title={d.message}>{d.message}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <LiveLogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} />
      {selectedLogRaw !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-card border border-border rounded-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3 text-foreground font-semibold">
                <Terminal className="w-5 h-5 text-primary" />
                Execution Logs
              </div>
              <button onClick={() => setSelectedLogRaw(null)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-secondary/30">
              <textarea
                className="w-full h-full bg-transparent text-[11px] font-mono text-foreground resize-none outline-none"
                readOnly
                value={(() => {
                  if (typeof selectedLogRaw !== 'string' || selectedLogRaw === '') return "No logs available.";
                  return selectedLogRaw;
                })()}
              />
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmClearOpen}
        danger
        title="Clear Run History?"
        message="Are you sure you want to clear all scraper run history? This will permanently delete all attached logs."
        confirmLabel="Delete All"
        onConfirm={handleClearHistory}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  )
}
