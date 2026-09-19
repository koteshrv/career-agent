import fs from 'fs';

let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

// 1. Add OnboardingPage import
if (!content.includes('import { OnboardingPage }')) {
  content = content.replace(
    'import { ExplorePage } from "./components/ExplorePage"',
    'import { ExplorePage } from "./components/ExplorePage"\nimport { OnboardingPage } from "./components/OnboardingPage"'
  );
}

// 2. Add OnboardingGuard component
const guardComponent = `
function OnboardingGuard({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
        }
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  if (loading) return null; // or a spinner
  if (needsOnboarding) return <Navigate to="/app/onboarding" replace />;
  return <>{children}</>;
}
`;

if (!content.includes('OnboardingGuard')) {
  content = content.replace('function App() {', guardComponent + '\nfunction App() {');
}

// 3. Wrap Layout in OnboardingGuard and add onboarding route
if (!content.includes('path="onboarding"')) {
  content = content.replace(
    '<Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>',
    '<Route path="/app" element={<RequireAuth><OnboardingGuard><Layout /></OnboardingGuard></RequireAuth>}>'
  );
  
  content = content.replace(
    '<Route index element={<Navigate to="/app/home" replace />} />',
    '<Route index element={<Navigate to="/app/home" replace />} />\n        <Route path="onboarding" element={<OnboardingPage />} />'
  );
}

fs.writeFileSync('frontend/src/App.tsx', content);
console.log("App.tsx patched for Onboarding!");
