import fs from 'fs';

let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

// 1. Add Import
if (!content.includes('import { ExplorePage }')) {
  content = content.replace(
    'import { SettingsPage } from "./components/SettingsPage"',
    'import { SettingsPage } from "./components/SettingsPage"\nimport { ExplorePage } from "./components/ExplorePage"'
  );
}

// 2. Add Icon import (Rocket)
if (!content.includes('Rocket,')) {
  content = content.replace(
    'Briefcase, CalendarClock, Zap, LineChart, Database, History, Settings, Moon, Sun, Menu, User, LogOut',
    'Briefcase, CalendarClock, Zap, LineChart, Database, History, Settings, Moon, Sun, Menu, User, LogOut, Rocket'
  );
}

// 3. Update NAV array
const oldNav = '{ to: "/app/knowledge", label: "Knowledge Base", title: "Career Knowledge Base", subtitle: "Manage your career history for RAG generation.", icon: Database },';
const newNav = '{ to: "/app/explore", label: "Explore", title: "Explore", subtitle: "Scan the public ATS network for fresh postings.", icon: Rocket },';
content = content.replace(oldNav, newNav);

// 4. Update Route mapping
const oldRoute = '<Route path="knowledge" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 md:p-8"><KnowledgeBasePage /></div>} />';
const newRoute = '<Route path="explore" element={<div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-6 md:px-8 pb-6 md:pb-8"><ExplorePage /></div>} />';
content = content.replace(oldRoute, newRoute);

fs.writeFileSync('frontend/src/App.tsx', content);
console.log("App.tsx patched!");
