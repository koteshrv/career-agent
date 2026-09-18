// Ported from the retired tests/test_scraper_heuristics.py once
// check_liveness/compute_simhash moved from Python (backend/scraper_core.py)
// to backend/universal/process-content.mjs. Run with:
//   node --test tests/universal/process-content.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSimhash, classifyLiveness } from '../../backend/universal/process-content.mjs';

// Test-local only — hamming_distance itself stays in Python
// (backend/scraper_core.py: pure arithmetic on two already-computed
// fingerprints, not ATS/network content processing) — this is just what the
// similarity assertions below need.
function hammingDistance(hex1, hex2) {
  if (!hex1 || !hex2) return 64;
  return (BigInt(`0x${hex1}`) ^ BigInt(`0x${hex2}`)).toString(2).split('').filter((b) => b === '1').length;
}

test('liveness: active on an apply button', () => {
  const html = '<h1>Senior Engineer</h1><p>We are hiring!</p><button>Apply Now</button>';
  assert.equal(classifyLiveness(html), 'active');
});

test('liveness: expired phrases', () => {
  assert.equal(classifyLiveness('<h1>Senior Engineer</h1><p>We are no longer accepting applications for this role.</p>'), 'expired');
  assert.equal(classifyLiveness('<p>This position has been filled. Thank you.</p>'), 'expired');
});

test('liveness: HTTP error page', () => {
  assert.equal(classifyLiveness('<title>404 Not Found</title><body>The page you requested is missing.</body>'), 'expired');
});

test('liveness: bot challenge is uncertain, not expired', () => {
  assert.equal(classifyLiveness('<html><body>Please enable cookies or disable your adblocker. Cloudflare challenge.</body></html>'), 'uncertain');
});

test('liveness: too short is expired', () => {
  assert.equal(classifyLiveness('<h1>Just a very short broken page</h1>'), 'expired');
});

test('liveness: long neutral text is uncertain', () => {
  const html = '<h1>Senior Engineer</h1>' + '<p>Here is a description of the job, but there is no explicit apply button text.</p>'.repeat(10);
  assert.equal(classifyLiveness(html), 'uncertain');
});

test('simhash: identical text produces identical fingerprint', () => {
  const text1 = 'This is a standard job description for a software engineer. We want python and react.'.repeat(10);
  const text2 = 'This is a standard job description for a software engineer. We want python and react.'.repeat(10);
  const fp1 = computeSimhash(text1);
  const fp2 = computeSimhash(text2);
  assert.equal(fp1, fp2);
  assert.equal(hammingDistance(fp1, fp2), 0);
});

test('simhash: small variations stay close', () => {
  const text1 = 'This is a standard job description for a software engineer. We want python and react.'.repeat(20);
  const text2 = `URGENT HIRING: ${text1} Apply today to our agency.`;
  const dist = hammingDistance(computeSimhash(text1), computeSimhash(text2));
  assert.ok(dist <= 10, `expected <= 10, got ${dist}`);
});

test('simhash: unrelated text is far apart', () => {
  const text1 = 'This is a job description for a software engineer. We want python and react.'.repeat(20);
  const text2 = 'We are seeking a registered nurse for the night shift at the local hospital.'.repeat(20);
  const dist = hammingDistance(computeSimhash(text1), computeSimhash(text2));
  assert.ok(dist > 15, `expected > 15, got ${dist}`);
});
