import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom"
import { JobsBoard } from "./components/JobsBoard"
import { HomePage } from "./components/HomePage"
import { SettingsPage } from "./components/SettingsPage"
import { HistoryPage } from "./components/HistoryPage"
import { AnalyticsPage } from "./components/AnalyticsPage"
import { Login } from "./components/Login"
import { LandingPage } from "./components/LandingPage"
import { getToken, clearToken, IS_DEMO, api } from "@/lib/api"
import { QuickGeneratePage } from "./components/QuickGeneratePage"
import { KnowledgeBasePage } from "./components/KnowledgeBasePage"
import { NotificationTray } from "./components/NotificationTray"
import { Home, Briefcase, Zap, Settings, History, LogOut, LineChart, Database, User, Menu, Sun, Moon } from "lucide-react"
import { useState, useEffect } from "react"
import type { ReactNode } from "react"

const NAV = [
  { to: "/app/home", label: "Home", title: "Home", subtitle: "What's happening, and what to do next.", icon: Home },
  { to: "/app/applications", label: "Pipeline", title: "Pipeline", subtitle: "Every job you're tracking, in one list.", icon: Briefcase },
  { to: "/app/quick-generate", label: "Quick Generate", title: "Quick Generate", subtitle: "Instantly generate a tailored resume or cover letter without tracking the job in your pipeline.", icon: Zap },
  { to: "/app/analytics", label: "Analytics", title: "Analytics", subtitle: "Insights and metrics on your job search progress.", icon: LineChart },
  { to: "/app/knowledge", label: "Knowledge Base", title: "Career Knowledge Base", subtitle: "Manage your career history for RAG generation.", icon: Database },
  { to: "/app/history", label: "Run History", title: "Run History", subtitle: "View the status and logs of your background scraping tasks.", icon: History },
  { to: "/app/settings", label: "Settings", title: "Settings", subtitle: "Manage your API keys, resume templates, integrations, and preferences.", icon: Settings },
]

function RequireAuth({ children }: { children: ReactNode }) {
  // In demo mode (GitHub Pages), skip auth entirely so visitors see the app.
  if (IS_DEMO) return <>{children}</>
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  if (!IS_DEMO && getToken()) return <Navigate to="/app/home" replace />
  return <>{children}</>
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `px-3 py-2.5 rounded-md flex items-center gap-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
            }`
          }
        >
          <Icon className="w-4 h-4" />
          {label}
        </NavLink>
      ))}
    </>
  )
}

function Layout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('career_agent_theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const location = useLocation()
  const navigate = useNavigate()
  const current = NAV.find(n => location.pathname.startsWith(n.to))
  const title = current?.title || "Career Agent"
  const subtitle = current?.subtitle || ""

  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    api.get("/api/settings").then(res => {
      setAccountEmail(res.data.career_agent_account_email)
    }).catch(() => {})
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
    <div className="min-h-screen text-foreground selection:bg-primary/30 font-sans flex flex-col overflow-hidden">

      {/* Demo mode banner */}
      {IS_DEMO && (
        <div className="w-full bg-primary text-primary-foreground text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-3 z-50">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Live Demo — running with sample data
          </span>
          <span className="opacity-50">·</span>
          <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity">
            ⭐ Star on GitHub
          </a>
          <span className="opacity-50">·</span>
          <span className="opacity-80">Self-host with your own backend for full functionality</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col z-40">
          <Link to="/app/home" className="h-16 flex items-center px-6 border-b border-border hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-2"><img src="/favicon.svg" alt="Career Agent" className="w-6 h-6" /><span className="text-lg font-bold tracking-tight text-foreground">Career Agent</span></div>
          </Link>

          <nav className="flex-1 px-4 py-6 space-y-1">
            <NavItems />
          </nav>

          {!IS_DEMO && (
            <div className="px-4 pb-6">
              <button
                onClick={handleLogoutClick}
                className="w-full px-3 py-2.5 rounded-md flex items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent group transition-colors text-left"
                title="Logout"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="truncate">
                    {accountEmail ? accountEmail.split("@")[0] : "Local User"}
                  </span>
                </div>
                <LogOut className="w-4 h-4 text-muted-foreground group-hover:text-destructive shrink-0 transition-colors" />
              </button>
            </div>
          )}
        </aside>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-[90] md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col">
              <div className="h-16 flex items-center px-6 border-b border-border">
                <div className="flex items-center gap-2"><img src="/favicon.svg" alt="Career Agent" className="w-6 h-6" /><span className="text-lg font-bold tracking-tight text-foreground">Career Agent</span></div>
              </div>
              <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                <NavItems onNavigate={() => setMobileNavOpen(false)} />
              </nav>
              {!IS_DEMO && (
                <div className="px-4 pb-6">
                  <button
                    onClick={() => { setMobileNavOpen(false); handleLogoutClick() }}
                    className="w-full px-3 py-2.5 rounded-md flex items-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen relative min-w-0">
          {/* Top Header */}
          <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 z-[60] sticky top-0 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">{title}</h2>
                {subtitle && <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <NotificationTray />
            </div>
          </header>

          {/* Routed Content */}
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-popover border border-border rounded-lg p-6 shadow-lg max-w-sm w-full">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 border border-destructive/20">
                <LogOut className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Log out</h3>
                <p className="text-sm text-muted-foreground">Are you sure you want to log out?</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-md hover:bg-accent font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeLogout}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:opacity-90 font-medium transition-opacity"
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
      <Route path="/" element={IS_DEMO ? <LandingPage /> : <Navigate to="/app/home" replace />} />
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/app/home" replace />} />
        <Route path="home" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><HomePage /></div>} />
        <Route path="applications" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><JobsBoard /></div>} />
        <Route path="analytics" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><AnalyticsPage /></div>} />
        <Route path="history" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><HistoryPage /></div>} />
        <Route path="quick-generate" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><QuickGeneratePage /></div>} />
        <Route path="integrations" element={<Navigate to="/app/settings?tab=health" replace />} />
        <Route path="knowledge" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><KnowledgeBasePage /></div>} />
        <Route path="settings" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><SettingsPage /></div>} />
        <Route path="*" element={<Navigate to="/app/home" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={IS_DEMO ? "/" : "/app/home"} replace />} />
    </Routes>
  )
}

export default App
