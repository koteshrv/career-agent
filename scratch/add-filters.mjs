import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const filterState = `
  const [searchQuery, setSearchQuery] = useState("")
  const [timeFilter, setTimeFilter] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
`;

content = content.replace('const [searchQuery, setSearchQuery] = useState("")', filterState);

const filterLogic = `
  let tabJobs = jobs.filter(j => {
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

  if (tab.statuses) tabJobs = tabJobs.filter(j => tab.statuses!.includes(j.status))
`;

content = content.replace(
  '  let tabJobs = jobs.filter(j => {\n    const q = searchQuery.toLowerCase()\n    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)\n  })\n  if (tab.statuses) tabJobs = tabJobs.filter(j => tab.statuses!.includes(j.status))',
  filterLogic
);

const filterUI = `
      </div>

      {/* Pipeline Filter Chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto custom-scrollbar pb-1">
        <div className="flex items-center gap-1.5 border-r border-border pr-3">
          {["24h", "3d", "7d"].map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(timeFilter === f ? null : f)}
              className={\`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors \${timeFilter === f ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-r border-border pr-3 pl-1">
          {["Intern", "Junior", "Mid", "Senior", "Lead"].map(f => (
            <button
              key={f}
              onClick={() => setLevelFilter(levelFilter === f ? null : f)}
              className={\`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors \${levelFilter === f ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          {["Remote", "On-site"].map(f => (
            <button
              key={f}
              onClick={() => setLocationFilter(locationFilter === f ? null : f)}
              className={\`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors \${locationFilter === f ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
`;

content = content.replace(
  '        ))}      </div>      {activeTab === "CLOSED"',
  '        ))}      </div>' + filterUI + '      {activeTab === "CLOSED"'
);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Chips injected!");
