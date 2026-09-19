import { fetchTextWithRetry, sleep } from "./_http.mjs";

export default async function apple(entry, ctx) {
    const jobs = [];
    const keywords = entry.keywords && entry.keywords.length > 0 ? entry.keywords : [''];
    
    // Read from career-ops standard careers_url instead of url
    let baseUrl = entry.careers_url || entry.url || 'https://jobs.apple.com/en-us/search';
    const config = entry.apple || {};
    
    for (const keyword of keywords) {
        let page = 1;
        let totalCount = 1;

        while (jobs.length < totalCount) {
            let processedUrl = baseUrl;
            if (processedUrl.includes('{keyword}')) {
                processedUrl = processedUrl.replace('{keyword}', encodeURIComponent(keyword || ''));
            } else if (keyword) {
                const u = new URL(processedUrl);
                u.searchParams.set('search', keyword);
                processedUrl = u.toString();
            }

            const finalUrl = new URL(processedUrl);
            finalUrl.searchParams.set('page', page);
            if (config.location && !finalUrl.searchParams.has('location')) {
                finalUrl.searchParams.set('location', config.location);
            }

            const text = await fetchTextWithRetry(ctx, finalUrl.toString(), {
                method: 'GET',
                headers: { 'accept': 'text/html' }
            });

            if (!text) break;
            const match = text.match(/JSON\.parse\("(.*?)"\);<\/script>/);
            if (!match) break;

            let data;
            try {
                const unescaped = JSON.parse('"' + match[1] + '"');
                data = JSON.parse(unescaped);
            } catch (e) { break; }

            const searchState = data?.loaderData?.search || data?.appState?.search || data?.search;
            if (!searchState) break;

            const jobList = searchState.searchResults || [];
            if (jobList.length === 0) break;

            totalCount = searchState.totalRecords || 0;

            for (const job of jobList) {
                const id = job.positionId || job.id;
                const title = job.postingTitle || 'Unknown Title';
                let locName = 'Unknown Location';
                if (Array.isArray(job.locations) && job.locations.length > 0) {
                    locName = job.locations.map(l => l.name || l.countryName).filter(Boolean).join('; ');
                }
                
                const localeMatch = finalUrl.pathname.match(/^\/([a-z]{2}-[a-z]{2})\/search/);
                const locale = localeMatch ? localeMatch[1] : 'en-us';
                const transformedTitle = job.transformedPostingTitle || 'apple-job';
                
                jobs.push({
                    title: title,
                    url: `https://jobs.apple.com/${locale}/details/${id}/${transformedTitle}`,
                    id: String(id),
                    location: locName,
                    department: job.team?.teamName || 'Apple'
                });
            }

            if (ctx.maxJobs && jobs.length >= ctx.maxJobs) {
                return jobs.slice(0, ctx.maxJobs);
            }

            if (jobList.length < 20) break;
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
