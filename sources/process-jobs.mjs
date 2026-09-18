// Fetches (when needed) and processes a batch of job postings: visible text,
// SimHash fingerprint (career-ops's fingerprint-core.mjs design), and
// liveness classification (its liveness-core.mjs design) — see
// process-content.mjs for those two. Every step that touches scraped ATS
// content lives here; Python only orchestrates the DB side (comparing two
// already-computed fingerprints, deciding what a status change means).
//
// Usage: node process-jobs.mjs '{"https://url1": null, "https://url2": "already-known text..."}'
//   - value `null`            -> fetch the URL, then process the fetched text
//   - value a non-empty string -> already have the text (e.g. the Chrome
//                                 extension or a universal provider supplied
//                                 it for free) — skip the fetch, just process it
// Prints: {"https://url1": {"text": "...", "fingerprint": "...", "liveness": "active"}, ...}

import { fetchTextWithRetry, makeHttpCtx } from './providers/_http.mjs';
import { decodeEntities } from './providers/_html-entities.mjs';
import { computeSimhash, classifyLiveness } from './process-content.mjs';

function htmlToText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

async function processOne(ctx, url, existingText) {
  let text = existingText || '';
  if (!text) {
    try {
      const html = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
      text = htmlToText(html);
    } catch (err) {
      console.error(`⚠️  ${url}: ${err.message}`);
    }
  }
  return [url, { text, fingerprint: computeSimhash(text), liveness: classifyLiveness(text) }];
}

async function main() {
  let items;
  try {
    items = JSON.parse(process.argv[2] || '{}');
  } catch {
    console.error(JSON.stringify({ error: 'argv[2] must be a JSON object of {url: text|null}' }));
    process.exit(1);
  }

  const ctx = makeHttpCtx();
  const pairs = await Promise.all(
    Object.entries(items).map(([url, existingText]) => processOne(ctx, url, existingText)),
  );
  console.log(JSON.stringify(Object.fromEntries(pairs)));
}

main();
