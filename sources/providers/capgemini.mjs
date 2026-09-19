// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { fetchJsonWithRetry, sleep } from './_http.mjs'

const PAGE_SIZE = 200
const DEFAULT_MAX_PAGES = 50
const MAX_PAGES_CAP = 100

function resolveMaxPages (entry) {
  const v = entry?.max_pages
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP)
  return DEFAULT_MAX_PAGES
}

/** @type {Provider} */
export default {
  id: 'capgemini',

  async fetch (entry, ctx) {
    const ctxMaxPages = Number(ctx?.maxPages)
    const ctxCap = ctxMaxPages > 0 ? ctxMaxPages : Infinity
    const pagesToFetch = Math.min(resolveMaxPages(entry), ctxCap)

    const jobs = []
    const seen = new Set()

    for (let page = 1; page <= pagesToFetch; page++) {
      if (page > 1) await sleep(200, ctx)

      const url = new URL('https://cg-jobstream-api.azurewebsites.net/api/job-search')
      url.searchParams.set('page', String(page))
      url.searchParams.set('size', String(PAGE_SIZE))
      if (entry.keyword) {
        url.searchParams.set('search', entry.keyword)
      }

      let json
      try {
        json = await fetchJsonWithRetry(ctx, url.toString(), {
          headers: { Accept: 'application/json' }
        })
      } catch (err) {
        if (ctxCap !== Infinity) throw err
        console.warn(`⚠️ capgemini: fetch failed at page ${page} — ${err.message}`)
        break
      }

      const list = json?.data
      if (!Array.isArray(list)) {
        if (page === 1) throw new Error('capgemini: expected json.data to be an array')
        break
      }

      if (list.length === 0) break

      for (const job of list) {
        const title = String(job.title || '').trim()
        const jid = String(job.ref || '')
        const urlStr = String(job.apply_job_url || '')

        if (!title || !urlStr || seen.has(jid || urlStr)) continue
        seen.add(jid || urlStr)

        let ms = Date.parse(job.updated_at || job.indexed_at)
        ms = Number.isFinite(ms) ? ms : undefined

        jobs.push({
          title,
          url: urlStr,
          company: entry.name || 'Capgemini',
          location: job.location || 'Unknown',
          postedAt: ms
        })
      }

      if (list.length < PAGE_SIZE) break
    }

    return jobs
  }
}
