import { fetchJsonWithRetry, sleep } from "./_http.mjs";

export default async function ripplehire(entry, ctx) {
    const jobs = [];
    const keywords = entry.keywords && entry.keywords.length > 0 ? entry.keywords : ['*:*'];
    
    const config = entry.ripplehire || {};
    const rawUrl = entry.careers_url || entry.url;
    if (!rawUrl) throw new Error(`Missing careers_url for Ripplehire provider`);
    
    let urlObj;
    try {
        urlObj = new URL(rawUrl);
    } catch (e) {
        throw new Error(`Invalid URL for ripplehire provider: ${rawUrl}`);
    }

    const token = config.token || urlObj.searchParams.get('token');
    if (!token) throw new Error(`Missing 'token' in config or careers_url for Ripplehire: ${rawUrl}`);

    const baseUrl = urlObj.origin;

    for (const keyword of keywords) {
        let page = 0;
        let totalCount = 1;
        const pageSize = 10;

        while (jobs.length < totalCount) {
            const searchParam = keyword === '*:*' ? '*:*' : keyword;
            const bodyObj = {
                page: page,
                search: searchParam,
                token: token,
                source: "CAREERSITE",
                pagesize: pageSize
            };
            const bodyStr = `careerSiteUrlParams=${encodeURIComponent(JSON.stringify(bodyObj))}&lang=en`;

            const apiUrl = `${baseUrl}/candidate/candidatejobsearch`;

            const json = await fetchJsonWithRetry(ctx, apiUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/javascript, */*; q=0.01',
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: bodyStr
            });

            if (!json) break;
            const dataObj = json.data || json;

            const jobList = dataObj.jobVoList || dataObj.candidateJobDTO || dataObj.candidateJobFilterDTO || [];
            if (jobList.length === 0) break;

            totalCount = dataObj.totalJobCount || dataObj.totalJobs || jobList.length;

            for (const job of jobList) {
                const id = String(job.reqId || job.jobId || job.jobSeq);
                const title = job.title || job.jobTitle || 'Unknown Title';
                const locName = job.location || job.jobLocation || job.locations || 'Unknown Location';
                
                jobs.push({
                    title: title,
                    url: `${baseUrl}/candidate/?token=${token}&lang=en&source=CAREERSITE#detail/job/${id}`,
                    id: id,
                    location: locName,
                    department: job.department || job.bu || job.bussinessUnit || ''
                });
            }

            if (ctx.maxJobs && jobs.length >= ctx.maxJobs) {
                return jobs.slice(0, ctx.maxJobs);
            }

            if (jobList.length < pageSize) break;

            page++;

            if (ctx.maxPages && page >= ctx.maxPages) {
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
