import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// 1. ADD FILTER STATES
const stateMarker = `const [searchQuery, setSearchQuery] = useState("")`;
if (content.includes(stateMarker)) {
  content = content.replace(stateMarker, `
  const [searchQuery, setSearchQuery] = useState("")
  const [timeFilter, setTimeFilter] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  `);
} else {
  console.error("Could not find state marker");
}

// 2. ADD FILTER LOGIC
const logicMarker = `  let tabJobs = jobs.filter(j => {
    const q = searchQuery.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
  })
  if (tab.statuses) tabJobs = tabJobs.filter(j => tab.statuses!.includes(j.status))`;

const newLogic = `  let tabJobs = jobs.filter(j => {
    const q = searchQuery.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
  })

  // Apply new pipeline chips filters
  if (timeFilter) {
    const now = Date.now()
    tabJobs = tabJobs.filter(j => {
      const created = new Date(j.created_at).getTime()
      if (timeFilter === "24h") return now - created <= 24 * 60 * 60 * 1000;
      if (timeFilter === "3d") return now - created <= 3 * 24 * 60 * 60 * 1000;
      if (timeFilter === "7d") return now - created <= 7 * 24 * 60 * 60 * 1000;
      return true;
    })
  }

  if (levelFilter) {
    tabJobs = tabJobs.filter(j => {
      const t = j.title.toLowerCase()
      if (levelFilter === "Intern") return t.includes("intern")
      if (levelFilter === "Junior") return t.includes("junior") || t.includes("jr") || t.includes("associate")
      if (levelFilter === "Mid") return t.includes("mid") || (!t.includes("senior") && !t.includes("lead") && !t.includes("junior") && !t.includes("intern"))
      if (levelFilter === "Senior") return t.includes("senior") || t.includes("sr") || t.includes("principal")
      if (levelFilter === "Lead") return t.includes("lead") || t.includes("manager") || t.includes("director")
      return true;
    })
  }

  if (locationFilter) {
    tabJobs = tabJobs.filter(j => {
      const loc = (j.location || "").toLowerCase()
      if (locationFilter === "Remote") return loc.includes("remote") || loc.includes("anywhere")
      if (locationFilter === "On-site") return !loc.includes("remote") && !loc.includes("anywhere") && loc.trim().length > 0
      return true;
    })
  }

  if (tab.statuses) tabJobs = tabJobs.filter(j => tab.statuses!.includes(j.status))`;

if (content.includes(logicMarker)) {
  content = content.replace(logicMarker, newLogic);
} else {
  console.error("Could not find logic marker");
}

// 3. FIX SEARCH BAR
const searchMarker = `      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="relative max-w-md w-full sm:flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search roles, companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
          />
        </div>`;

const newSearch = `      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 w-full">
        <div className="relative max-w-2xl w-full flex items-center bg-secondary/30 rounded-md border border-border">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by company or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 rounded-md pl-10 pr-16 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
          />
          <span className="absolute right-4 text-xs font-mono text-muted-foreground">
            {tabJobs.length}/{jobs.length}
          </span>
        </div>`;

if (content.includes(searchMarker)) {
  content = content.replace(searchMarker, newSearch);
} else {
  console.error("Could not find search marker");
}

// 4. ADD CHIPS UNDER TABS
const tabsMarker = `        ))}
      </div>

      {activeTab === "CLOSED" && (`;

const newTabs = `        ))}
      </div>

      {/* Pipeline Filter Chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto custom-scrollbar pb-1">
        <div className="flex items-center gap-1.5 border-r border-border pr-3">
          {["24h", "3d", "7d"].map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(timeFilter === f ? null : f)}
              className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${timeFilter === f ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-r border-border px-3">
          {["Intern", "Junior", "Mid", "Senior", "Lead"].map(f => (
            <button
              key={f}
              onClick={() => setLevelFilter(levelFilter === f ? null : f)}
              className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${levelFilter === f ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pl-3">
          {["Remote", "On-site"].map(f => (
            <button
              key={f}
              onClick={() => setLocationFilter(locationFilter === f ? null : f)}
              className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${locationFilter === f ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "CLOSED" && (`;

if (content.includes(tabsMarker)) {
  content = content.replace(tabsMarker, newTabs);
} else {
  console.error("Could not find tabs marker");
}

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Safe patch complete!");
