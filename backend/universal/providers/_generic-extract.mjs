// Shared "sniff job-like links out of an arbitrary response" heuristic —
// ported 1:1 from the Python it replaces (backend/sources/common.py's
// _find_jobs_in_json / _extract_jobs_from_text / is_valid_candidate). Used by
// providers with no stable, documented API shape (api-post.mjs, and any
// bespoke single-company adapter that falls back to link-sniffing rather
// than a known JSON envelope).
//
// Underscore prefix keeps _registry.mjs from loading this as a provider.

// Ported verbatim from backend/sources/common.py (JOB_HREF_HINTS /
// EXCLUDED_HREF_PATTERNS / EXCLUDED_TITLE_PATTERNS) — these accumulated real,
// hard-won exclusions (specific company non-job pages, glassdoor, EEOC,
// shorteners...) from live scraping, not a generic starter list. Keep in
// sync with that file's tuples if either changes; there is now only this one
// copy (common.py's originals are retired along with the Python callers).
const JOB_HREF_HINTS = [
  'requisition', 'posting', 'vacanc', 'gh_jid', 'opening',
  '/jobs/', '/job/', '/position/', '/role/', '/apply',
  'jobid', 'job_id', 'jid=', 'id=', 'req=', 'reqid',
  'detail', 'description', 'profile',
];

const EXCLUDED_HREF_PATTERNS = [
  // Auth / account pages
  'login', 'signin', 'sign-in', 'logout', 'register',
  'dashboard', 'my-profile', 'user/details', 'applicant/',
  // Policy pages
  'privacy', 'cookie', 'terms', 'legal',
  // Generic nav / non-job pages
  'about', 'contact', 'news', 'blog', 'press', 'media',
  'investor', 'alumni', 'supplier',
  'accessibility', 'sitemap', 'faq',
  // Company life/culture/benefits
  'life-at', 'culture', 'benefits', 'diversity', 'inclusion',
  'early-careers', 'business-divisions', 'locations', 'job-categories',
  'business_categories', 'job_categories', 'our-workplace',
  // Saved/My job dashboards
  'saved-jobs', 'saved_jobs', 'my-jobs', 'talent-community', 'join-talent',
  // Specific company non-job pages
  'amazon.jobs/en/search', 'amazon.jobs/content/',
  'apple.com/in/', 'apple.com/shop', 'apple.com/careers/in', 'jobs.apple.com/careers/', 'jobs.apple.com/app/',
  'microsoft.com/en-us', 'microsoft.com/software',
  'xbox.com', 'azure.microsoft.com', 'marketplace.microsoft.com',
  'wellsfargojobs.com/en/resources', 'wellsfargojobs.com/en/well-life', 'wellsfargojobs.com/en/ready-to-work', 'wellsfargojobs.com/en/create-a-job-alert',
  // glassdoor (all TLDs e.g. .co.in), EEOC, shorteners, support
  'glassdoor', 'eeoc.gov', 'bit.ly', 'goo.gl',
  'go.microsoft.com', 'support.google.com', 'support.microsoft.com', 'support.apple.com',
  // nav anchors that are literally anchor links, not job pages
  '#main', '#top', '#footer', '#skip', '#collapse',
];

const EXCLUDED_TITLE_PATTERNS = [
  'saved jobs', 'job search', 'click here', 'access application',
  'log in', 'sign in', 'register', 'apply now',
  'privacy policy', 'cookie', 'terms',
  'life at ', 'about us', 'contact us',
  'view profile', 'view all',
  'skip to', 'join the network', 'join our talent',
  '(english)', '(french)', '(german)', '(spanish)', '(portuguese)',
  '(japanese)', '(polish)', '(dutch)', '(slovak)',
];

/**
 * Pre-filter out obvious garbage links so the AI doesn't waste tokens or hallucinate.
 * @param {string} href
 * @param {string} title
 * @param {boolean} [strictHints]
 */
export function isValidCandidate(href, title, strictHints = false) {
  if (!href || !title) return false;
  if (title.length < 3 || title.length > 200) return false;

  const hl = href.toLowerCase();
  const tl = title.toLowerCase();

  if (EXCLUDED_HREF_PATTERNS.some((p) => hl.includes(p))) return false;
  if (EXCLUDED_TITLE_PATTERNS.some((p) => tl.includes(p))) return false;

  if (strictHints) {
    const hasHint = JOB_HREF_HINTS.some((h) => hl.includes(h));
    const lastPart = href.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
    const hasDigits = /\d/.test(lastPart);
    const pathSegments = href.split('?')[0].split('/').filter(Boolean);
    const isDeepPath = pathSegments.length >= 4;
    if (!(hasHint || hasDigits || isDeepPath)) return false;
  }

  return true;
}

/** Recursively hunts an arbitrary JSON payload for {title, url}-shaped records. */
export function findJobsInJson(data) {
  const jobs = [];
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const title = data.title || data.jobTitle || data.reqTitle || data.name || data.postingTitle;
    const link = data.url || data.jobUrl || data.link || data.id || data.jobId || data.jobReqId || data.postingId;
    if (title && link && typeof title === 'string' && (typeof link === 'string' || typeof link === 'number')) {
      if (isValidCandidate(String(link), title)) jobs.push({ title, href: String(link) });
    }
    for (const v of Object.values(data)) {
      if (v && typeof v === 'object') jobs.push(...findJobsInJson(v));
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') jobs.push(...findJobsInJson(item));
    }
  }
  return jobs;
}

/**
 * Extract {title, href} job candidates from a response body — tries JSON
 * first (any shape, via findJobsInJson), falls back to sniffing <a href>
 * links out of HTML.
 * @param {string} text
 * @param {string} baseUrl
 */
export function extractJobsFromText(text, baseUrl) {
  try {
    const data = JSON.parse(text);
    const jobs = findJobsInJson(data).map((j) => ({
      ...j,
      href: /^https?:\/\//i.test(j.href) ? j.href : new URL(j.href, baseUrl).href,
    }));
    if (jobs.length) return jobs;
  } catch {
    /* not JSON — fall through to HTML link-sniffing */
  }

  const jobs = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(text)) !== null) {
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (title.length < 3) continue;
    let href;
    try {
      href = new URL(m[1], baseUrl).href;
    } catch {
      continue;
    }
    if (isValidCandidate(href, title)) jobs.push({ title, href });
  }
  return jobs;
}
