// Node's built-in test runner (node:test) — no framework, no dependency,
// matching career-ops's own web/ suite convention. Run with:
//   node --test tests/universal/
//
// Ported from the retired tests/test_scraper_core.py::is_valid_candidate
// suite (Python) once that logic moved to
// backend/universal/providers/_generic-extract.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCandidate } from '../../backend/universal/providers/_generic-extract.mjs';

test('rejects missing href or title', () => {
  assert.equal(isValidCandidate('', 'Software Engineer'), false);
  assert.equal(isValidCandidate('https://example.com/jobs/123', ''), false);
});

test('rejects title too short or too long', () => {
  assert.equal(isValidCandidate('https://example.com/jobs/123', 'Go'), false);
  assert.equal(isValidCandidate('https://example.com/jobs/123', 'X'.repeat(201)), false);
});

test('rejects known nav and policy links', () => {
  assert.equal(isValidCandidate('https://example.com/login', 'Sign In'), false);
  assert.equal(isValidCandidate('https://example.com/privacy', 'Privacy Policy'), false);
  assert.equal(isValidCandidate('https://example.com/about', 'About Us'), false);
});

test('rejects by title pattern even with a job-like URL', () => {
  assert.equal(isValidCandidate('https://example.com/jobs/apply', 'Apply Now'), false);
});

test('accepts a plain job link without strict hints', () => {
  assert.equal(isValidCandidate('https://example.com/careers/software-engineer', 'Software Engineer'), true);
});

test('strict hints requires a hint, digit, or deep path', () => {
  // No hint keyword, no digits, shallow path -> rejected under strictHints.
  assert.equal(isValidCandidate('https://example.com/careers', 'Software Engineer', true), false);
  // Hint keyword present ("/jobs/") -> accepted.
  assert.equal(isValidCandidate('https://example.com/jobs/backend-dev', 'Backend Developer', true), true);
  // No hint keyword, but a trailing job-ID number -> accepted.
  assert.equal(isValidCandidate('https://example.com/careers/12345', 'Backend Developer', true), true);
  // No hint keyword, no digits, but deeply nested path -> accepted.
  assert.equal(isValidCandidate('https://example.com/a/b/c/d/backend-developer', 'Backend Developer', true), true);
});
