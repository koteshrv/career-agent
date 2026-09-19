const fs = require('fs');
let code = fs.readFileSync('sources/providers/ripplehire.mjs', 'utf8');

code = code.replace(/const jobList = json\.data\.candidateJobDTO.*$/m, 'const data = json.data || json;\n            const jobList = data.candidateJobDTO || data.candidateJobFilterDTO || [];');
code = code.replace(/totalCount = json\.data\.totalJobCount \|\| 0;/g, 'totalCount = data.totalJobCount || data.totalJobs || 0;');
code = code.replace(/if \(\!json \|\| \!json\.data\) \{ console\.log\("NO JSON OR DATA", json\); break; \}/g, 'if (!json) break;');

fs.writeFileSync('sources/providers/ripplehire.mjs', code);
