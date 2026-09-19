// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Accenture (ElasticSearch /findjobs API)
// Auto-detects from accenture careers url e.g. https://www.accenture.com/in-en/careers/jobsearch

import { fetchJsonWithRetry, sleep } from './_http.mjs';

const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGES_CAP = 1500;
const INTER_PAGE_DELAY_MS = 250;

function resolveMaxPages(entry) {
  const v = entry?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

/** @type {Provider} */
export default {
  id: 'accenture',
  detect(entry) {
    if (!entry?.careers_url) {
      if (entry?.provider === 'accenture') return { url: 'https://www.accenture.com/us-en/careers/jobsearch' };
      return null;
    }
    try {
      const u = new URL(entry.careers_url);
      if (u.hostname === 'www.accenture.com' && u.pathname.includes('/careers')) {
        return { url: entry.careers_url };
      }
    } catch {
      // malformed url
    }
    return null;
  },
  async fetch(entry, ctx) {
    const ctxMaxPages = Number(ctx?.maxPages);
    const ctxCap = ctxMaxPages > 0 ? ctxMaxPages : Infinity;
    const pagesToFetch = Math.min(resolveMaxPages(entry), ctxCap);

    let siteLang = 'us-en';
    if (entry?.careers_url) {
      try {
        const u = new URL(entry.careers_url);
        // e.g. /in-en/careers/...
        const parts = u.pathname.split('/');
        if (parts.length > 1 && parts[1].includes('-')) {
          siteLang = parts[1];
        }
      } catch {
        // use default
      }
    }

    const keywords = Array.isArray(entry?.keywords) && entry.keywords.length > 0
      ? entry.keywords
      : [''];

    let jobs = [];

    for (const kw of keywords) {
      let page = 0;
      let totalForKeyword = 0;

      while (page < pagesToFetch) {
        if (page > 0 || (page === 0 && kw !== keywords[0])) {
          await sleep(INTER_PAGE_DELAY_MS, ctx);
        }

        const startIndex = page * PAGE_SIZE;

        // Construct the FormData payload
        const payload = new FormData();
        payload.append('startIndex', startIndex.toString());
        payload.append('maxResultSize', PAGE_SIZE.toString());
        payload.append('jobKeyword', kw);
        payload.append('jobCountry', '');
        payload.append('jobLanguage', '');
        payload.append('countrySite', siteLang);
        payload.append('sortBy', '2'); // recent
        payload.append('searchType', 'vectorSearch');
        payload.append('enableQueryBoost', 'true');
        payload.append('minScore', '0.6');
        payload.append('getFeedbackJudgmentEnabled', 'true');
        payload.append('useCleanEmbedding', 'true');
        payload.append('score', 'true');
        payload.append('totalHits', 'true');
        payload.append('debugQuery', 'false');
        payload.append('jobFilters', '[]');

        let data;
        try {
          data = await fetchJsonWithRetry(
            ctx,
            'https://www.accenture.com/api/accenture/elastic/findjobs',
            {
              method: 'POST',
              body: payload,
              redirect: 'error'
            }
          );
        } catch (err) {
          if (ctx.maxPages) throw err; // propagate probe errors
          console.warn(`[accenture] fetch error on keyword "${kw}", page ${page}:`, err);
          break; // keep partial jobs
        }

        if (!data || !data.data || data.data.length === 0) {
          break; // no more jobs
        }

        for (const item of data.data) {
          if (!item.title || !item.jobDetailUrl) continue;

          let url = item.jobDetailUrl.replace('{0}', siteLang);
          if (url.startsWith('/')) {
            url = 'https://www.accenture.com' + url;
          }

          let postedAt = undefined;
          if (item.updateDate) {
            const parsed = Date.parse(item.updateDate);
            if (!Number.isNaN(parsed)) {
              postedAt = parsed;
            }
          }

          jobs.push({
            title: item.title,
            url,
            company: 'Accenture',
            location: item.country || '',
            postedAt
          });
        }
        
        totalForKeyword += data.data.length;
        if (data.data.length < PAGE_SIZE) {
          break; // last page
        }
        
        page++;
      }
      
      if (page === resolveMaxPages(entry) && !ctxMaxPages) {
        console.warn(`[accenture] raise max_pages on this entry, capped at ${page}`);
      }
    }

    // Dedup jobs just in case keywords overlap
    const seen = new Set();
    const deduped = [];
    for (const job of jobs) {
      if (!seen.has(job.url)) {
        seen.add(job.url);
        deduped.push(job);
      }
    }
    
    return deduped;
  }
};
