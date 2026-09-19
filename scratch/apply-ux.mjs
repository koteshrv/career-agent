import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// 1. Patch Accessibility for Chips
// Time filter
content = content.replace(
  /\{(\["24h", "3d", "7d"\]\.map\(f => \()([\s\S]*?)(\)\)\})/,
  `{["24h", "3d", "7d"].map(f => {
            const isActive = timeFilter === f;
            return (
              <button
                key={f}
                role="switch"
                aria-checked={isActive}
                onClick={() => setTimeFilter(isActive ? null : f)}
                className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${isActive ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
              >
                {f}
              </button>
            );
          })}`
);

// Level filter
content = content.replace(
  /\{(\["Intern", "Junior", "Mid", "Senior", "Lead", "Staff\+"\]\.map\(f => \()([\s\S]*?)(\)\)\})/,
  `{["Intern", "Junior", "Mid", "Senior", "Lead", "Staff+"].map(f => {
            const isActive = levelFilter === f;
            return (
              <button
                key={f}
                role="switch"
                aria-checked={isActive}
                onClick={() => setLevelFilter(isActive ? null : f)}
                className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${isActive ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
              >
                {f}
              </button>
            );
          })}`
);

// Location filter
content = content.replace(
  /\{(\["Remote", "On-site"\]\.map\(f => \()([\s\S]*?)(\)\)\})/,
  `{["Remote", "On-site"].map(f => {
            const isActive = locationFilter === f;
            return (
              <button
                key={f}
                role="switch"
                aria-checked={isActive}
                onClick={() => setLocationFilter(isActive ? null : f)}
                className={\`px-3 py-1 rounded-full text-xs font-medium border transition-colors \${isActive ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-muted-foreground border-border hover:bg-accent'}\`}
              >
                {f}
              </button>
            );
          })}`
);


// 2. Patch Smart Empty State
const oldEmptyState = `{tabJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-6">
            <Inbox className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">{TAB_EMPTY[activeTab]}</p>
            {jobs.length === 0 && (
              <button onClick={handleSync} className="mt-1 text-xs font-semibold text-primary hover:underline">
                Sync Jobs now
              </button>
            )}
          </div>
        ) : groupByCompany ? (`;

const newEmptyState = `{tabJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <Inbox className="w-8 h-8 text-muted-foreground/50 mb-2" />
            
            {(searchQuery || timeFilter || levelFilter || locationFilter) ? (
              <>
                <p className="text-base font-semibold text-foreground">No matches found</p>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  We couldn't find any jobs matching your current search and filters.
                </p>
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setTimeFilter(null);
                    setLevelFilter(null);
                    setLocationFilter(null);
                  }}
                  className="px-4 py-2 bg-secondary text-foreground text-sm font-medium rounded-md hover:bg-accent transition-colors"
                >
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-foreground">Your pipeline is empty</p>
                <p className="text-sm text-muted-foreground max-w-sm">{TAB_EMPTY[activeTab]}</p>
                {jobs.length === 0 && (
                  <button onClick={handleSync} className="mt-4 text-sm font-semibold text-primary hover:underline flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Sync Jobs now
                  </button>
                )}
              </>
            )}
          </div>
        ) : groupByCompany ? (`;

content = content.replace(oldEmptyState, newEmptyState);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("UX patches applied.");
