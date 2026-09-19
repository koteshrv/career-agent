import { fetchTextWithRetry, sleep } from "./_http.mjs";

/**
 * Google jobs provider (using batchexecute RPC)
 * @param {Object} entry
 * @param {Object} ctx
 */
export default async function google(entry, ctx) {
    const jobs = [];
    const keywords = entry.keywords && entry.keywords.length > 0 ? entry.keywords : [''];

    const apiUrl = 'https://www.google.com/about/careers/applications/_/HiringCportalFrontendUi/data/batchexecute?rpcids=r06xKb';
    
    for (const keyword of keywords) {
        let page = 1; // Google pages are 1-indexed
        let totalCount = 1;
        
        while (jobs.length < totalCount) {
            const innerReq = [[keyword || "", null, null, null, "en-US", null, null, page]];
            const batchReq = JSON.stringify([[["r06xKb", JSON.stringify(innerReq), null, "3"]]]);

            const payloadParams = new URLSearchParams();
            payloadParams.append('f.req', batchReq);

            const text = await fetchTextWithRetry(ctx, apiUrl, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: payloadParams.toString()
            });

            if (!text) break;

            const cleanText = text.replace(/^\)\]\}'\n/, '');
            let data;
            try {
                data = JSON.parse(cleanText);
            } catch (e) {
                break; // Failed to parse
            }

            const row = data.find(r => r[0] === 'wrb.fr' && r[1] === 'r06xKb');
            if (!row || !row[2]) break;

            let inner;
            try {
                inner = JSON.parse(row[2]);
            } catch (e) {
                break; // Failed to parse inner RPC payload
            }

            const jobList = inner[0];
            if (!jobList || !Array.isArray(jobList) || jobList.length === 0) {
                break; // End of pagination or no results
            }

            totalCount = inner[2] || 0; // inner[2] contains the exact total job count

            for (const job of jobList) {
                if (!job || !job[0]) continue;
                
                const id = String(job[0]);
                const title = job[1] || 'Unknown Title';
                let locs = '';
                if (Array.isArray(job[9])) {
                    locs = job[9].map(l => l[0]).filter(Boolean).join('; ');
                }

                jobs.push({
                    title: title,
                    url: `https://www.google.com/about/careers/applications/jobs/results/${id}`,
                    id: id,
                    location: locs || 'Unknown',
                    department: job[7] || 'Google'
                });
            }

            if (ctx.maxJobs && jobs.length >= ctx.maxJobs) {
                return jobs.slice(0, ctx.maxJobs);
            }

            const itemsPerPage = inner[3] || 20;
            if (jobList.length < itemsPerPage) {
                break; // We've exhausted the available jobs on the last page
            }

            page++;

            if (ctx.maxPages && page > ctx.maxPages) {
                ctx.probe?.('maxPagesReached');
                break;
            }

            if (jobs.length < totalCount) {
                await sleep(250, ctx);
            } else {
                break;
            }
        }
    }

    return jobs;
}
