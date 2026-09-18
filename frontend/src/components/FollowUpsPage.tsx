import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { formatISTDate } from "@/lib/datetime"
import { useToast } from "./Toast"
import { CalendarClock, CheckCircle2, Clock, AlarmClock } from "lucide-react"

type FollowUpJob = {
  id: number
  company: string
  title: string
  status: string
  applied_at: string | null
  follow_up_count: number
  due_date: string | null
  reason: string
}

type Groups = { overdue: FollowUpJob[]; due: FollowUpJob[]; upcoming: FollowUpJob[] }

const TABS: { key: keyof Groups; label: string; icon: typeof AlarmClock }[] = [
  { key: "overdue", label: "Overdue", icon: AlarmClock },
  { key: "due", label: "Due", icon: Clock },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock },
]

export function FollowUpsPage() {
  const [groups, setGroups] = useState<Groups | null>(null)
  const [tab, setTab] = useState<keyof Groups>("overdue")
  const [snoozingId, setSnoozingId] = useState<number | null>(null)
  const { toast } = useToast()

  // First tab with something in it, so a user with only "Upcoming" nudges
  // doesn't land on an empty "Overdue" tab. Decided once, at load time — not
  // a reactive effect on `groups`, so a later refetch (after marking a job
  // followed up) never yanks the user back off whatever tab they're on.
  const pickDefaultTab = (g: Groups): keyof Groups =>
    g.overdue.length ? "overdue" : g.due.length ? "due" : "upcoming"

  const fetchFollowUps = (selectDefaultTab: boolean) => {
    api.get("/api/followups").then(res => {
      setGroups(res.data)
      if (selectDefaultTab) setTab(pickDefaultTab(res.data))
    }).catch(() => setGroups({ overdue: [], due: [], upcoming: [] }))
  }

  useEffect(() => { fetchFollowUps(true) }, [])

  const markFollowedUp = async (job: FollowUpJob) => {
    try {
      await api.post(`/api/followups/${job.id}/log`)
      toast(`Marked ${job.company} as followed up`, "success")
      fetchFollowUps(false)
    } catch {
      toast("Failed to log follow-up", "error")
    }
  }

  const snooze = async (job: FollowUpJob, days: number) => {
    setSnoozingId(job.id)
    try {
      const until = new Date(Date.now() + days * 86400000).toISOString()
      await api.post(`/api/followups/${job.id}/snooze`, { until })
      toast(`Snoozed ${job.company} for ${days}d`, "success")
      fetchFollowUps(false)
    } catch {
      toast("Failed to snooze", "error")
    } finally {
      setSnoozingId(null)
    }
  }

  if (groups === null) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  const total = groups.overdue.length + groups.due.length + groups.upcoming.length
  const rows = groups[tab]

  if (total === 0) {
    return (
      <div className="max-w-lg">
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1.5">Nothing to follow up on</h2>
          <p className="text-sm text-muted-foreground">
            Applications you're waiting to hear back from, or that had an interview, show up here once a follow-up is due.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Follow-ups</h1>
        <p className="text-sm text-muted-foreground mt-1">Applications waiting on a nudge.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = groups[key].length
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nothing in this tab.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(job => (
            <div key={job.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{job.company} — {job.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {job.reason}
                  {job.due_date && <> · due {formatISTDate(job.due_date)}</>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => snooze(job, 3)}
                  disabled={snoozingId === job.id}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground border border-border hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Snooze 3d
                </button>
                <button
                  onClick={() => markFollowedUp(job)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Mark followed up
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
