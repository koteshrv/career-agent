import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const oldSearch = `      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
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

const newSearch = `      {/* Controls Bar */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative max-w-2xl w-full flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by company or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border border-border rounded-md pl-9 pr-16 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
            <span className="absolute right-4 text-xs font-mono text-muted-foreground">
              {tabJobs.length}/{jobs.length}
            </span>
          </div>`;

content = content.replace(oldSearch, newSearch);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Search patched");
