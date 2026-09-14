import { loadProviders, resolveProvider } from './universal/providers/_registry.mjs';
import { makeHttpCtx } from './universal/providers/_http.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.argv[2];
  if (!url) { console.error(JSON.stringify({ error: "URL required" })); process.exit(1); }
  
  const providers = await loadProviders(path.join(__dirname, 'universal/providers'));
  
  const entry = { careers_url: url, name: "Test" };
  const providerDef = resolveProvider(entry, providers);
  
  if (!providerDef || !providerDef.provider) {
    console.log(JSON.stringify({ error: "No provider found" }));
    return;
  }
  
  const ctx = makeHttpCtx();
  try {
    const detectResult = providerDef.provider.detect ? providerDef.provider.detect(entry) : null;
    const resolvedEntry = detectResult ? { ...entry, ...detectResult } : entry;
    const jobs = await providerDef.provider.fetch(resolvedEntry, ctx);
    console.log(JSON.stringify({ provider: providerDef.provider.id, jobs: jobs }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
  }
}

main();
