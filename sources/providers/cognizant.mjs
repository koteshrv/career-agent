// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Cognizant provider — migrated to Happy Dance (Ph.Creative).
// The main frontend (careers.cognizant.com) is heavily protected by Cloudflare
// Bot Fight Mode. However, the standard `sitemap.xml` is exposed publicly
// for search engine indexing. By extracting the canonical `global-en/jobs/`
// URLs from the sitemap, we accurately discover the entire live job inventory
// (2,000+ jobs) in a single request, completely bypassing Cloudflare's JS challenges.

import { fetchTextWithRetry } from './_http.mjs'

const SITEMAP_URL = 'https://careers.cognizant.com/sitemap.xml'

// Helper to convert a slug like "senior-software-engineer" to "Senior Software Engineer"
function titleCase (slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** @type {Provider} */
export default {
  id: 'cognizant',

  async fetch (entry, ctx) {
    // 1. Fetch the giant XML sitemap text
    const text = await fetchTextWithRetry(ctx, SITEMAP_URL)

    const jobs = []

    // We only want the canonical global English URLs to avoid duplicating
    // the same job across 20 different localized path variations (e.g. apj-en).
    // The sitemap structure puts <lastmod> immediately after <loc>.
    const locRegex = /<loc>(https:\/\/careers\.cognizant\.com\/global-en\/jobs\/\d+\/([^<]+)\/)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/gi

    let match
    while ((match = locRegex.exec(text)) !== null) {
      const url = match[1]
      const slug = match[2]
      const dateStr = match[3]

      const ms = Date.parse(dateStr)

      jobs.push({
        title: titleCase(slug) || 'Unknown',
        url,
        company: entry.name || 'Cognizant',
        location: 'Unknown', // Location is not in the sitemap URL
        postedAt: Number.isFinite(ms) ? ms : undefined
      })
    }

    return jobs
  }
}
