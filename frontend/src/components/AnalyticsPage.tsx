import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts"
import { Cpu, TrendingUp, Filter, AlertTriangle, HeartPulse } from "lucide-react"

type TargetHealth = {
  company: string
  last_status: string
  last_message: string
  runs_seen: number
  consecutive_failures: number
  success_rate: number
  last_success_at: string | null
  zero_streak: number
  historical_avg_jobs_found: number
  possibly_silent_failure: boolean
}

// Chart colors mirror the app's design tokens (frontend/src/index.css) — Recharts needs
// literal color values, so these are resolved hex equivalents of the HSL custom properties.
const CHART_COLORS = {
  new: "#3b82f6",          // --status-new
  applied: "#ef9a39",      // --status-applied / --primary
  interviewing: "#22c55e", // --status-interviewing
  rejected: "#c53a2f",     // --status-rejected
  grid: "rgba(255,255,255,0.06)",
  tick: "#8a8578",
}

/**
 * Returns the Gemini free-tier daily request limit for a given model name.
 * Returns -1 for unknown/alias models where limit can't be determined.
 *
 * Sources: https://ai.google.dev/pricing (June 2025)
 *  - gemini-1.5-flash, 2.0-flash       → 1500 req/day
 *  - gemini-2.5-flash, 3.x-flash       → 500 req/day
 *  - gemini-flash-latest (alias)        → 500 req/day (resolves to latest flash ≥ 2.5)
 *  - gemini-*-pro, gemini-2.5-pro etc  → 50 req/day
 */
function getModelDailyLimit(model: string): number {
  const m = (model || "").toLowerCase()
  // 2.5 Pro / 3.1 Pro → 100 RPD (free tier, June 2026)
  if (m.includes("2.5-pro") || m.includes("3.1-pro")) return 100
  // Other Pro → 50 RPD (conservative fallback)
  if (m.includes("pro")) return 50
  // gemini-flash-latest alias → resolves to 3.5-flash → 1500 RPD
  if (m === "gemini-flash-latest" || m.includes("3.5") || m.includes("3-flash") || m.includes("3.1-flash")) return 1500
  // 3 Flash (Preview) → 1500 RPD
  if (m.includes("3.") && m.includes("flash")) return 1500
  // Gemini 2.5 Flash → 250 RPD (per user's confirmed table)
  if (m.includes("2.5-flash") || m.includes("2.5flash")) return 250
  // Gemini 2.0 Flash → RETIRED June 2026, 0 RPD
  if (m.includes("2.0")) return 0
  // Gemini 1.5 → 404 on v1beta, effectively unusable
  if (m.includes("1.5")) return 0
  // Unknown new model → assume standard free tier
  return 1500
}


