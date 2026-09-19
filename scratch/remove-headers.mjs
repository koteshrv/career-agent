import fs from 'fs';

// 1. Update App.tsx subtitle for Explore
let appContent = fs.readFileSync('frontend/src/App.tsx', 'utf8');
appContent = appContent.replace(
  'subtitle: "Scan the public ATS network for fresh postings."',
  'subtitle: "Scan the public ATS network — Greenhouse, Lever, Ashby, Workday."'
);
fs.writeFileSync('frontend/src/App.tsx', appContent);

// 2. Remove header from ExplorePage.tsx
let exploreContent = fs.readFileSync('frontend/src/components/ExplorePage.tsx', 'utf8');
const exploreHeaderRegex = /\{\/\* Header Area \*\/\}\s*<div className="flex items-center justify-between mb-8">[\s\S]*?<\/div>\s*<\/div>/;
exploreContent = exploreContent.replace(exploreHeaderRegex, '');
fs.writeFileSync('frontend/src/components/ExplorePage.tsx', exploreContent);

// 3. Remove header from JobsBoard.tsx, but keep counts styled nicely
let jobsContent = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');
const jobsHeaderRegex = /\{\/\* Title \*\/\}\s*<div className="mb-8">\s*<h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Pipeline<\/h1>\s*<p className="mt-1 text-sm text-muted-foreground">\s*<span className="tabular-nums">\{jobs\.filter\(j => j\.status === 'NEW'\)\.length\}<\/span> in inbox -\{" "\}\s*<span className="tabular-nums">\{jobs\.filter\(j => j\.status !== 'NEW' && j\.status !== 'TRASH'\)\.length\}<\/span> tracked\s*<\/p>\s*<\/div>/;

const newJobsHeader = `{/* Inbox Stats */}
      <div className="mb-5 flex items-center gap-3">
        <span className="text-sm font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-md">
          <span className="tabular-nums font-bold">{jobs.filter(j => j.status === 'NEW').length}</span> in inbox
        </span>
        <span className="text-sm font-medium bg-secondary text-muted-foreground px-2.5 py-1 rounded-md">
          <span className="tabular-nums font-bold">{jobs.filter(j => j.status !== 'NEW' && j.status !== 'TRASH').length}</span> tracked
        </span>
      </div>`;

jobsContent = jobsContent.replace(jobsHeaderRegex, newJobsHeader);
fs.writeFileSync('frontend/src/components/JobsBoard.tsx', jobsContent);

console.log("Headers removed from Explore and JobsBoard!");
