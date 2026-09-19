// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { fetchJsonWithRetry } from './_http.mjs'

/** @type {Provider} */
export default {
  id: 'infosys',

  async fetch (entry, ctx) {
    const url = 'https://intapgateway.infosysapps.com/careersci/search/intapjbsrch/getCareerSearchJobs?sourceId=1,21&searchText=ALL'

    const headers = {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://career.infosys.com',
      Referer: 'https://career.infosys.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    let res
    try {
      res = await fetchJsonWithRetry(ctx, url, {
        method: 'GET',
        headers,
        redirect: 'error'
      })
    } catch (err) {
      console.error(`⚠️ infosys: Search fetch failed — ${err.message}`)
      return []
    }

    if (!Array.isArray(res)) {
      console.error('⚠️ infosys: Expected JSON array in response')
      return []
    }

    const seen = new Set()
    const jobs = []

    for (const job of res) {
      const refCode = job.referenceCode || job.postingId || job.requisitionId
      if (!refCode || seen.has(refCode)) continue
      seen.add(refCode)

      jobs.push({
        title: job.postingTitle || 'Unknown Title',
        url: `https://career.infosys.com/jobdesc?jobReferenceCode=${refCode}`,
        company: entry.name || 'Infosys',
        location: job.location || 'Unknown'
      })
    }

    return jobs
  }
}
