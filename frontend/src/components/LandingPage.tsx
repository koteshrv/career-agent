import { motion } from "framer-motion"

import { useNavigate } from "react-router-dom"
import { Search, Target, FileText, Globe, MessageSquare, Shield, CheckCircle2 } from "lucide-react"

export function LandingPage() {
  const navigate = useNavigate()
  const handleEnter = () => navigate("/app/applications")

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col">
      
      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Career Agent" className="w-8 h-8 drop-shadow-sm" />
            <span className="font-medium text-lg tracking-tight">Career Agent</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noreferrer" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              GitHub
            </a>
            <button onClick={handleEnter} className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
              Launch App
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center">
        
        {/* Hero Section */}
        <section className="w-full max-w-5xl mx-auto px-6 pt-24 md:pt-32 pb-16 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-5xl md:text-7xl font-serif tracking-tight mb-8 leading-[1.1] text-foreground">
              Automate the job hunt.<br />
              <span className="text-muted-foreground">Keep your privacy </span>
              <span className="text-primary italic">intact.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-light">
              Open source AI-powered job search. Runs locally on your machine. Evaluates jobs, generates tailored LaTeX resumes, and tracks your pipeline automatically.
            </p>
          </motion.div>

          {/* Terminal Mockup */}
          
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl overflow-hidden text-left relative mt-8"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-status-interviewing/60" />
              <div className="ml-4 flex items-center gap-4 text-xs font-medium text-muted-foreground flex-1">
                <span className="text-foreground">Pipeline</span>
                <span>Matches</span>
                <span>Settings</span>
              </div>
            </div>
            <div className="p-6 md:p-10 flex flex-col md:flex-row gap-8 relative z-10">
              {/* Left Column: Job Card */}
              <div className="flex-1 space-y-4">
                <div className="bg-background border border-border rounded-xl p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-semibold text-foreground text-lg">Senior Backend Engineer</h4>
                      <p className="text-sm text-muted-foreground">Acme Corp • Remote</p>
                    </div>
                    <div className="bg-status-interviewing/10 text-status-interviewing border border-status-interviewing/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      98% Match
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-status-interviewing" /> Required: Python, FastAPI, PostgreSQL
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-status-interviewing" /> 5+ years experience building APIs
                    </div>
                  </div>
                </div>
                
                <div className="bg-background border border-border rounded-xl p-5 shadow-sm opacity-60">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-foreground text-lg">Platform Engineer</h4>
                      <p className="text-sm text-muted-foreground">Globex Inc • New York</p>
                    </div>
                    <div className="bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      42% Match
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Column: AI Action */}
              <div className="w-full md:w-72 bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">Ready to apply</h4>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  Resume tailored for Acme Corp. Missing keywords (GraphQL) injected. Cover letter drafted.
                </p>
                <button className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
                  Review & Apply
                </button>
              </div>
            </div>
          </motion.div>

        </section>

        {/* Manifesto Quote */}
        <section className="w-full max-w-4xl mx-auto px-6 py-20 text-center">
          <hr className="w-24 border-border mx-auto mb-16" />
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight text-foreground">
            "ATS was built to save <span className="text-muted-foreground">their</span> time.<br />
            Career Agent was built to save <span className="text-primary underline decoration-primary/30 underline-offset-8">yours</span>."
          </h2>
          <p className="mt-8 text-sm text-muted-foreground font-medium uppercase tracking-widest">— 100% Free & Open Source</p>
        </section>

        {/* Bento Grid Features */}
        <section className="w-full max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="md:col-span-2 bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-20 -mt-20 transition-all group-hover:bg-primary/20" />
              <Target className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Agentic Deep Evaluation</h3>
              <p className="text-muted-foreground leading-relaxed max-w-md relative z-10">
                A massive LLM rubric grades jobs against your resume in 5 dimensions. It flags red flags, calculates salary gaps, and outputs a strict 0-100 match score. No more spray and pray.
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <FileText className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Native LaTeX CVs</h3>
              <p className="text-muted-foreground leading-relaxed relative z-10">
                1-click injects missing keywords and natively compiles a pristine ATS-friendly PDF.
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <Globe className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Global Job Network</h3>
              <p className="text-muted-foreground leading-relaxed relative z-10">
                Opt-in to the crowdsourced job pool powered by our open-source API. Share protected jobs, deduplicate automatically, and flag fake listings.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <Search className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Playwright Hybrid Scrapers</h3>
              <p className="text-muted-foreground leading-relaxed max-w-md relative z-10">
                Runs headless background scrapers on standard ATS platforms. For heavily protected sites like LinkedIn, the companion Chrome Extension bypasses IP bans entirely.
              </p>
            </div>

          
            <div className="md:col-span-2 bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <MessageSquare className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Drafts Open-Ended Answers</h3>
              <p className="text-muted-foreground leading-relaxed max-w-md relative z-10">
                Greenhouse, Ashby, and Lever forms ask "Why this role?". The agent reads the form, drafts paste-ready answers based on your CV, and leaves the final click to you. It never auto-submits.
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 md:p-10 relative overflow-hidden group">
              <Shield className="w-10 h-10 text-primary mb-6 relative z-10" />
              <h3 className="text-2xl font-serif tracking-tight mb-4 relative z-10">Your Data, Your Machine</h3>
              <p className="text-muted-foreground leading-relaxed relative z-10">
                Everything lives locally. No cloud, no telemetry, no accounts. You are in complete control of your data and your search.
              </p>
            </div>
</div>
        </section>

      
        {/* FAQ Section */}
        <section className="w-full max-w-4xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground text-lg">Everything you need to know about how Career Agent works.</p>
          </div>
          
          <div className="space-y-12">
            <div>
              <h3 className="text-xl font-medium text-foreground mb-3">How does Career Agent score job listings?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Career Agent uses a rubric-guided LLM evaluation across five dimensions — technical match, experience level, compensation, cultural signals, and red flags — producing a holistic 1-100 global score. Anything below a 70, the agent recommends against applying. No closed-form formula, no spray-and-pray.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-medium text-foreground mb-3">Does Career Agent apply to jobs for me?</h3>
              <p className="text-muted-foreground leading-relaxed">
                No. It prepares every application right up to the click: it scans roles, scores each against your CV, tailors a LaTeX resume, and drafts open-ended answers. Then it hands the decision back to you. You review and send each one yourself. Mass auto-apply burns your standing with recruiters and ATS systems, so Career Agent removes the busywork but keeps the choice yours.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-medium text-foreground mb-3">Is Career Agent free? What is the business model?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Career Agent is permanently free and MIT-licensed. There is no paid tier, no waitlist, no accounts, and no premium features. You clone the repo, configure your profile, and run the system locally using your own free Gemini API key. It is an open-source tool built for the community.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-medium text-foreground mb-3">Where does my data live?</h3>
              <p className="text-muted-foreground leading-relaxed">
                On your own machine, in a local SQLite database. Career Agent runs entirely locally: no cloud, no telemetry, nothing uploaded to a central server. The only data that leaves your computer is sent directly to the Gemini API for resume scoring and tailoring.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Career Agent" className="w-6 h-6" />
            <span className="font-medium text-sm">Career Agent</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground font-medium">
            <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub Source</a>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>MIT License</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>Free Forever</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
