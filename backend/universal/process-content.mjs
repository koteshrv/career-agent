// Pure processing of already-fetched job posting text: cross-listing dedup
// fingerprinting (career-ops's fingerprint-core.mjs SimHash design) and
// dead-posting classification (its liveness-core.mjs rule cascade). Lives
// alongside fetch-description.mjs so nothing that touches scraped ATS content
// — fetch or process — sits in Python; the DB side (comparing two already-
// computed fingerprints, deciding what to do with a status) stays there.
import { createHash } from 'node:crypto';

/** 64-bit SimHash over 3-token shingles, as a 16-char hex string. '' below the length/token floor. */
export function computeSimhash(text) {
  if (!text || text.length < 200) return '';
  const words = text.toLowerCase().replace(/[^a-z0-9 \t\n]/g, '').split(/\s+/).filter(Boolean);
  if (words.length < 3) return '';

  const votes = new Array(64).fill(0);
  for (let i = 0; i <= words.length - 3; i++) {
    const shingle = words.slice(i, i + 3).join(' ');
    const hex16 = createHash('sha1').update(shingle, 'utf8').digest('hex').slice(0, 16);
    const h = BigInt(`0x${hex16}`);
    for (let bit = 0; bit < 64; bit++) {
      if (h & (1n << BigInt(bit))) votes[bit] += 1;
      else votes[bit] -= 1;
    }
  }

  let fingerprint = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (votes[bit] > 0) fingerprint |= (1n << BigInt(bit));
  }
  return fingerprint.toString(16).padStart(16, '0');
}

/** Classifies fetched posting text as 'active' | 'expired' | 'uncertain'. */
export function classifyLiveness(text) {
  if (!text) return 'expired';
  const t = text.toLowerCase();

  if (t.includes('404 not found') || t.includes('410 gone')) return 'expired';

  if (
    t.includes('please enable cookies')
    || t.includes('checking if the site connection is secure')
    || t.includes('cloudflare')
  ) return 'uncertain';

  const expiredPhrases = [
    'no longer available', 'no longer accepting applications',
    'job has been filled', 'job is closed', 'position is closed',
    'position has been filled', 'we are no longer hiring for this role',
  ];
  if (expiredPhrases.some((p) => t.includes(p))) return 'expired';

  const applyPatterns = ['apply now', 'apply for this job', 'apply today', 'bewerben', 'submit application'];
  if (applyPatterns.some((p) => t.includes(p))) return 'active';

  if (text.length < 300) return 'expired';

  return 'uncertain';
}
