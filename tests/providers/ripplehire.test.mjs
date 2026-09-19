import test from 'node:test';
import assert from 'node:assert';
import ripplehire from '../../sources/providers/ripplehire.mjs';

// Mock ctx
const getCtx = (overrides = {}) => ({
    fetchJson: async (url, opts) => {
        const res = await fetch(url, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    ...overrides
});

test('ripplehire provider - basic extraction', async () => {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm&lang=en&source=CAREERSITE#list/geo=India',
    };
    
    const ctx = getCtx({ maxJobs: 2 });
    
    const jobs = await ripplehire(entry, ctx);
    
    assert.strictEqual(jobs.length, 2, 'Should fetch exactly 2 jobs due to maxJobs');
    
    for (const job of jobs) {
        assert.ok(job.title, 'Job must have a title');
        assert.ok(job.url, 'Job must have a url');
        assert.ok(job.url.includes('#detail/job/'), 'URL must contain detail/job routing');
        assert.ok(job.id, 'Job must have an id');
        assert.ok(job.location, 'Job must have a location');
    }
});

test('ripplehire provider - keyword filtering', async () => {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm&lang=en',
        keywords: ['Developer']
    };
    
    const ctx = getCtx({ maxJobs: 5 });
    const jobs = await ripplehire(entry, ctx);
    
    assert.ok(jobs.length > 0, 'Should find at least 1 job for "Developer"');
    
    for (const job of jobs) {
        assert.ok(job.title, 'Job must have a title');
    }
});

test('ripplehire provider - multiple keywords', async () => {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm',
        keywords: ['Manager', 'Director']
    };
    
    const ctx = getCtx({ maxJobs: 2 });
    const jobs = await ripplehire(entry, ctx);
    assert.ok(jobs.length > 0, 'Should find jobs for multiple keywords');
});

test('ripplehire provider - no jobs found', async () => {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm',
        keywords: ['THIS_KEYWORD_DOES_NOT_EXIST_123456']
    };
    
    const ctx = getCtx({ maxJobs: 5 });
    const jobs = await ripplehire(entry, ctx);
    
    assert.strictEqual(jobs.length, 0, 'Should return empty array when no jobs are found');
});

test('ripplehire provider - probe propagation and pagination limit', async () => {
    const entry = {
        careers_url: 'https://ltimindtree.ripplehire.com/candidate/?token=xviyQvbnyYZdGtozXoNm',
    };
    
    let probeCalled = false;
    const ctx = getCtx({
        maxPages: 1, // Only fetch 1 page
        maxJobs: 1000,
        probe: (evt) => {
            if (evt === 'maxPagesReached') probeCalled = true;
        }
    });
    
    const jobs = await ripplehire(entry, ctx);
    assert.ok(jobs.length > 0, 'Should fetch some jobs');
    assert.strictEqual(probeCalled, true, 'Probe maxPagesReached should be triggered');
});

test('ripplehire provider - mphasis extraction', async () => {
    const entry = {
        careers_url: 'https://mphasis.ripplehire.com/candidate/?token=ty4DfyWddnOrtpclQeia&source=CAREERSITE#list/search={keyword}',
    };
    
    const ctx = getCtx({ maxJobs: 3 });
    const jobs = await ripplehire(entry, ctx);
    
    assert.strictEqual(jobs.length, 3, 'Should fetch exactly 3 jobs for Mphasis');
    
    for (const job of jobs) {
        assert.ok(job.title, 'Job must have a title');
        assert.ok(job.url, 'Job must have a url');
        assert.ok(job.url.includes('#detail/job/'), 'URL must contain detail/job routing');
        assert.ok(job.url.includes('ty4DfyWddnOrtpclQeia'), 'URL must use the Mphasis token');
        assert.ok(job.url.includes('mphasis.ripplehire.com'), 'URL must use the Mphasis domain');
    }
});
