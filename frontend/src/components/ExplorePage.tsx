import { getToken } from "@/lib/api";
import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { Search, Sparkles, Filter, ChevronDown, Rocket, X, Zap } from "lucide-react"

export function ExplorePage() {
  const [roles, setRoles] = useState<string[]>([])
  const [excludes, setExcludes] = useState<string[]>([])
  
  
  
  useEffect(() => {
    fetch("/api/onboarding/me", {
        headers: { "Authorization": `Bearer ${getToken()}` }
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.target_roles) {
            setRoles(data.target_roles);
        }
if (data && data.excludes) {
            setExcludes(data.excludes);
        }
        if (data && data.location_prefs) {
            try {
                const lp = JSON.parse(data.location_prefs)
                if (lp.include) setLocInclude(lp.include)
                if (lp.only) setLocOnly(lp.only)
                if (lp.exclude) setLocExclude(lp.exclude)
                if (lp.hardExclude) setLocHardExclude(lp.hardExclude)
                if (lp.scanDepth) setScanDepth(lp.scanDepth)
            } catch (e) {}
        }
    })
    .catch(console.error)
  }, [])
  

  const [isLocExpanded, setIsLocExpanded] = useState(false)
  const [locInclude, setLocInclude] = useState("")
  const [locOnly, setLocOnly] = useState("")
  const [locExclude, setLocExclude] = useState("")
  const [locHardExclude, setLocHardExclude] = useState("")
  const [scanDepth, setScanDepth] = useState(500)

  const syncLocPrefs = async (prefs: any) => {
    try {
      await fetch("/api/onboarding/me", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${getToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ location_prefs: JSON.stringify(prefs) })
      })
    } catch (e) {}
  }

  const [timeFilter, setTimeFilter] = useState("7d")



  const syncProfile = async (newRoles: string[], newExcludes: string[]) => {
    try {
      await fetch("/api/onboarding/me", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${getToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ target_roles: newRoles, excludes: newExcludes })
      })
    } catch (e) { console.error(e) }
  }

  const removeRole = (role: string) => {
    const next = roles.filter(r => r !== role)
    setRoles(next)
    syncProfile(next, excludes)
  }

  const handleLocBlur = () => {
    syncLocPrefs({
      include: locInclude,
      only: locOnly,
      exclude: locExclude,
      hardExclude: locHardExclude,
      scanDepth: scanDepth
    })
  }

  const removeExclude = (ex: string) => {
    const next = excludes.filter(e => e !== ex)
    setExcludes(next)
    syncProfile(roles, next)
  }

  const [newRole, setNewRole] = useState("")
  const [newExclude, setNewExclude] = useState("")

  const roleInputRef = useRef<HTMLInputElement>(null)
  const excludeInputRef = useRef<HTMLInputElement>(null)


  const addRole = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newRole.trim()) {
      const next = [...roles, newRole.trim()]
      setRoles(next)
      syncProfile(next, excludes)
      setNewRole("")
    }
  }

  const addExclude = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newExclude.trim()) {
      const next = [...excludes, newExclude.trim()]
      setExcludes(next)
      syncProfile(roles, next)
      setNewExclude("")
    }
  }


  return (
    <div className="flex flex-col max-w-5xl mx-auto h-full w-full pt-4">
      
      

      {/* Main Form Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-6">
        
        
        {roles.length === 0 && excludes.length === 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mb-8 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">Filters not seeded yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              It looks like you haven't configured your ATS target roles or exclusions. Uploading your resume allows our AI to automatically extract and seed these filters.
            </p>
            <Link to="/app/onboarding" className="inline-flex items-center justify-center bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              Run Onboarding Setup
            </Link>
          </div>
        )}

        {/* Roles */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-foreground mb-3">Roles to find</h3>
          <div 
            onClick={() => roleInputRef.current?.focus()}
            className="flex flex-wrap items-center gap-2 mb-2 p-3 bg-transparent border border-border rounded-lg cursor-text focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all"
          >
            {roles.map(role => (
              <div key={role} className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-md text-xs font-medium group">
                {role}
                <button onClick={(e) => { e.stopPropagation(); removeRole(role); }} className="opacity-50 group-hover:opacity-100 hover:text-foreground transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <input 
              ref={roleInputRef}
              type="text" 
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={addRole}
              placeholder={roles.length === 0 ? "Add roles..." : ""} 
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none focus:ring-0 flex-1 min-w-[120px] py-1"
            />
          </div>
          <p className="text-xs text-muted-foreground italic">Seeded from your profile — edit freely.</p>
        </div>

        {/* Excludes */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-foreground mb-3">Exclude</h3>
          <div 
            onClick={() => excludeInputRef.current?.focus()}
            className="flex flex-wrap items-center gap-2 p-3 bg-transparent border border-border rounded-lg cursor-text focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-foreground/30 transition-all"
          >
            {excludes.map(ex => (
              <div key={ex} className="flex items-center gap-1.5 bg-secondary/80 text-muted-foreground border border-border px-2.5 py-1 rounded-md text-xs font-medium group hover:bg-secondary">
                {ex}
                <button onClick={(e) => { e.stopPropagation(); removeExclude(ex); }} className="opacity-50 group-hover:opacity-100 hover:text-foreground transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <input 
              ref={excludeInputRef}
              type="text" 
              value={newExclude}
              onChange={e => setNewExclude(e.target.value)}
              onKeyDown={addExclude}
              placeholder={excludes.length === 0 ? "Add excludes..." : ""} 
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none focus:ring-0 flex-1 min-w-[120px] py-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-8 mb-8 border-t border-border pt-8">
          {/* Posted Within */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-muted-foreground" /> Posted within
              <span className="text-xs font-normal text-muted-foreground italic ml-2">postings published in this window</span>
            </h3>
            <div className="flex gap-2">
              {["24h", "3d", "7d", "14d", "30d"].map(t => (
                <button
                  key={t}
                  onClick={() => setTimeFilter(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    timeFilter === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent border border-border"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>


        </div>

        {/* Location & Scope */}
        <div className="mb-8">
          <button 
            onClick={() => setIsLocExpanded(!isLocExpanded)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <Filter className="w-4 h-4" /> Location & scope <ChevronDown className={`w-4 h-4 transition-transform ${isLocExpanded ? 'rotate-180' : ''}`} />
          </button>
          
          {isLocExpanded && (
            <div className="border border-border rounded-lg p-6 space-y-6 bg-card/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-foreground">Always include</label>
                    <span className="text-[10px] text-muted-foreground italic">rescues multi-loc posts</span>
                  </div>
                  <input type="text" value={locInclude} onChange={e => setLocInclude(e.target.value)} onBlur={handleLocBlur} placeholder="London..." className="w-full bg-secondary/50 border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-foreground">Only in</label>
                  </div>
                  <input type="text" value={locOnly} onChange={e => setLocOnly(e.target.value)} onBlur={handleLocBlur} placeholder="Remote, EMEA..." className="w-full bg-secondary/50 border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-foreground">Never in</label>
                  </div>
                  <input type="text" value={locExclude} onChange={e => setLocExclude(e.target.value)} onBlur={handleLocBlur} placeholder="" className="w-full bg-secondary/50 border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-foreground">Never in (hard)</label>
                  <span className="text-[10px] text-muted-foreground italic">hard reject — overrides Always include</span>
                </div>
                <input type="text" value={locHardExclude} onChange={e => setLocHardExclude(e.target.value)} onBlur={handleLocBlur} placeholder="USA, Brazil..." className="w-full bg-secondary/50 border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-foreground">Scan depth</label>
                  <span className="text-[10px] text-muted-foreground">{scanDepth} companies / source</span>
                </div>
                <input 
                  type="range" 
                  min="100" max="2000" step="100" 
                  value={scanDepth} 
                  onChange={e => setScanDepth(parseInt(e.target.value))} 
                  onMouseUp={handleLocBlur}
                  onTouchEnd={handleLocBlur}
                  className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-4 border-t border-border">
          <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-md font-semibold text-sm transition-colors shadow-sm">
            <Search className="w-4 h-4" /> Discover (free)
          </button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Evaluating a role later costs tokens. Discovering never does.
          </p>
        </div>
      </div>

      {/* Empty State / Results Area */}
      <div className="flex-1 bg-card/30 border border-border border-dashed rounded-xl flex flex-col items-center justify-center p-12 text-center">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">No fresh matches — yet.</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Discovery is free — loosen and re-cast as often as you want.
        </p>
      </div>

    </div>
  )
}
