import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { Zap, Sparkles, FileText, ArrowRight, Code2, Search, Target, Cpu, KanbanSquare, BellRing } from "lucide-react"

export function LandingPage() {
  const navigate = useNavigate()
  const handleEnter = () => {
    navigate("/app/applications")
  }

  const features = [
    {
      icon: <Search className="w-6 h-6 text-indigo-400" />,
      title: "Automated Job Discovery",
      description: "Quietly runs Playwright scrapers in the background across job boards and company ATS portals, ensuring you never miss a newly posted role."
    },
    {
      icon: <Target className="w-6 h-6 text-red-400" />,
      title: "AI Match Scoring",
      description: "Instantly evaluates your exact qualifications against the raw Job Description, generating a definitive 0-100 match score and fit analysis."
    },
    {
      icon: <FileText className="w-6 h-6 text-blue-400" />,
      title: "1-Click Application Materials",
      description: "Programmatically generates tailored cover letters, referral emails, and natively compiles ATS-friendly LaTeX resumes into PDFs with a single click."
    },
    {
      icon: <Cpu className="w-6 h-6 text-emerald-400" />,
      title: "Bring Your Own AI (Free or Paid)",
      description: "Use any AI you prefer! Bring your own OpenAI or Anthropic keys, or use 100% Free AI with a Google API key (we safely manage rate limits for Gemma and Gemini). Or run 100% privately with local Ollama models."
    },
    {
      icon: <KanbanSquare className="w-6 h-6 text-orange-400" />,
      title: "Kanban Pipeline",
      description: "Organize your job search visually. Drag and drop jobs across a Kanban board (New, Applied, Interviewing, Rejected) to track your entire pipeline at a glance."
    },
    {
      icon: <BellRing className="w-6 h-6 text-yellow-400" />,
      title: "Telegram Alerts & Chrome Extension",
      description: "Receive instant push notifications via Telegram for high-match jobs, and use the companion extension to 1-click save roles directly from external job boards."
    }
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden selection:bg-blue-500/30 font-sans">
      
      {/* Navbar */}
      <nav className="w-full border-b border-white/5 bg-black/50 backdrop-blur-md fixed top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white animate-pulse" />
            </div>
            <span className="font-bold text-lg tracking-tight">CareerAgent</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/hariharavk/career-agent" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              GitHub
            </a>
            <button onClick={handleEnter} className="text-sm font-semibold bg-white text-black px-4 py-1.5 rounded-full hover:bg-zinc-200 transition-colors">
              Open App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Background Glows (Animated) */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/30 blur-[120px] rounded-full pointer-events-none" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/2 right-1/4 translate-x-1/4 -translate-y-1/3 w-[500px] h-[300px] bg-purple-600/30 blur-[100px] rounded-full pointer-events-none" 
        />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-24">
            {/* Left side text */}
            <div className="text-left">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold mb-6 uppercase tracking-widest"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Advanced AI Engine
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]"
              >
                Make your next big career switch.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Powered by AI.</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg text-zinc-400 mb-8 leading-relaxed max-w-xl"
              >
                CareerAgent is a sophisticated, 100% free automation platform built for ambitious IT professionals. It replaces the exhausting manual job hunt with an intelligent engine that scrapes target companies, evaluates your precise fit using your choice of AI, and programmatically compiles ATS-optimized LaTeX resumes.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center gap-4"
              >
                <button 
                  onClick={handleEnter}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all shadow-[0_0_40px_rgba(79,70,229,0.4)] hover:shadow-[0_0_60px_rgba(79,70,229,0.6)]"
                >
                  Launch Demo <ArrowRight className="w-5 h-5" />
                </button>
                <a 
                  href="https://github.com/hariharavk/career-agent" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all"
                >
                  <Code2 className="w-5 h-5" /> View on GitHub
                </a>
              </motion.div>
            </div>

            {/* Right side AI Match Card */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="hidden lg:block relative"
            >
              <div className="bg-[#0c0d12]/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative backdrop-blur-md p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Target className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Senior Backend Engineer</h3>
                      <p className="text-zinc-400 text-sm">Stripe • Remote</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200">98%</span>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-semibold">Match Score</span>
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200 leading-relaxed mt-4">
                  <span className="font-semibold text-blue-400">AI Analysis:</span> The candidate is a perfect fit for this role, demonstrating deep expertise in building high-scale distributed systems and managing complex cloud infrastructure migrations.
                </div>
              </div>
            </motion.div>
          </div>
          
          {/* Massive Kanban Screenshot */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="relative max-w-5xl mx-auto"
          >
            <div className="rounded-xl border border-white/10 bg-[#0c0d12] shadow-2xl overflow-hidden group">
              <img src="/screenshots/kanban.png" alt="Kanban Pipeline" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
            
            {/* Ambient glow behind screenshot */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur-2xl opacity-20 -z-10 pointer-events-none"></div>
          </motion.div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="border-t border-white/5 bg-black/20 relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto px-6 py-24 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Engineered for Success.</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">A comprehensive suite of tools to automate your job search while maintaining the highest standards of data privacy and professional formatting.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/[0.04] hover:-translate-y-1 transition-all duration-300 shadow-xl"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-3 text-white">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 bg-black">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center gap-6">
          <div className="flex items-center justify-center text-sm text-zinc-400">
            Built with <span className="mx-1.5">❤️</span> by <a href="https://github.com/hariharavk" target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:underline ml-1">Hari</a>.
          </div>
          
          <div className="flex items-center justify-center gap-6 text-sm text-zinc-500 font-medium">
            <a href="https://github.com/hariharavk/career-agent" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
              <Code2 className="w-4 h-4" />
              GitHub
            </a>
            <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
            <span className="hover:text-zinc-300 transition-colors">MIT License</span>
            <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
            <span>© {new Date().getFullYear()} CareerAgent</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
