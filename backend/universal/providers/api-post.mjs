// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Generic templated-POST provider — for a career site with no known ATS
// vendor and no stable documented API, where the site's own search POSTs a
// keyword-substituted payload and returns a JSON or HTML blob to sniff links
// out of. Explicit-only (`provider: api-post`, no detect()): this is a
// fallback of last resort, never auto-claimed.
//
// Config on the entry (career-agent's own extension — not a career-ops
// contract field):
//   provider: api-post
//   url: https://example.com/search
//   headers: { "Content-Type": "application/x-www-form-urlencoded" }
//   payload: "q={keyword}&country=IN"      # {keyword} substituted per entry.keywords
//   no_results_text: "0 results"            # lowercase substring meaning "empty page"
//   keywords: ["software", "engineer"]      # injected by universal_api.py from Settings

import { fetchTextWithRetry, makeHttpCtx } from './_http.mjs';
import { extractJobsFromText } from './_generic-extract.mjs';

/** @type {Provider} */
export default {
  id: 'api-post',

  async fetch(entry, ctx) {
    const url = entry.url || entry.careers_url;
    if (!url) throw new Error('api-post: entry.url is required');

    const headers = entry.headers || {};
    const payloadTemplate = entry.payload || '';
    const noResultsText = String(entry.no_results_text || '0').toLowerCase();
    const keywords = Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords : [''];

    const isFormEncoded = String(headers['Content-Type'] || headers['content-type'] || '')
      .toLowerCase().includes('x-www-form-urlencoded');

    const seen = new Set();
    const jobs = [];
    for (const keyword of keywords) {
      const kwVal = isFormEncoded ? encodeURIComponent(keyword) : keyword;
      const body = payloadTemplate.replaceAll('{keyword}', kwVal);
      let text;
      try {
        text = await fetchTextWithRetry(ctx, url, { method: 'POST', headers, body, redirect: 'error' });
      } catch (err) {
        console.error(`⚠️  api-post: ${entry.name} (keyword "${keyword}") — ${err.message}`);
        continue;
      }
      if (text.toLowerCase().includes(noResultsText)) continue;

      for (const { title, href } of extractJobsFromText(text, url)) {
        if (!title || !href || seen.has(href)) continue;
        seen.add(href);
        jobs.push({ title, url: href, company: entry.name, location: '' });
      }
    }
    return jobs;
  },
};
