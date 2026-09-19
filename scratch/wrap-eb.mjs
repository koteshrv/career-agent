import fs from 'fs';
let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');
if (!content.includes('ErrorBoundary')) {
  content = "import { ErrorBoundary } from './components/ErrorBoundary';\n" + content;
  content = content.replace('<JobsBoard />', '<ErrorBoundary><JobsBoard /></ErrorBoundary>');
  fs.writeFileSync('frontend/src/App.tsx', content);
}
