import fs from 'fs';

// 1. Patch App.tsx (Move Explore after Home)
let appContent = fs.readFileSync('frontend/src/App.tsx', 'utf8');

const navStart = appContent.indexOf('const NAV = [');
const navEnd = appContent.indexOf(']', navStart);
const navText = appContent.substring(navStart, navEnd + 1);

// Parse the array lines manually
const navLines = navText.split('\n');
const homeLineIndex = navLines.findIndex(line => line.includes('"/app/home"'));
const exploreLineIndex = navLines.findIndex(line => line.includes('"/app/explore"'));

if (homeLineIndex !== -1 && exploreLineIndex !== -1) {
  const exploreLine = navLines.splice(exploreLineIndex, 1)[0];
  navLines.splice(homeLineIndex + 1, 0, exploreLine);
  
  const newNavText = navLines.join('\n');
  appContent = appContent.replace(navText, newNavText);
  fs.writeFileSync('frontend/src/App.tsx', appContent);
  console.log("Moved Explore after Home in App.tsx!");
} else {
  console.log("Could not find Home or Explore in NAV array!");
}


// 2. Patch ExplorePage.tsx (Remove Scan and AI Search)
let exploreContent = fs.readFileSync('frontend/src/components/ExplorePage.tsx', 'utf8');

const toggleBlockRegex = /<div className="flex bg-secondary\/50 rounded-lg p-1 border border-border">[\s\S]*?<\/div>\s*<\/div>\s*\{\/\* Main Form Card \*\/\}/;
exploreContent = exploreContent.replace(toggleBlockRegex, '</div>\n\n      {/* Main Form Card */}');

const stateRegex = /const \[activeTab, setActiveTab\] = useState<"scan" \| "ai">\("scan"\)\n  /;
exploreContent = exploreContent.replace(stateRegex, '');

fs.writeFileSync('frontend/src/components/ExplorePage.tsx', exploreContent);
console.log("Removed Scan and AI Search from ExplorePage.tsx!");

