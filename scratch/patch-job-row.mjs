import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const oldRow = `        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate" title={job.title}>{job.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {job.company}{loc ? \` · \${loc}\` : ""}
          </p>
        </div>`;

const newRow = `        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground truncate">
              {job.company} <span className="text-muted-foreground font-normal">·</span> {job.title}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            {loc && <span className="truncate max-w-[200px]">{loc}</span>}
            <span className="shrink-0">{formatISTDate(job.created_at).split(' ')[0]}</span>
            <span className="shrink-0 italic">{job.match_score ? \`Score \${job.match_score}\` : "not scored"}</span>
          </div>
        </div>`;

content = content.replace(oldRow, newRow);

fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
console.log("Row patched");
