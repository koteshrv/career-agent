import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

content = content.replace(
  /\{(\["Intern", "Junior", "Mid", "Senior", "Lead"\]\.map\(f => \()([\s\S]*?)(\)\)\})/,
  `{["Intern", "Junior", "Mid", "Senior", "Lead"].map(f => {
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

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
