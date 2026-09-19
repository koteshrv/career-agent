import fs from 'fs';

let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

// We should move OnboardingPage out of Layout OR make OnboardingGuard allow /app/onboarding route.
// Let's modify OnboardingGuard to allow passing through if location.pathname === '/app/onboarding'

const newGuardComponent = `
import { useLocation } from "react-router-dom";

function OnboardingGuard({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (IS_DEMO) {
      setLoading(false);
      return;
    }
    fetch("/api/onboarding/me", {
      headers: { "Authorization": \`Bearer \${getToken()}\` }
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
    })
    .then(data => {
        if (!data.onboarding_completed) {
            setNeedsOnboarding(true);
        } else {
            setNeedsOnboarding(false);
        }
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, [location.pathname]);

  if (loading) return null;
  if (needsOnboarding && location.pathname !== "/app/onboarding") {
      return <Navigate to="/app/onboarding" replace />;
  }
  if (!needsOnboarding && location.pathname === "/app/onboarding") {
      return <Navigate to="/app/explore" replace />;
  }
  
  return <>{children}</>;
}
`;

// Replace the old guard component
content = content.replace(/function OnboardingGuard\(\{ children \}: \{ children: ReactNode \}\) \{[\s\S]*?return <>\s*\{children\}\s*<\/>;\n\}/, newGuardComponent);

// Add missing import for useLocation
if (!content.includes('useLocation')) {
    content = content.replace('import { useNavigate', 'import { useNavigate, useLocation');
    // if useNavigate is not imported in App.tsx but Navigate is:
    content = content.replace('import { Navigate', 'import { Navigate, useLocation');
    if (!content.includes('useLocation')) {
      content = content.replace('} from "react-router-dom"', ', useLocation } from "react-router-dom"');
    }
}

// But wait, if we are in Layout, we don't want the sidebar to show when doing onboarding.
// Let's hide the sidebar in Layout if location.pathname === '/app/onboarding'
const layoutRegex = /<aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0 h-screen sticky top-0">/;
content = content.replace(layoutRegex, '{location.pathname !== "/app/onboarding" && (<aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0 h-screen sticky top-0">');
content = content.replace(/<\/nav>\n\s*<\/aside>/, '</nav>\n          </aside>)}');

const topbarRegex = /<header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 z-\[60\] sticky top-0 gap-4">/;
content = content.replace(topbarRegex, '{location.pathname !== "/app/onboarding" && (<header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 z-[60] sticky top-0 gap-4">');
content = content.replace(/<\/header>/, '</header>)}');


fs.writeFileSync('frontend/src/App.tsx', content);
console.log("App.tsx routing fixed!");
