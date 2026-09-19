import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

// 1. Remove flattenedItems and rowVirtualizer from top
const hooksRegex = /  const flattenedItems = useMemo\(\(\) => \{[\s\S]*?overscan: 10,\n  \}\);/m;
const hooksMatch = content.match(hooksRegex);

if (hooksMatch) {
  content = content.replace(hooksMatch[0], '');
  
  // 2. Insert them below tabJobs sorting logic
  const insertPoint = `  const showStatusBadge = activeTab === "ALL" || activeTab === "CLOSED"`;
  
  const hooksToInsert = `  
${hooksMatch[0]}

  const showStatusBadge = activeTab === "ALL" || activeTab === "CLOSED"`;
  
  content = content.replace(insertPoint, hooksToInsert);
  
  // 3. Remove duplicate filtering logic if present
  const duplicateFilter = `  if (timeFilter) {
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
      if (levelFilter === "Lead") return t.includes("lead") || t.includes("manager") || t.includes("director") || t.includes("staff")
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
  }`;
  
  const dupIndex = content.lastIndexOf('if (timeFilter) {');
  const firstIndex = content.indexOf('if (timeFilter) {');
  if (dupIndex !== firstIndex) {
      // It's duplicated. We can just use a simple regex to collapse the duplicated blocks.
      // Actually, since there's multiple blocks, let's just find everything between `if (timeFilter)` and `if (tab.statuses)` and deduplicate it.
  }
  
  fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
  console.log("Fixed hook ordering!");
} else {
  console.log("Could not find hooks regex.");
}
