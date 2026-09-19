import { getToken } from "@/lib/api";
import { useState, useEffect } from "react"
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
    })
    .catch(console.error)
  }, [])
  
  const [timeFilter, setTimeFilter] = useState("7d")
  const [sources, setSources] = useState<string[]>(["Greenhouse", "Lever", "Ashby", "Workday"])

  const removeRole = (role: string) => setRoles(roles.filter(r => r !== role))
  const removeExclude = (ex: string) => setExcludes(excludes.filter(e => e !== ex))
  const toggleSource = (source: string) => {
    setSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source])
  }

  return (
    <div className="flex flex-col max-w-5xl mx-auto h-full w-full pt-4">
      
      

      {/* Main Form Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-6">
        
        {/* Roles */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-foreground mb-3">Roles to find</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {roles.map(role => (
              <div key={role} className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-md text-xs font-medium group">
                {role}
                <button onClick={() => removeRole(role)} className="opacity-50 group-hover:opacity-100 hover:text-foreground transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground italic">Seeded from your profile — edit freely.</p>
        </div>

        {/* Excludes */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-foreground mb-3">Exclude</h3>
          <div className="flex flex-wrap gap-2">
            {excludes.map(ex => (
              <div key={ex} className="flex items-center gap-1.5 bg-secondary/80 text-muted-foreground border border-border px-2.5 py-1 rounded-md text-xs font-medium group hover:bg-secondary">
                {ex}
                <button onClick={() => removeExclude(ex)} className="opacity-50 group-hover:opacity-100 hover:text-foreground transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
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

          {/* Sources */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">Sources</h3>
            <div className="flex gap-2">
              {["Greenhouse", "Lever", "Ashby", "Workday"].map(s => (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    sources.includes(s) ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground hover:bg-accent border border-border"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Location & Scope */}
        <div className="mb-8">
          <button className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <Filter className="w-4 h-4" /> Location & scope <ChevronDown className="w-4 h-4" />
          </button>
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
