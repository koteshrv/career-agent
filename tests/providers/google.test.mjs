import test from 'node:test';
import assert from 'node:assert';
import google from '../../sources/providers/google.mjs';

test('google provider extracts jobs correctly', async () => {
    let requests = 0;
    const mockCtx = {
        fetchText: async (url, opts) => {
            requests++;
            const bodyStr = opts.body.toString();
            // Simulate the first page of results
            const innerReq = JSON.parse(decodeURIComponent(bodyStr.replace('f.req=', '')));
            // Extract the RPC payload inner array to get the page number
            const rpcParam = JSON.parse(innerReq[0][0][1]);
            const keyword = rpcParam[0][0];
            const page = rpcParam[0][7];
            
            if (page === 1) {
                const mockJobs = [
                    ["123456", "Software Engineer, Core", null, null, null, null, null, "Google", null, [["Mountain View, CA", ["Mountain View, CA"]], ["New York, NY", ["New York, NY"]]]],
                    ["789012", "Product Manager", null, null, null, null, null, "Google Cloud", null, [["Remote", ["Remote"]]]]
                ];
                const rpcResp = [mockJobs, null, 2, 20]; // 2 total jobs, size 20
                const batchexecute = [
                    ["wrb.fr", "r06xKb", JSON.stringify(rpcResp)]
                ];
                return ")]}'\n" + JSON.stringify(batchexecute);
            }
            return ")]}'\n[]";
        },
        sleep: async () => {},
        maxJobs: 50
    };

    const entry = { keywords: [''] };
    const jobs = await google(entry, mockCtx);

    assert.strictEqual(requests, 1);
    assert.strictEqual(jobs.length, 2);

    assert.strictEqual(jobs[0].title, 'Software Engineer, Core');
    assert.strictEqual(jobs[0].id, '123456');
    assert.strictEqual(jobs[0].url, 'https://www.google.com/about/careers/applications/jobs/results/123456');
    assert.strictEqual(jobs[0].location, 'Mountain View, CA; New York, NY');
    assert.strictEqual(jobs[0].department, 'Google');

    assert.strictEqual(jobs[1].title, 'Product Manager');
    assert.strictEqual(jobs[1].id, '789012');
    assert.strictEqual(jobs[1].url, 'https://www.google.com/about/careers/applications/jobs/results/789012');
    assert.strictEqual(jobs[1].location, 'Remote');
    assert.strictEqual(jobs[1].department, 'Google Cloud');
});

test('google provider handles pagination and keyword', async () => {
    let requests = 0;
    const mockCtx = {
        fetchText: async (url, opts) => {
            requests++;
            const bodyStr = opts.body.toString();
            const innerReq = JSON.parse(decodeURIComponent(bodyStr.replace('f.req=', '')));
            const rpcParam = JSON.parse(innerReq[0][0][1]);
            const keyword = rpcParam[0][0];
            const page = rpcParam[0][7];
            
            assert.strictEqual(keyword, 'Python');
            
            if (page <= 2) {
                const mockJobs = Array(20).fill(["999", "Python Dev", null, null, null, null, null, "Google", null, [["London, UK", ["London, UK"]]]]);
                const rpcResp = [mockJobs, null, 25, 20]; // 25 total jobs
                const batchexecute = [["wrb.fr", "r06xKb", JSON.stringify(rpcResp)]];
                return ")]}'\n" + JSON.stringify(batchexecute);
            }
            return ")]}'\n[]";
        },
        sleep: async () => {},
        maxJobs: 100
    };

    const entry = { keywords: ['Python'] };
    const jobs = await google(entry, mockCtx);

    assert.strictEqual(requests, 2); // 20 per page, 25 total -> 2 pages needed
    assert.strictEqual(jobs.length, 40);
    assert.strictEqual(jobs[0].title, 'Python Dev');
});
