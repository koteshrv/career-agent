import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const titleHtml = `
      {/* Title */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{jobs.filter(j => j.status === 'NEW').length}</span> in inbox -{" "}
          <span className="tabular-nums">{jobs.filter(j => j.status !== 'NEW' && j.status !== 'TRASH').length}</span> tracked
        </p>
      </div>

      {/* Controls Bar */}
`;

content = content.replace('      {/* Controls Bar */}', titleHtml);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Title added!");
