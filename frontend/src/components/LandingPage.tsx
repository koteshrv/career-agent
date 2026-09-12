import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { Search, Target, FileText, Globe, MessageSquare, Shield, CheckCircle2} from "lucide-react"


function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="20" 
      height="20" 
      viewBox="0 0 16 16" 
      fill="currentColor" 
      className={className}
    >
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.46-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
    </svg>
  );
}

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
            <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center" aria-label="GitHub">
              <GitHubIcon className="w-5 h-5" />
            </a>
            <button onClick={handleEnter} className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
              Launch Demo
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center">

        {/* Hero Section */}
        <section className="w-full max-w-5xl mx-auto px-6 pt-16 md:pt-20 pb-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-5xl md:text-7xl font-serif tracking-tight mb-6 leading-[1.1] text-foreground">
              Automate the job hunt.<br />
              <span className="text-muted-foreground">Keep your privacy </span>
              <span className="text-primary italic">intact.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
              Open source AI-powered job search. Runs locally on your machine via Docker. Evaluates jobs against your resume, generates tailored LaTeX CVs, and tracks your pipeline — completely autonomously in the background.
            </p>
          </motion.div>

          {/* UI Mockup */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl overflow-hidden text-left relative mt-12"
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
                  Review &amp; Apply
                </button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Manifesto Quote */}
        <section className="w-full max-w-4xl mx-auto px-6 py-16 text-center">
          <hr className="w-24 border-border mx-auto mb-16" />
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight text-foreground">
            "ATS was built to save <span className="text-muted-foreground">their</span> time.<br />
            Career Agent was built to save <span className="text-primary underline decoration-primary/30 underline-offset-8">yours</span>."
          </h2>
          <p className="mt-8 text-sm text-muted-foreground font-medium uppercase tracking-widest">— 100% Free &amp; Open Source</p>
        </section>

        {/* Get Started Section — moved below quote */}
        <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-4">Up and running in 60 seconds</h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              No cloud account. No subscriptions. Just Docker and a free Gemini API key.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center mb-4 text-sm">1</div>
              <h3 className="font-semibold text-foreground mb-2">Get a free Gemini API key</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">Google AI Studio</a> and create a free API key. Your key works automatically with any Gemini model. No credit card required.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center mb-4 text-sm">2</div>
              <h3 className="font-semibold text-foreground mb-2">Download &amp; configure</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Download the <a href="https://github.com/koteshrv/career-agent/blob/main/docker-compose.yml" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">docker-compose.yml</a> file. Create a <code className="text-primary font-mono text-xs bg-muted px-1 py-0.5 rounded">.env</code> file and add your Gemini key and resume path. That's it.
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center mb-4 text-sm">3</div>
              <h3 className="font-semibold text-foreground mb-2">Launch &amp; automate</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Run <code className="text-primary font-mono text-xs bg-muted px-1 py-0.5 rounded">docker compose up -d</code>. Career Agent runs autonomously in the background, scraping ATS portals, scoring matches, and syncing jobs without you lifting a finger.
              </p>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Need help? Read the <a href="https://github.com/koteshrv/career-agent#readme" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">full setup guide →</a>
          </p>
        </section>

        {/* Bento Grid Features */}
        <section className="w-full max-w-6xl mx-auto px-6 py-20 border-t border-border">
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
                Everything lives locally in a SQLite database. No cloud, no telemetry, no accounts. You are in complete control.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="w-full max-w-4xl mx-auto px-6 py-24 border-t border-border">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground text-lg">Everything you need to know about how Career Agent works.</p>
          </div>
          
          <div className="space-y-12">
            <div>
              <h3 className="text-xl font-medium text-foreground mb-3">How does the crowdsourced Global Job Network work?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Career Agent features an optional open-source API that lets users pool their scraped job data. If you opt-in, jobs you scrape are anonymously shared with the network, and you instantly receive access to jobs scraped by others. This helps bypass rate limits, deduplicates overlapping postings automatically, and allows the community to flag fake or ghost listings. Your personal data is never shared—only the public job postings.
              </p>
            </div>
            
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
                Career Agent is permanently free and MIT-licensed. There is no paid tier, no waitlist, no accounts, and no premium features. Download the docker-compose.yml, add your free Gemini API key, and run it locally. It is an open-source tool built for the community.
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