export function AnalyticsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [targetHealth, setTargetHealth] = useState<TargetHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'app' | 'ai' | 'health'>('app')
  const [isFreeTier, setIsFreeTier] = useState(() => {
    return localStorage.getItem("gemini_pricing_tier") !== "paygo"
  })

  const toggleTier = () => {
    const newTier = !isFreeTier
    setIsFreeTier(newTier)
    localStorage.setItem("gemini_pricing_tier", newTier ? "free" : "paygo")
  }

  useEffect(() => {
    Promise.all([
      api.get("/api/jobs?limit=5000"),
      api.get("/api/settings"),
      api.get("/api/companies/health")
    ]).then(([jobsRes, settingsRes, healthRes]) => {
      setJobs(jobsRes.data)
      setSettings(settingsRes.data)
      setTargetHealth(healthRes.data?.targets || [])
      setLoading(false)
    }).catch(e => {
      console.error(e)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-[400px] rounded-lg" />
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    </div>
  )

  // 1. Calculate status metrics
  const statusCounts = jobs.reduce((acc: any, job: any) => {
    acc[job.status] = (acc[job.status] || 0) + 1
    return acc
  }, {})

  const totalJobs = jobs.length
  const appliedJobs = statusCounts["APPLIED"] || 0
  const interviewingJobs = statusCounts["INTERVIEWING"] || 0

  const pieData = [
    { name: "New Matches", value: statusCounts["NEW"] || 0, color: CHART_COLORS.new },
    { name: "Applied", value: appliedJobs, color: CHART_COLORS.applied },
    { name: "Interviewing", value: interviewingJobs, color: CHART_COLORS.interviewing },
    { name: "Rejected/Ignored", value: (statusCounts["REJECTED"] || 0) + (statusCounts["IGNORED"] || 0), color: CHART_COLORS.rejected },
  ].filter(d => d.value > 0)

  // 2. Top companies
  const companyCounts = jobs.reduce((acc: any, job: any) => {
    acc[job.company] = (acc[job.company] || 0) + 1
    return acc
  }, {})

  const barData = Object.entries(companyCounts)
    .map(([name, count]) => ({ name, jobs: count }))
    .sort((a, b) => (b.jobs as number) - (a.jobs as number))
    .slice(0, 10)

  // 3. Gemini Token Cost Estimator
  const promptTokens = settings?.total_prompt_tokens || 0
  const candidateTokens = settings?.total_candidate_tokens || 0

  let modelStats: any[] = []
  let calculatedCost = 0

  if (settings?.model_telemetry) {
    try {
      const parsed = JSON.parse(settings.model_telemetry)
      modelStats = Object.entries(parsed).map(([model, stats]: [string, any]) => {
        const isModelPro = model.toLowerCase().includes("pro")
        const rateIn = isModelPro ? 1.25 : 0.075
        const rateOut = isModelPro ? 5.00 : 0.30
        const cost = ((stats.prompt_tokens / 1000000) * rateIn) + ((stats.candidate_tokens / 1000000) * rateOut)
        calculatedCost += cost

        let dailyLimit = getModelDailyLimit(model);

        const todayRequests = stats.today_requests || 0
        const requestsLeft = Math.max(0, dailyLimit - todayRequests)

        return {
          model,
          requests: stats.requests || 0,
          promptTokens: stats.prompt_tokens || 0,
          candidateTokens: stats.candidate_tokens || 0,
          cost,
          todayRequests,
          dailyLimit,
          requestsLeft
        }
      })

      modelStats.sort((a, b) => b.requests - a.requests)

    } catch (e) {}
  }

  // Fallback to current model if telemetry is completely empty
  if (modelStats.length === 0 && settings?.gemini_model) {
    let dailyLimit = getModelDailyLimit(settings.gemini_model);

    modelStats.push({
      model: settings.gemini_model,
      requests: 0,
      promptTokens: 0,
      candidateTokens: 0,
      cost: 0,
      todayRequests: 0,
      dailyLimit: dailyLimit,
      requestsLeft: dailyLimit
    })
  }

  const totalRequests = modelStats.reduce((acc, curr) => acc + curr.requests, 0)

  // Fallback if telemetry empty
  if (calculatedCost === 0 && (promptTokens > 0 || candidateTokens > 0)) {
    const isPro = settings?.gemini_model?.toLowerCase()?.includes("pro")
    const inputRate = isPro ? 1.25 : 0.075
    const outputRate = isPro ? 5.00 : 0.30
    calculatedCost = ((promptTokens / 1000000) * inputRate) + ((candidateTokens / 1000000) * outputRate)
  }
  const estCost = calculatedCost

  // 4. Weekly Sourcing Velocity
  const getLast7Days = () => {
    const dates = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().split("T")[0])
    }
    return dates
  }

  const last7Days = getLast7Days()
  const jobsByDay = last7Days.map(dateStr => {
    const matchingJobs = jobs.filter(job => {
      if (!job.created_at) return false
      return job.created_at.startsWith(dateStr)
    })
    const dayLabel = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })
    return { name: dayLabel, Count: matchingJobs.length }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border w-fit">
        <button
          onClick={() => setActiveTab('app')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'app' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          App Analytics
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'ai' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          AI Telemetry
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === 'health' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Target Health
          {targetHealth.filter(t => t.consecutive_failures >= 3 || t.possibly_silent_failure).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/25">
              {targetHealth.filter(t => t.consecutive_failures >= 3 || t.possibly_silent_failure).length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'app' && (
        <div className="space-y-8">
          {/* Top Level Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg border border-border p-6 flex flex-col items-center justify-center">
              <p className="text-muted-foreground text-sm font-medium mb-1">Total Jobs Scraped</p>
              <p className="text-3xl font-semibold text-foreground">{totalJobs}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-6 flex flex-col items-center justify-center">
              <p className="text-muted-foreground text-sm font-medium mb-1">Application Rate</p>
              <p className="text-3xl font-semibold text-status-applied">
                {totalJobs > 0 ? Math.round((appliedJobs / totalJobs) * 100) : 0}%
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-6 flex flex-col items-center justify-center">
              <p className="text-muted-foreground text-sm font-medium mb-1">Interview Rate</p>
              <p className="text-3xl font-semibold text-status-interviewing">
                {appliedJobs > 0 ? Math.round((interviewingJobs / appliedJobs) * 100) : 0}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Application Funnel Chart */}
            <div className="bg-card rounded-lg border border-border p-6 space-y-6">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Application Funnel
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
                    <span>1. Scraped / Saved</span>
                    <span className="text-foreground">{totalJobs} Roles</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-status-new" style={{ width: '100%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
                    <span>2. Applied ({totalJobs > 0 ? Math.round((appliedJobs / totalJobs) * 100) : 0}% conversion)</span>
                    <span className="text-status-applied font-semibold">{appliedJobs} Roles</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-status-applied transition-all duration-700" style={{ width: `${totalJobs > 0 ? (appliedJobs / totalJobs) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
                    <span>3. Interviewing ({appliedJobs > 0 ? Math.round((interviewingJobs / appliedJobs) * 100) : 0}% conversion)</span>
                    <span className="text-status-interviewing font-semibold">{interviewingJobs} Roles</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-status-interviewing transition-all duration-700" style={{ width: `${totalJobs > 0 ? (interviewingJobs / totalJobs) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown & Sourced list */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-base font-semibold text-foreground mb-6">Pipeline Breakdown</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={4} dataKey="value">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#151310', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f2ede4' }}
                      itemStyle={{ color: '#f2ede4' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></div>
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Velocity Chart */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-6">
                <TrendingUp className="w-4 h-4 text-status-interviewing" />
                Weekly Sourcing Velocity
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={jobsByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="name" stroke={CHART_COLORS.tick} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke={CHART_COLORS.tick} fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#151310', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f2ede4' }}
                    />
                    <Line type="monotone" dataKey="Count" stroke={CHART_COLORS.interviewing} strokeWidth={3} dot={{ r: 4, fill: CHART_COLORS.interviewing }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Sourced Companies */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-base font-semibold text-foreground mb-6">Top Sourced Companies</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="name" stroke={CHART_COLORS.tick} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke={CHART_COLORS.tick} fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#151310', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f2ede4' }}
                    />
                    <Bar dataKey="jobs" fill={CHART_COLORS.new} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="max-w-2xl">
          {/* AI API Usage Telemetry */}
          <div className="bg-card rounded-lg border border-border p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Cpu className="w-4 h-4 text-primary" />
                  AI API Telemetry
                </div>
                {settings?.is_free_tier && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                    Tag: {settings.api_key_tag}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-xs text-muted-foreground">Real-time tracking of tokens & API limits.</p>
                <button
                  onClick={toggleTier}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${isFreeTier ? 'bg-status-interviewing/10 border-status-interviewing/25 text-status-interviewing hover:bg-status-interviewing/20' : 'bg-secondary border-border text-foreground hover:bg-accent'}`}
                >
                  {isFreeTier ? "Free Tier" : "Pay-as-you-go"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-secondary border border-border rounded-md p-4">
                  <span className="block text-[10px] font-semibold text-muted-foreground mb-1">Requests</span>
                  <span className="text-lg font-semibold text-foreground font-mono">{totalRequests}</span>
                </div>
                <div className="bg-secondary border border-border rounded-md p-4">
                  <span className="block text-[10px] font-semibold text-muted-foreground mb-1">Input Tokens</span>
                  <span className="text-lg font-semibold text-foreground font-mono">{promptTokens.toLocaleString()}</span>
                </div>
                <div className="bg-secondary border border-border rounded-md p-4">
                  <span className="block text-[10px] font-semibold text-muted-foreground mb-1">Output Tokens</span>
                  <span className="text-lg font-semibold text-foreground font-mono">{candidateTokens.toLocaleString()}</span>
                </div>
              </div>

              <div className="text-xs font-semibold text-muted-foreground mb-3">Model Breakdown</div>
              <div className="space-y-3">
                {modelStats.length === 0 ? (
                  <div className="text-muted-foreground text-sm">No telemetry data available yet.</div>
                ) : (
                  modelStats.map(stats => (
                    <div key={stats.model} className="p-4 bg-primary/5 border border-primary/20 rounded-md flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-primary font-semibold text-sm">{stats.model}</span>
                        <span className="font-semibold text-foreground whitespace-nowrap">${stats.cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">
                          {stats.requests.toLocaleString()} reqs &bull; {stats.promptTokens.toLocaleString()} in / {stats.candidateTokens.toLocaleString()} out
                        </span>
                        <span
                          title={stats.dailyLimit === -1 ? "Alias model — limit depends on resolved version" : undefined}
                          className={`font-semibold text-right whitespace-nowrap ${
                            stats.dailyLimit !== -1 && stats.requestsLeft < 5 ? "text-destructive" : "text-primary"
                          }`}
                        >
                          {stats.todayRequests.toLocaleString()} / {stats.dailyLimit === -1 ? "? (alias)" : stats.dailyLimit.toLocaleString()} reqs today
                        </span>
                      </div>
                      {/* Per-model quota bar */}
                      {stats.dailyLimit > 0 && (
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${stats.requestsLeft < 5 ? "bg-destructive" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, (stats.todayRequests / stats.dailyLimit) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* ── Combined Fallback Capacity ── */}
              {modelStats.length > 1 && (() => {
                const known = modelStats.filter(s => s.dailyLimit > 0)
                const totalCap = known.reduce((a, s) => a + s.dailyLimit, 0)
                const totalUsed = known.reduce((a, s) => a + s.todayRequests, 0)
                const totalLeft = Math.max(0, totalCap - totalUsed)
                const pct = totalCap > 0 ? Math.min(100, (totalUsed / totalCap) * 100) : 0
                if (totalCap === 0) return null
                return (
                  <div className="mt-3 p-3 bg-status-interviewing/5 border border-status-interviewing/20 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-status-interviewing">Combined Fallback Capacity</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {totalUsed.toLocaleString()} used / <span className="text-foreground font-semibold">{totalLeft.toLocaleString()} left</span>
                      </span>
                    </div>
                    {/* Segmented bar — each model gets its own shade of the primary accent */}
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden flex gap-px">
                      {known.map((s, i) => {
                        const segPct = (s.dailyLimit / totalCap) * 100
                        const usedPct = s.dailyLimit > 0 ? Math.min(100, (s.todayRequests / s.dailyLimit) * 100) : 0
                        const opacity = 1 - (i % 5) * 0.15
                        return (
                          <div key={s.model} className="relative overflow-hidden rounded-sm" style={{ width: `${segPct}%` }}
                            title={`${s.model}: ${s.todayRequests}/${s.dailyLimit} req/day`}>
                            <div className="w-full h-full bg-secondary" />
                            <div className="absolute inset-y-0 left-0 bg-primary"
                              style={{ width: `${usedPct}%`, opacity }} />
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-muted-foreground">Each segment = one model's quota</span>
                      <span className="text-[10px] text-status-interviewing font-semibold">{totalCap.toLocaleString()} req/day total</span>
                    </div>
                    {pct < 100 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Fallback order: {known.map(s => s.model.replace("gemini-","")).join(" → ")}
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-md p-4 flex items-center justify-between mt-4">
              <div>
                <span className="block text-[10px] font-bold text-primary">Estimated Project Cost</span>
                <span className="text-xs text-muted-foreground">{isFreeTier ? "Using Free Tier Limits" : "Based on model-specific API rates"}</span>
              </div>
              <span className="text-2xl font-semibold text-foreground font-mono">{isFreeTier ? "$0.00" : `$${estCost.toFixed(5)}`}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'health' && (
        <div className="max-w-2xl">
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center gap-2 text-base font-semibold text-foreground mb-1">
              <HeartPulse className="w-4 h-4 text-destructive" />
              Target Health
            </div>
            <p className="text-xs text-muted-foreground mb-6">
              Success rate per company across the last {targetHealth.reduce((a, t) => Math.max(a, t.runs_seen), 0) || 20} scrape runs.
              A company failing several runs in a row usually means its site markup changed —
              but a broken selector often doesn't throw at all, it just quietly returns 0 jobs.
              The <span className="text-primary font-semibold">highlighted</span> flag below catches that case too.
            </p>

            {targetHealth.length === 0 ? (
              <div className="text-muted-foreground text-sm">No scrape history yet — run the scraper at least once.</div>
            ) : (
              <div className="space-y-3">
                {targetHealth.map(t => {
                  const isBroken = t.consecutive_failures >= 3
                  const isWarning = t.consecutive_failures > 0 && t.consecutive_failures < 3
                  const isSilentFailure = t.possibly_silent_failure
                  return (
                    <div
                      key={t.company}
                      className={`p-4 rounded-md border flex flex-col gap-1.5 ${
                        isBroken ? "bg-destructive/5 border-destructive/20" :
                        isSilentFailure ? "bg-primary/5 border-primary/20" :
                        isWarning ? "bg-status-applied/5 border-status-applied/20" :
                        "bg-secondary/40 border-border"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                          {isBroken && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                          {!isBroken && isSilentFailure && <AlertTriangle className="w-3.5 h-3.5 text-primary" />}
                          {t.company}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                          t.last_status === "SUCCESS"
                            ? "bg-status-interviewing/10 text-status-interviewing border-status-interviewing/30"
                            : "bg-destructive/10 text-destructive border-destructive/30"
                        }`}>
                          {t.last_status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>
                          {Math.round(t.success_rate * 100)}% success &bull; {t.runs_seen} run{t.runs_seen === 1 ? "" : "s"} seen
                        </span>
                        {t.consecutive_failures > 0 && (
                          <span className={`font-semibold ${isBroken ? "text-destructive" : "text-status-applied"}`}>
                            {t.consecutive_failures} failed in a row
                          </span>
                        )}
                      </div>
                      {isSilentFailure && (
                        <p className="text-[11px] text-primary font-semibold">
                          {t.zero_streak} runs in a row found 0 jobs — normally averages {t.historical_avg_jobs_found}. Likely a broken selector, not a real dry spell.
                        </p>
                      )}
                      {t.last_status === "FAILED" && t.last_message && (
                        <p className="text-[11px] text-muted-foreground font-mono truncate" title={t.last_message}>
                          {t.last_message}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
