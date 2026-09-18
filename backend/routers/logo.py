"""Company favicon proxy + forever on-disk cache, adapted from career-ops's
web/src/app/api/logo/route.ts. A job posting's URL is always the ATS
(greenhouse/lever/etc.), never the employer's own domain, so the domain is
guessed from the company NAME — a curated override map for the common brand
!= slug cases, then a handful of slug+TLD candidates. Logos are public,
non-sensitive data shared across all users (one cache, not per-user).
"""
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, Response
from backend.database import models
from backend.core import auth
from backend.database import models

router = APIRouter(prefix="/api/logo", tags=["Logo"])

CACHE_DIR = Path(".data/uploads/logo_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Curated name -> domain overrides for the common brand != slug long tail
# (ported from career-ops's lib/company.ts DOMAIN_OVERRIDES).
DOMAIN_OVERRIDES = {
    "anthropic": "anthropic.com", "openai": "openai.com", "google": "google.com",
    "meta": "meta.com", "facebook": "meta.com", "microsoft": "microsoft.com",
    "apple": "apple.com", "amazon": "amazon.com", "netflix": "netflix.com",
    "x": "x.com", "twitter": "x.com", "stripe": "stripe.com", "shopify": "shopify.com",
    "airbnb": "airbnb.com", "uber": "uber.com", "spotify": "spotify.com",
    "linkedin": "linkedin.com", "github": "github.com", "gitlab": "gitlab.com",
    "notion": "notion.so", "figma": "figma.com", "databricks": "databricks.com",
    "snowflake": "snowflake.com", "cloudflare": "cloudflare.com", "vercel": "vercel.com",
    "hugging face": "huggingface.co", "huggingface": "huggingface.co",
    "cohere": "cohere.com", "mistral ai": "mistral.ai", "mistral": "mistral.ai",
    "perplexity": "perplexity.ai", "coinbase": "coinbase.com", "atlassian": "atlassian.com",
    "salesforce": "salesforce.com", "oracle": "oracle.com", "ibm": "ibm.com",
    "tcs": "tcs.com", "infosys": "infosys.com", "wipro": "wipro.com",
    "accenture": "accenture.com", "cognizant": "cognizant.com", "capgemini": "capgemini.com",
    "deloitte": "deloitte.com", "zoho": "zoho.com", "flipkart": "flipkart.com",
    "swiggy": "swiggy.com", "razorpay": "razorpay.com", "paytm": "paytm.com",
}

LEGAL_SUFFIX_RE = re.compile(
    r"\b(inc|llc|ltd|limited|gmbh|co|corp|corporation|sa|ag|plc|technologies|technology|labs|systems)\b",
    re.IGNORECASE,
)
SAFE_KEY_RE = re.compile(r"[^a-z0-9]+")


def _company_domains(company: str) -> list[str]:
    base = company.strip()
    key = base.lower()
    candidates = []
    if key in DOMAIN_OVERRIDES:
        candidates.append(DOMAIN_OVERRIDES[key])

    cleaned = LEGAL_SUFFIX_RE.sub(" ", key)
    cleaned = re.sub(r"[.,&'’/()|]+", " ", cleaned)
    slug = re.sub(r"\s+", "", cleaned).strip()
    if slug and slug not in DOMAIN_OVERRIDES:
        for tld in (".com", ".ai", ".io", ".co"):
            candidates.append(slug + tld)

    seen = set()
    out = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out[:5]


def _cache_key(company: str) -> str:
    return SAFE_KEY_RE.sub("_", company.strip().lower())[:80]


async def _fetch_favicon(domain: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=3.5) as client:
            resp = await client.get(
                "https://www.google.com/s2/favicons",
                params={"domain": domain, "sz": "64"},
                headers={"Accept": "image/*"},
                follow_redirects=True,
            )
        if resp.status_code != 200:
            return None
        body = resp.content
        # Google serves a tiny globe placeholder (~100-200 bytes) on a miss.
        return body if len(body) > 220 else None
    except Exception:
        return None


@router.get("")
async def get_logo(company: str):
    key = _cache_key(company)
    if not key:
        return Response(status_code=400)

    cache_file = CACHE_DIR / f"{key}.png"
    resolved = cache_file.resolve()
    if not str(resolved).startswith(str(CACHE_DIR.resolve()) + "/"):
        return Response(status_code=400)  # defense in depth, key is already sanitized above

    if cache_file.exists():
        body = cache_file.read_bytes()
        if not body:
            return Response(status_code=404)  # cached miss sentinel
        return Response(content=body, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})

    candidates = _company_domains(company)
    body = None
    for domain in candidates:
        body = await _fetch_favicon(domain)
        if body:
            break

    cache_file.write_bytes(body or b"")  # empty file = cached miss, never refetch
    if not body:
        return Response(status_code=404)
    return Response(content=body, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})
