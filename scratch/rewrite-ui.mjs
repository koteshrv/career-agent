import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// Fix the duplicated state
content = content.replace('  const [timeFilter, setTimeFilter] = useState<string | null>(null)\n  const [timeFilter, setTimeFilter] = useState<string | null>(null)', '  const [timeFilter, setTimeFilter] = useState<string | null>(null)');

// Let's completely replace the entire Controls Bar and Tabs section with a cleaner layout
const startControls = content.indexOf('{/* Controls Bar */}');
const startList = content.indexOf('{/* List */}');

const newUI = `{/* Filter & Search Bar */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Search & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative max-w-2xl w-full flex items-center bg-secondary/30 rounded-md border border-border">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by company or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 rounded-md pl-10 pr-16 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
            />
            <span className="absolute right-4 text-xs font-mono text-muted-foreground">
              {tabJobs.length}/{jobs.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmClearOpen(true)}
              disabled={clearing || jobs.length === 0}
              className="flex items-center justify-center w-9 h-9 rounded-md bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors disabled:opacity-40"
              title="Clear All Jobs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="relative" ref={filtersRef}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={\`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold border transition-colors \${showFilters ? 'bg-accent text-foreground border-border' : 'bg-secondary text-muted-foreground border-border hover:bg-accent'}\`}
              >
                <Filter className="w-3.5 h-3.5" /> View Options
              </button>
              {showFilters && (
                <div className="absolute top-full right-0 mt-2 w-[300px] bg-popover border border-border rounded-md shadow-lg p-5 z-50 flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-4 text-sm text-foreground">
                    <span className="font-medium whitespace-nowrap w-16">Group By</span>
                    <select
                      value={groupByCompany.toString()}
                      onChange={(e) => setGroupByCompany(e.target.value === "true")}
                      className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none w-full"
                    >
                      <option value="false">None</option>
                      <option value="true">Company</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm text-foreground">
                    <span className="font-medium whitespace-nowrap w-16">Sort By</span>
                    <select
                      value={\`\${sortBy}-\${sortOrder}\`}
                      onChange={(e) => {
                        const [s, o] = e.target.value.split("-")
                        setSortBy(s as any)
                        setSortOrder(o as any)
                      }}
                      className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none w-full"
                    >
                      <option value="priority-desc">Priority (High &rarr; Low)</option>
                      <option value="priority-asc">Priority (Low &rarr; High)</option>
                      <option value="date-desc">Newest First</option>
                      <option value="date-asc">Oldest First</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isSyncing ? 'Syncing...' : 'Sync Jobs'}
            </button>
          </div>
        </div>

        {/* Pipeline Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 mt-1">
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
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-4 overflow-x-auto custom-scrollbar mt-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={\`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors \${activeTab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}\`}
          >
            {t.label}
            <span className={\`text-xs rounded-full px-1.5 py-0.5 \${activeTab === t.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}\`}>
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "CLOSED" && (
        <div className="flex items-center gap-2 mb-4">
          {CLOSED_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setClosedFilter(f.id)}
              className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${closedFilter === f.id ? 'bg-accent text-foreground border-border' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      `;

content = content.substring(0, startControls) + newUI + content.substring(startList);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Rewritten UI!");
