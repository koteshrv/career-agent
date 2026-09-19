import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// 1. PATCH THE SEARCH BAR
content = content.replace(
  /{[\s\S]*?Controls Bar[\s\S]*?<div className="relative max-w-md w-full sm:flex-1 sm:min-w-\[240px\]">[\s\S]*?<Search className="absolute left-3[\s\S]*?<input[\s\S]*?\/>\s*<\/div>/,
  `{/* Controls Bar */}
      <div className="flex flex-col gap-3 mb-5 w-full">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
              {jobs.filter(j => j.status === activeTab || activeTab === 'ALL').length}/{jobs.length}
            </span>
          </div>`
);

// 2. PATCH THE FILTER CHIPS
// We insert it right after the Tabs loop ends
content = content.replace(
  /(\{\s*TABS\.map[\s\S]*?<\/div>\s*)\{activeTab === "CLOSED" && \(/,
  `$1

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
          {["Intern", "Junior", "Mid", "Senior", "Lead", "Staff+"].map(f => (
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

      {activeTab === "CLOSED" && (`
);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Patches applied!");
