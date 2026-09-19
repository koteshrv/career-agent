import ripplehire from '../sources/providers/ripplehire.mjs';

const getCtx = (overrides = {}) => ({
    fetchJson: async (url, opts) => {
        const res = await fetch(url, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    ...overrides
});

async function run() {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm&lang=en&source=CAREERSITE#list/geo=India',
    };
    const ctx = getCtx({ maxJobs: 2 });
    try {
        const jobs = await ripplehire(entry, ctx);
        console.log("Jobs returned from function:", jobs.length);
        if (jobs.length > 0) console.log(jobs[0]);
    } catch(e) { console.error("Error:", e.message); }
}
run();
