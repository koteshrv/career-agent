import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom"
import { KanbanBoard } from "./components/KanbanBoard"
import { SettingsPage } from "./components/SettingsPage"
import { HistoryPage } from "./components/HistoryPage"
import { AnalyticsPage } from "./components/AnalyticsPage"
import { Login } from "./components/Login"
import { LandingPage } from "./components/LandingPage"
import { getToken, clearToken, IS_DEMO, api } from "@/lib/api"
import { QuickGeneratePage } from "./components/QuickGeneratePage"
import { KnowledgeBasePage } from "./components/KnowledgeBasePage"
import { SystemHealth } from "./components/SystemHealth"
import { Activity } from "lucide-react"
import { Zap, LayoutDashboard, Settings, History, LogOut, LineChart, Database, User } from "lucide-react"
import { useState, useEffect } from "react"
import type { ReactNode } from "react"

const NAV = [
  { to: "/app/applications", label: "Job Applications", title: "Application Dashboard", subtitle: "Track and manage your automated job matches.", icon: LayoutDashboard },
  { to: "/app/quick-generate", label: "Quick Generate", title: "Quick Generate", subtitle: "Instantly generate a tailored resume or cover letter without tracking the job in your Kanban board.", icon: Zap },
  { to: "/app/analytics", label: "Analytics", title: "Analytics", subtitle: "Insights and metrics on your job search progress.", icon: LineChart },
  { to: "/app/knowledge", label: "Knowledge Base", title: "Career Knowledge Base", subtitle: "Manage your career history for RAG generation.", icon: Database },
  { to: "/app/history", label: "Run History", title: "Run History", subtitle: "View the status and logs of your background scraping tasks.", icon: History },
  { to: "/app/integrations", label: "System Health", title: "Integrations & Health", subtitle: "Monitor the operational status of ATS integrations.", icon: Activity },
  { to: "/app/settings", label: "Settings", title: "Settings", subtitle: "Manage your API keys, resume templates, and preferences.", icon: Settings },
]

function RequireAuth({ children }: { children: ReactNode }) {
  // In demo mode (GitHub Pages), skip auth entirely so visitors see the app.
  if (IS_DEMO) return <>{children}</>
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = NAV.find(n => location.pathname.startsWith(n.to))
  const title = current?.title || "Dashboard"
  const subtitle = current?.subtitle || ""

  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  
  useEffect(() => {
    if (!IS_DEMO) {
      api.get("/api/settings").then(res => {
        setAccountEmail(res.data.career_agent_account_email)
      }).catch(() => {})
    }
  }, [])

  const handleLogoutClick = () => {
    setConfirmLogout(true)
  }

  const executeLogout = () => {
    setConfirmLogout(false)
    clearToken()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-blue-500/30 font-sans flex flex-col overflow-hidden">

      {/* Demo mode banner */}
      {IS_DEMO && (
        <div className="w-full bg-gradient-to-r from-blue-600/90 via-indigo-600/90 to-purple-600/90 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-3 z-50">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live Demo — running with sample data
          </span>
          <span className="text-white/50">·</span>
          <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white/80 transition-colors">
            ⭐ Star on GitHub
          </a>
          <span className="text-white/50">·</span>
          <span className="text-white/70">Self-host with your own backend for full functionality</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-white/5 bg-black/40 hidden md:flex flex-col z-40">
          <Link to="/app/applications" className="h-20 flex items-center px-6 border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer block">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                <Zap className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">CareerAgent</h1>
              </div>
            </div>
          </Link>

          <nav className="flex-1 px-4 py-8 space-y-2">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg flex items-center gap-3 font-medium cursor-pointer transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {!IS_DEMO && (
            <div className="px-4 pb-6">
              <button
                onClick={handleLogoutClick}
                className="w-full px-3 py-2.5 rounded-lg flex items-center justify-between font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent group transition-colors text-left"
                title="Logout"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="truncate">
                    {accountEmail ? accountEmail.split("@")[0] : "Local User"}
                  </span>
                </div>
                <LogOut className="w-4 h-4 text-zinc-500 group-hover:text-red-400 shrink-0 transition-colors" />
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen relative">
          {/* Top Header */}
          <header className="h-20 border-b border-white/5 bg-black/20 flex items-center justify-between px-8 z-30 sticky top-0">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
              {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
            </div>
          </header>

          {/* Routed Content */}
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#12141a] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                <LogOut className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Log out</h3>
                <p className="text-sm text-zinc-400">Are you sure you want to log out?</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeLogout}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-red-500/20"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={IS_DEMO ? <LandingPage /> : <Navigate to="/app/applications" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/app/applications" replace />} />
        <Route path="applications" element={<div className="flex-1 overflow-x-auto overflow-y-hidden p-8 custom-scrollbar"><KanbanBoard /></div>} />
        <Route path="analytics" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><AnalyticsPage /></div>} />
        <Route path="history" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><HistoryPage /></div>} />
        <Route path="quick-generate" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><QuickGeneratePage /></div>} />
        <Route path="integrations" element={<div className="flex-1 p-8 overflow-y-auto custom-scrollbar"><SystemHealth /></div>} />
        <Route path="knowledge" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><KnowledgeBasePage /></div>} />
        <Route path="settings" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsPage /></div>} />
        <Route path="*" element={<Navigate to="/app/applications" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={IS_DEMO ? "/" : "/app/applications"} replace />} />
    </Routes>
  )
}

export default App
