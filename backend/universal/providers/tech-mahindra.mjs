// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Tech Mahindra careers portal — a classic ASP.NET WebForms search page (no
// public JSON API). The search box is a postback: GET the page for a fresh
// __VIEWSTATE/__VIEWSTATEGENERATOR/__EVENTVALIDATION triple, then POST them
// back alongside the keyword in the async-postback form fields the page's
// own JS sends. Single-company adapter (ported from the working Python
// version this replaces) — explicit-only, no detect().

import { fetchTextWithRetry, makeHttpCtx } from './_http.mjs';
import { extractJobsFromText } from './_generic-extract.mjs';

const ASPNET_FIELD_RE = (name) => new RegExp(`id="${name}"\\s+value="(.*?)"`);

/** @type {Provider} */
export default {
  id: 'tech-mahindra',

  async fetch(entry, ctx) {
    const url = entry.url || entry.careers_url || 'https://careers.techmahindra.com/';
    const noResultsText = String(entry.no_results_text || '0 results').toLowerCase();
    const keywords = Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords : [''];

    const headers = {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    };

    const seen = new Set();
    const jobs = [];
    for (const keyword of keywords) {
      let getText;
      try {
        getText = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
      } catch (err) {
        console.error(`⚠️  tech-mahindra: page fetch failed — ${err.message}`);
        continue;
      }

      const viewstate = getText.match(ASPNET_FIELD_RE('__VIEWSTATE'))?.[1];
      const viewstategen = getText.match(ASPNET_FIELD_RE('__VIEWSTATEGENERATOR'))?.[1];
      const eventval = getText.match(ASPNET_FIELD_RE('__EVENTVALIDATION'))?.[1];
      if (viewstate === undefined || viewstategen === undefined || eventval === undefined) {
        console.error('⚠️  tech-mahindra: ASP.NET postback fields not found — page layout may have changed');
        continue;
      }

      const payload = new URLSearchParams({
        'ctl00$ContentPlaceHolder1$ScriptManager1': 'ctl00$ContentPlaceHolder1$ctl04|ctl00$ContentPlaceHolder1$btnFreeSearch',
        'ctl00$ContentPlaceHolder1$RblList': 'IT',
        'ctl00$ContentPlaceHolder1$txtAdvanceSearch': keyword,
        'ctl00$ContentPlaceHolder1$txtFirstName': '',
        'ctl00$ContentPlaceHolder1$txtLastName': '',
        'ctl00$ContentPlaceHolder1$ddlNationality': 'IND',
        'ctl00$ContentPlaceHolder1$ddlTotExpYears': 'Select Experience *',
        'ctl00$ContentPlaceHolder1$txtUserName': '',
        'ctl00$ContentPlaceHolder1$ddlType': 'Select',
        'ctl00$ContentPlaceHolder1$txtSkills': '',
        'ctl00$ContentPlaceHolder1$ddlcountrycode': 'Select country code *',
        'ctl00$ContentPlaceHolder1$txt_MobileNumber': '',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__LASTFOCUS': '',
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': viewstategen,
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': eventval,
        '__ASYNCPOST': 'true',
        'ctl00$ContentPlaceHolder1$btnFreeSearch': 'Search',
      });

      let postText;
      try {
        postText = await fetchTextWithRetry(ctx, url, { method: 'POST', headers, body: payload.toString(), redirect: 'error' });
      } catch (err) {
        console.error(`⚠️  tech-mahindra: search postback failed (keyword "${keyword}") — ${err.message}`);
        continue;
      }
      if (postText.toLowerCase().includes(noResultsText)) continue;

      for (const { title, href } of extractJobsFromText(postText, url)) {
        if (!title || !href || seen.has(href)) continue;
        seen.add(href);
        jobs.push({ title, url: href, company: entry.name || 'Tech Mahindra', location: '' });
      }
    }
    return jobs;
  },
};
