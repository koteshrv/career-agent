import { useState, useEffect, useMemo } from "react"
import { api } from "@/lib/api"
import { X, Check, Minus } from "lucide-react"

type Company = { name: string; domain: string }

// Slug -> display label. An unlisted slug (e.g. a future "other") just
// title-cases itself below, so this only needs entries worth a nicer name.
const DOMAIN_LABELS: Record<string, string> = {
  "ai-ml": "AI / ML",
  "voice-conversational-ai": "Voice & Conversational AI",
  "dev-tools-infra": "Dev Tools & Infra",
  "customer-engagement": "Customer Engagement",
  "automation-agentic": "Automation & Agentic",
  "fintech-payments": "Fintech & Payments",
  "banking-finance": "Banking & Finance",
  "it-services": "IT Services",
  "big-tech": "Big Tech",
  "ecommerce-retail": "E-commerce & Retail",
  "automotive-industrial": "Automotive & Industrial",
  "enterprise-saas": "Enterprise SaaS",
  "gaming": "Gaming",
  "security": "Security",
  "telecom": "Telecom",
  "other": "Other",
}
const domainLabel = (d: string) => DOMAIN_LABELS[d] || d.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())

export function ScrapeConfig({ settings, onChange }: { settings: any, onChange: (s: any) => void }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [keywordInput, setKeywordInput] = useState("")

  useEffect(() => {
    api.get("/api/companies").then(res => setCompanies(res.data.companies || []))
  }, [])

  const groupedByDomain = useMemo(() => {
    const groups: Record<string, Company[]> = {}
    for (const c of companies) {
      (groups[c.domain] ||= []).push(c)
    }
    return Object.entries(groups).sort(([a], [b]) => domainLabel(a).localeCompare(domainLabel(b)))
  }, [companies])

  const parseList = (raw: string | null | undefined): string[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const keywords = parseList(settings?.search_keywords)
  const activeCompanies = parseList(settings?.active_companies)

  const setKeywords = (kws: string[]) => onChange({ ...settings, search_keywords: JSON.stringify(kws) })
  const setActiveCompanies = (comps: string[]) => onChange({ ...settings, active_companies: JSON.stringify(comps) })

  const addKeyword = () => {
    const v = keywordInput.trim().toLowerCase()
    if (v && !keywords.includes(v)) setKeywords([...keywords, v])
    setKeywordInput("")
  }

  const handleKeywordKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addKeyword()
    } else if (e.key === "Backspace" && !keywordInput && keywords.length) {
      setKeywords(keywords.slice(0, -1))
    }
  }

  const removeKeyword = (kw: string) => setKeywords(keywords.filter(k => k !== kw))

  const allCompanies = activeCompanies.length === 0

  // Every checkbox renders as checked while activeCompanies is [] ("all"),
  // so a click there must mean "deselect this one" (-> all except it), not
  // "select this one" (-> only it) — materialize the full list first, same
  // as toggleDomain below.
  const toggleCompany = (c: string) => {
    const base = allCompanies ? companies.map(x => x.name) : activeCompanies
    setActiveCompanies(base.includes(c) ? base.filter(x => x !== c) : [...base, c])
  }

  const toggleDomain = (domainCompanies: Company[]) => {
    const base = allCompanies ? companies.map(c => c.name) : activeCompanies
    const names = domainCompanies.map(c => c.name)
    const allSelected = names.every(n => base.includes(n))
    setActiveCompanies(allSelected ? base.filter(n => !names.includes(n)) : [...new Set([...base, ...names])])
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Scrape Configuration</h3>
        <p className="text-sm text-muted-foreground mt-1">Keywords and companies the scraper targets. Runs automatically on your cron schedule.</p>
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">Search Keywords</label>
        <div className="flex flex-wrap gap-2 bg-secondary border border-border rounded-md p-3 focus-within:ring-1 focus-within:ring-ring transition-colors">
          {keywords.map(kw => (
            <span key={kw} className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
              {kw}
              <button onClick={() => removeKeyword(kw)} className="hover:bg-accent rounded-full p-0.5 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKey}
            onBlur={addKeyword}
            placeholder={keywords.length ? "Add keyword..." : "e.g. python, backend, data engineer"}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Press Enter or comma to add. A job matches if its title contains any keyword.</p>
      </div>

      {/* Companies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-muted-foreground">Target Companies</label>
          <span className="text-xs text-muted-foreground">{allCompanies ? "All companies" : `${activeCompanies.length} selected`}</span>
        </div>
        <div className="bg-secondary border border-border rounded-md p-3 max-h-96 overflow-y-auto custom-scrollbar">
          <button
            onClick={() => setActiveCompanies([])}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium mb-2 transition-colors ${allCompanies ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"}`}
          >
            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${allCompanies ? "bg-primary border-primary" : "border-border"}`}>
              {allCompanies && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
            </span>
            All (scrape everything)
          </button>

          {groupedByDomain.map(([domain, domainCompanies]) => {
            const names = domainCompanies.map(c => c.name)
            const selectedCount = allCompanies ? names.length : names.filter(n => activeCompanies.includes(n)).length
            const domainState = selectedCount === 0 ? "none" : selectedCount === names.length ? "all" : "some"
            return (
              <div key={domain} className="mb-2 last:mb-0">
                <button
                  onClick={() => toggleDomain(domainCompanies)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${domainState !== "none" ? "bg-primary border-primary" : "border-border"}`}>
                    {domainState === "all" && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    {domainState === "some" && <Minus className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>
                  {domainLabel(domain)}
                  <span className="text-muted-foreground font-normal ml-auto">{selectedCount}/{names.length}</span>
                </button>
                <div className="grid grid-cols-2 gap-0.5 pl-1">
                  {domainCompanies.map(c => {
                    const checked = allCompanies || activeCompanies.includes(c.name)
                    return (
                      <button
                        key={c.name}
                        onClick={() => toggleCompany(c.name)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      >
                        <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </span>
                        <span className="truncate text-left">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Max Pages */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">Max Pages to Scrape (Pagination limit)</label>
        <input
          type="number"
          min="1"
          max="50"
          value={settings?.max_pages || 3}
          onChange={e => onChange({ ...settings, max_pages: parseInt(e.target.value) || 3 })}
          className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
        <p className="text-xs text-muted-foreground mt-1">Maximum number of job list pages to scrape per company (default 3).</p>
      </div>
    </div>
  )
}
