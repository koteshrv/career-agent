import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts"
import { Cpu, TrendingUp, Filter } from "lucide-react"

export function AnalyticsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      api.get("/api/settings")
    ]).then(([jobsRes, settingsRes]) => {
      setJobs(jobsRes.data)
      setSettings(settingsRes.data)
      setLoading(false)
    }).catch(e => {
      console.error(e)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-[400px] rounded-2xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
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
    { name: "New Matches", value: statusCounts["NEW"] || 0, color: "#3b82f6" },
    { name: "Applied", value: appliedJobs, color: "#a855f7" },
    { name: "Interviewing", value: interviewingJobs, color: "#eab308" },
    { name: "Rejected/Ignored", value: (statusCounts["REJECTED"] || 0) + (statusCounts["IGNORED"] || 0), color: "#ef4444" },
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
        
        const dailyLimit = isModelPro ? 50 : 1500
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
    } catch (e) {}
  }

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
    <div className="max-w-5xl mx-auto p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Total Jobs Scraped</p>
          <p className="text-4xl font-bold text-white">{totalJobs}</p>
        </div>
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Application Rate</p>
          <p className="text-4xl font-bold text-purple-400">
            {totalJobs > 0 ? Math.round((appliedJobs / totalJobs) * 100) : 0}%
          </p>
        </div>
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Interview Rate</p>
          <p className="text-4xl font-bold text-yellow-400">
            {appliedJobs > 0 ? Math.round((interviewingJobs / appliedJobs) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Funnel & Gemini Usage Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Application Funnel Chart */}
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-400" />
            Application Funnel
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                <span>1. Scraped / Saved</span>
                <span className="text-white">{totalJobs} Roles</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                <span>2. Applied ({totalJobs > 0 ? Math.round((appliedJobs / totalJobs) * 100) : 0}% conversion)</span>
                <span className="text-purple-400 font-bold">{appliedJobs} Roles</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all duration-1000" style={{ width: `${totalJobs > 0 ? (appliedJobs / totalJobs) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                <span>3. Interviewing ({appliedJobs > 0 ? Math.round((interviewingJobs / appliedJobs) * 100) : 0}% conversion)</span>
                <span className="text-yellow-400 font-bold">{interviewingJobs} Roles</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 transition-all duration-1000" style={{ width: `${totalJobs > 0 ? (interviewingJobs / totalJobs) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Gemini API Usage Telemetry */}
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Gemini API Telemetry
            </h3>
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-zinc-400">Real-time tracking of tokens & API limits.</p>
              <button 
                onClick={toggleTier} 
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${isFreeTier ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
              >
                {isFreeTier ? "Free Tier" : "Pay-as-you-go"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                <span className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Input Tokens</span>
                <span className="text-lg font-bold text-white font-mono">{promptTokens.toLocaleString()}</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                <span className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Output Tokens</span>
                <span className="text-lg font-bold text-white font-mono">{candidateTokens.toLocaleString()}</span>
              </div>
            </div>

            {modelStats.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                <span className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Model Breakdown</span>
                <div className="space-y-2 max-h-[145px] overflow-y-auto custom-scrollbar pr-1">
                  {modelStats.map((item, idx) => (
                    <div key={idx} className="flex flex-col bg-black/20 border border-white/5 rounded-lg p-2.5 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="block font-semibold text-zinc-300 font-mono">{item.model}</span>
                        <span className="font-mono font-bold text-zinc-400">{isFreeTier ? "$0.00" : `$${item.cost.toFixed(5)}`}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-zinc-500">
                        <span>{item.requests} total reqs • {item.promptTokens.toLocaleString()} in / {item.candidateTokens.toLocaleString()} out</span>
                        {isFreeTier && (
                          <span className={item.requestsLeft < 5 ? "text-red-400 font-bold" : "text-blue-400 font-medium"}>
                            {item.todayRequests} / {item.dailyLimit} reqs today
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between mt-4">
            <div>
              <span className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider">Estimated Project Cost</span>
              <span className="text-xs text-zinc-500">{isFreeTier ? "Using Free Tier Limits" : "Based on model-specific API rates"}</span>
            </div>
            <span className="text-2xl font-bold text-white font-mono">{isFreeTier ? "$0.00" : `$${estCost.toFixed(5)}`}</span>
          </div>
        </div>

      </div>

      {/* Bottom Row Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Weekly Velocity Chart */}
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Weekly Sourcing Velocity
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={jobsByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                />
                <Line type="monotone" dataKey="Count" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown & Sourced list */}
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6">Pipeline Breakdown</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={4} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></div>
                {d.name} ({d.value})
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Top Sourced Companies */}
      <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-6">Top Sourced Companies</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
              <RechartsTooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
              />
              <Bar dataKey="jobs" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
