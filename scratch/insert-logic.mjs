import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const lines = content.split('\n');
const index = lines.findIndex(l => l.includes('if (tab.statuses) tabJobs = tabJobs.filter'));

const logic = `
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
  }
`;

lines.splice(index, 0, logic);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', lines.join('\n'));
console.log("Logic injected!");
