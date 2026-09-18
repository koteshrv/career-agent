// Bridge between Python (backend/sources/universal_api.py) and the vendored
// career-ops-style provider layer (backend/universal/providers/). Takes one
// full PortalEntry as a JSON argv (not just a bare URL), so a targets.json
// row's explicit `provider`/`api`/vendor-config keys (e.g. `amazon: {...}`,
// `ibm: {...}`) route the same way they would in career-ops's own portals.yml
// — not just entries that happen to be detectable from careers_url alone.
//
// Usage: node bridge.mjs '{"name":"IBM","provider":"ibm","ibm":{"country":"India"}}'
import { loadProviders, resolveProvider } from './providers/_registry.mjs';
import { makeHttpCtx } from './providers/_http.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  let entry;
  try {
    entry = JSON.parse(process.argv[2] || '');
  } catch {
    console.log(JSON.stringify({ error: "argv[2] must be a JSON PortalEntry object" }));
    return;
  }
  if (!entry || typeof entry !== 'object') {
    console.log(JSON.stringify({ error: "argv[2] must be a JSON PortalEntry object" }));
    return;
  }

  const providers = await loadProviders(path.join(__dirname, 'providers'));
  const resolved = resolveProvider(entry, providers);

  if (!resolved || !resolved.provider) {
    console.log(JSON.stringify({ error: resolved?.error || "No provider found" }));
    return;
  }

  const ctx = makeHttpCtx();
  try {
    const detectResult = resolved.provider.detect ? resolved.provider.detect(entry) : null;
    const resolvedEntry = detectResult ? { ...entry, ...detectResult } : entry;
    const jobs = await resolved.provider.fetch(resolvedEntry, ctx);
    console.log(JSON.stringify({ provider: resolved.provider.id, jobs }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
  }
}

main();
