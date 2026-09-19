import fs from 'fs';

async function testFetch() {
  const url = 'https://ibegin.tcsapps.com/candidate/next/api/en-IN/search/jobs';
  const body = {
    includeRegularJob: true,
    includeWalkIn: true,
    searchTerms: [],
    jobLocationFilters: [],
    jobDomainFilters: [],
    experienceLevelFilters: [],
    skillFilters: [],
    relevancySortOrder: "desc",
    recentSortOrder: null,
    lastDateToApplySortOrder: null,
    page: 1,
    resultsPerPage: 10
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: JSON.stringify(body)
  });

  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response snippet:', text.substring(0, 1000));
}

testFetch();
