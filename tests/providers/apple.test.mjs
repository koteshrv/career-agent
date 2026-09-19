import test from 'node:test';
import assert from 'node:assert';
import apple from '../../sources/providers/apple.mjs';

test('apple provider extracts jobs correctly', async () => {
    let requests = 0;
    const mockCtx = {
        fetchText: async (url, opts) => {
            requests++;
            const u = new URL(url);
            const page = u.searchParams.get('page');
            
            if (page === '1') {
                const mockState = {
                    search: {
                        totalRecords: 2,
                        searchResults: [
                            {
                                positionId: "12345",
                                postingTitle: "Hardware Engineer",
                                locations: [{ name: "Cupertino, CA" }],
                                transformedPostingTitle: "hardware-engineer",
                                team: { teamName: "Hardware" }
                            },
                            {
                                id: "67890",
                                postingTitle: "Software Engineer",
                                locations: [{ countryName: "United States" }],
                                transformedPostingTitle: "software-engineer"
                            }
                        ]
                    }
                };
                // JSON stringify and escape it as the site does
                let rawJson = JSON.stringify(mockState).replace(/"/g, '\\"');
                return `<script>window.initialState=JSON.parse("${rawJson}");</script>`;
            }
            return "";
        },
        sleep: async () => {},
        maxJobs: 50
    };

    const entry = { url: 'https://jobs.apple.com/en-us/search', keywords: [''] };
    const jobs = await apple(entry, mockCtx);

    assert.strictEqual(requests, 1);
    assert.strictEqual(jobs.length, 2);

    assert.strictEqual(jobs[0].title, 'Hardware Engineer');
    assert.strictEqual(jobs[0].id, '12345');
    assert.strictEqual(jobs[0].url, 'https://jobs.apple.com/en-us/details/12345/hardware-engineer');
    assert.strictEqual(jobs[0].location, 'Cupertino, CA');
    assert.strictEqual(jobs[0].department, 'Hardware');

    assert.strictEqual(jobs[1].title, 'Software Engineer');
    assert.strictEqual(jobs[1].id, '67890');
    assert.strictEqual(jobs[1].url, 'https://jobs.apple.com/en-us/details/67890/software-engineer');
    assert.strictEqual(jobs[1].location, 'United States');
    assert.strictEqual(jobs[1].department, 'Apple');
});
