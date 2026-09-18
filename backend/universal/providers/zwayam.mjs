// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Zwayam — a multi-tenant Indian ATS (used by e.g. Zepto). No public
// documented API; the tenant's own careers page POSTs a hand-built
// multipart/form-data body (no `boundary=` library needed — the shape is
// fixed and small) to a per-tenant search endpoint. Explicit-only
// (`provider: zwayam`, no detect() — every tenant's `api_url` is on its own
// subdomain with no shared host pattern to match).
//
// Config on the entry: api_url, domain, company_id (all required).

import { fetchTextWithRetry, makeHttpCtx } from './_http.mjs';
import { isValidCandidate } from './_generic-extract.mjs';

const BOUNDARY = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

function buildMultipartBody(fields) {
  const parts = Object.entries(fields).map(
    ([name, value]) => `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  return parts.join('') + `--${BOUNDARY}--\r\n`;
}

/** @type {Provider} */
export default {
  id: 'zwayam',

  async fetch(entry, ctx) {
    const apiUrl = entry.api_url;
    const domain = entry.domain;
    const companyId = entry.company_id;
    if (!apiUrl || !domain || !companyId) {
      throw new Error('zwayam: entry.api_url, entry.domain, and entry.company_id are all required');
    }

    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    const filterCri = {
      paginationStartNo: 0,
      selectedCall: 'sort',
      sortCriteria: { name: 'modifiedDate', isAscending: false },
      ...(keywords.length ? { anyOfTheseWords: keywords.join(' OR ') } : {}),
    };

    const body = buildMultipartBody({
      filterCri: JSON.stringify(filterCri),
      domain,
      companyId,
    });

    const headers = {
      Origin: `https://${domain}`,
      Referer: `https://${domain}/`,
      'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
    };

    const text = await fetchTextWithRetry(ctx, apiUrl, { method: 'POST', headers, body, redirect: 'error' });

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Some tenants prefix the JSON with an XSSI guard, e.g. })]}',\n{...}
      const withoutGuard = text.startsWith(")]}',\n") ? text.slice(text.indexOf('\n') + 1) : text;
      data = JSON.parse(withoutGuard);
    }

    let jobList = [];
    if (data?.data?.data && Array.isArray(data.data.data)) {
      jobList = data.data.data.map((hit) => (hit && typeof hit === 'object' ? hit._source || hit : hit));
    } else if (Array.isArray(data?.jobList)) {
      jobList = data.jobList;
    }

    const jobs = [];
    for (const job of jobList) {
      const title = job?.title || job?.jobTitle || '';
      if (!title) continue;
      const jid = job?.id || job?.jobId || '';
      const seoUrl = job?.jobUrl || job?.jobview || job?.seoUrl || '';
      const url = `https://${domain}/jobview/${seoUrl || jid}`;
      if (!isValidCandidate(url, title, true)) continue;
      jobs.push({ title, url, company: entry.name || domain, location: '' });
    }
    return jobs;
  },
};
