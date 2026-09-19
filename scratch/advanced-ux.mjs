import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// 1. IMPORT VIRTUALIZER
if (!content.includes('@tanstack/react-virtual')) {
  content = content.replace('import { useState, useEffect, useRef } from "react"', 'import { useState, useEffect, useRef, useMemo } from "react"\nimport { useVirtualizer } from "@tanstack/react-virtual"');
}

// 2. SCROLL AFFORDANCE MASK
// Find the chips container
const chipsContainerOld = 'className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 mt-1"';
const chipsContainerNew = 'className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 mt-1" style={{ WebkitMaskImage: "linear-gradient(to right, black 95%, transparent 100%)", maskImage: "linear-gradient(to right, black 95%, transparent 100%)" }}';
content = content.replace(chipsContainerOld, chipsContainerNew);

// 3. REMOVE TRASH ALL
// Find the Trash All button and remove it
const trashOld = `<button
              onClick={() => setConfirmClearOpen(true)}
              disabled={clearing || jobs.length === 0}
              className="flex items-center justify-center w-9 h-9 rounded-md bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors disabled:opacity-40"
              title="Clear All Jobs"
            >
              <Trash2 className="w-4 h-4" />
            </button>`;
content = content.replace(trashOld, '');

// 4. VIRTUALIZE THE LIST
// We need to inject the flattened items and the virtualizer hook
const hookInsertionPoint = '  const [stats, setStats] = useState<any>(null)';
const hooks = `  const [stats, setStats] = useState<any>(null)
  
  const flattenedItems = useMemo(() => {
    if (!groupByCompany) return tabJobs.map(job => ({ type: 'job', job }));
    const items: any[] = [];
    const companies = Array.from(new Set(tabJobs.map(j => j.company)));
    companies.forEach(company => {
      items.push({ type: 'header', company });
      if (expandedCompanies[company] ?? true) {
        items.push(...tabJobs.filter(j => j.company === company).map(job => ({ type: 'job', job })));
      }
    });
    return items;
  }, [tabJobs, groupByCompany, expandedCompanies]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => flattenedItems[i].type === 'header' ? 45 : 72,
    overscan: 10,
  });`;
if (content.includes(hookInsertionPoint)) {
  content = content.replace(hookInsertionPoint, hooks);
}

// Modify renderJobRow to take virtualRow
const renderJobRowOld = 'const renderJobRow = (job: Job, showStatusBadge: boolean) => {';
const renderJobRowNew = 'const renderJobRow = (job: Job, showStatusBadge: boolean, virtualRow?: any) => {';
content = content.replace(renderJobRowOld, renderJobRowNew);

const renderJobRowDivOld = `<div
        key={job.id}`;
const renderJobRowDivNew = `<div
        key={job.id}
        ref={virtualRow ? rowVirtualizer.measureElement : undefined}
        data-index={virtualRow?.index}
        style={virtualRow ? {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: \`translateY(\${virtualRow.start}px)\`,
        } : undefined}`;
content = content.replace(renderJobRowDivOld, renderJobRowDivNew);

// Replace the List block completely
const listOldRegex = /\{tabJobs\.length === 0 \? \([\s\S]*?\)\s*\}\s*<\/div>\s*\{\/\* Modal Overlay \*\/\}/;

const listNew = `{tabJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6 h-full">
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
        ) : (
          <div
            style={{
              height: \`\${rowVirtualizer.getTotalSize()}px\`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = flattenedItems[virtualRow.index];
              if (item.type === 'header') {
                const company = item.company;
                const companyJobs = tabJobs.filter(j => j.company === company);
                const isExpanded = expandedCompanies[company] ?? true;
                return (
                  <div 
                    key={\`header-\${company}\`}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: \`translateY(\${virtualRow.start}px)\`,
                    }}
                    className="border-b border-border bg-card z-10"
                  >
                    <button
                      onClick={() => toggleCompany(company)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors"
                    >
                      <span className="font-semibold text-sm text-foreground truncate">{company}</span>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CompanyLogo name={company} className="w-6 h-6 rounded shrink-0 shadow-sm border border-border" />
                        <span className="font-semibold text-sm text-foreground truncate">{company}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-status-new/15 text-status-new hover:bg-status-new/25">{companyJobs.length}</Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                  </div>
                );
              }
              return renderJobRow(item.job, showStatusBadge, virtualRow);
            })}
          </div>
        )}
      </div>

      {/* Modal Overlay */}`;

content = content.replace(listOldRegex, listNew);

// We must also add `ref={parentRef}` to the list container div!
const listContainerOld = `<div className={\`custom-scrollbar bg-card rounded-lg border border-border \${tabJobs.length === 0 ? 'shrink-0' : 'flex-1 overflow-y-auto'}\`}>`;
const listContainerNew = `<div ref={parentRef} className={\`custom-scrollbar bg-card rounded-lg border border-border \${tabJobs.length === 0 ? 'shrink-0' : 'flex-1 overflow-y-auto relative'}\`}>`;
content = content.replace(listContainerOld, listContainerNew);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Advanced UX applied!");
