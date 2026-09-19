import fs from 'fs';
let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

if (!content.includes('const location = useLocation()') && content.includes('function Layout() {')) {
  content = content.replace(
    'function Layout() {',
    'function Layout() {\n  const location = useLocation();'
  );
}

fs.writeFileSync('frontend/src/App.tsx', content);
console.log("location added to Layout!");
