// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { fetchJsonWithRetry, sleep } from './_http.mjs';

const DEFAULT_MAX_PAGES = 100;
const MAX_PAGES_CAP = 1500;

function resolveMaxPages(entry) {
  const v = entry?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

/** @type {Provider} */
export default {
  id: 'tcs',

  async fetch(entry, ctx) {
    const keywords = Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords : [''];
    
    // 1. Hit the CSRF endpoint to initialize the session and get the tokens
    // We expect a 401 here. We need the Set-Cookie array and X-NEXT-XSRF-TOKEN from the headers.
    // If ctx.fetchResponse throws on 401, we use native fetch to get the raw headers.
    let initRes;
    try {
      initRes = await fetch('https://ibegin.tcsapps.com/candidate/next/api/en-IN/csrf', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        redirect: 'error'
      });
    } catch (err) {
      console.error(`⚠️ tcs: CSRF initialization failed — ${err.message}`);
      return [];
    }
    
    // Extract cookies robustly using getSetCookie
    const cookiesArr = typeof initRes.headers.getSetCookie === 'function' ? initRes.headers.getSetCookie() : [];
    const cookiesMap = {};
    for (const c of cookiesArr) {
      const parts = c.split(';');
      const [key, ...valParts] = parts[0].split('=');
      cookiesMap[key] = valParts.join('=');
    }
    
    const cookieStr = Object.entries(cookiesMap).map(([k,v]) => `${k}=${v}`).join('; ');
    const token = initRes.headers.get('X-NEXT-XSRF-TOKEN') || cookiesMap['XSRF-TOKEN'];

    if (!token) {
      console.error("⚠️ tcs: Failed to retrieve XSRF token from session initialization.");
      return [];
    }

    const seen = new Set();
    const jobs = [];

    const ctxMaxPages = Number(ctx?.maxPages);
    const ctxCap = ctxMaxPages > 0 ? ctxMaxPages : Infinity;
    const maxPages = Math.min(resolveMaxPages(entry), ctxCap);

    for (const keyword of keywords) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= maxPages) {
        if (page > 1) {
          await sleep(250, ctx);
        }

        const payload = {
          includeRegularJob: true,
          includeWalkIn: true,
          searchTerms: keyword ? [keyword] : [],
          jobLocationFilters: [],
          jobDomainFilters: [],
          experienceLevelFilters: [],
          skillFilters: [],
          relevancySortOrder: "desc",
          recentSortOrder: null,
          lastDateToApplySortOrder: null,
          page: page,
          resultsPerPage: 50
        };

        let resBody;
        try {
          resBody = await fetchJsonWithRetry(ctx, 'https://ibegin.tcsapps.com/candidate/next/api/en-IN/search/jobs', {
            method: 'POST',
            headers: {
              "Accept": "application/json, text/plain, */*",
              "Content-Type": "application/json",
              "NEXT-XSRF-TOKEN": token,
              "Cookie": cookieStr,
              "Origin": "https://ibegin.tcsapps.com",
              "Referer": "https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/search",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            body: JSON.stringify(payload),
            redirect: 'error'
          });
        } catch (err) {
          if (err.name === 'ProbePageBudgetReached' || err.constructor.name === 'ProbePageBudgetReached') {
            throw err;
          }
          console.warn(`⚠️ tcs: Search pagination failed on page ${page} — ${err.message}`);
          break;
        }

        if (!resBody?.payload?.content || resBody.payload.content.length === 0) {
          break;
        }

        totalPages = resBody.payload.totalPages || 1;

        for (const job of resBody.payload.content) {
          if (!job.id || seen.has(job.id)) continue;
          seen.add(job.id);
          
          jobs.push({
            title: job.title || 'Unknown Title',
            url: `https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/${job.id}`,
            company: entry.name || 'Tata Consultancy Services',
            location: job.location || 'Unknown'
          });
        }
        
        page++;
      }
    }

    return jobs;
  }
};
