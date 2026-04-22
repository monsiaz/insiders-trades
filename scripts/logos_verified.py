#!/usr/bin/env python3
"""
logos_verified.py — Fetch & verify company logos with GPT-4o Vision BEFORE committing.

Pipeline per company (all steps gather candidates; vision picks the winner):

  1. Yahoo Finance    → resolve ticker → website, sector
  2. Domain heuristic → build candidate domains from name + ticker
  3. Clearbit         → https://logo.clearbit.com/{domain}  (free, no auth)
  4. DuckDuckGo       → https://icons.duckduckgo.com/ip3/{domain}.ico  (free)
  5. Icon Horse       → https://icon.horse/icon/{domain}  (free)
  6. Website scrape   → OG image + header/nav logo + CSS selectors
  7. OpenAI web-search (gpt-4o-search-preview) → direct logo URL
  8. Wikipedia image  → parse infobox for logo (last-resort)

Then for each candidate (prioritized by quality):
  • GPT-4o mini Vision: "Is this the official logo of <company>?" — JSON answer
  • Keep the first that passes (high confidence, is_logo=true, correct_company=true)

If verified:
  • Resize to 200×200 WebP (quality 85)
  • Upload to Vercel Blob with clean slug (no AMF suffix)
  • Update Company.logoUrl / logoSource

Usage:
  python3 scripts/logos_verified.py [--mode=missing|suspicious|all] [--limit=N] [--workers=15]
                                    [--dry-run] [--test NAME]

Modes:
  missing     — only companies where logoUrl IS NULL  (default)
  suspicious  — companies with logoSource=og_image or google_favicon (likely bad)
  all         — every company (audit + refetch)
  test        — one-shot for a single company by name (--test "ABEO")
"""

from __future__ import annotations

import os, re, sys, json, base64, argparse, tempfile, subprocess, warnings
from io import BytesIO
from typing import Optional, Tuple
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup
from PIL import Image
import psycopg2, psycopg2.extras
from openai import OpenAI

warnings.filterwarnings("ignore")

# ── Env loading ───────────────────────────────────────────────────────────────

def load_env(path):
    try:
        for line in open(path):
            m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.+)$", line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip("\"'")
    except Exception:
        pass

_here = os.path.dirname(os.path.abspath(__file__))
_project = os.path.dirname(_here)
load_env(os.path.join(_project, ".env.local"))
load_env(os.path.join(_project, ".env"))
load_env("/Users/simonazoulay/SurfCampSenegal/.env")

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not OPENAI_KEY:
    sys.exit("❌ OPENAI_API_KEY missing")
if not BLOB_TOKEN:
    sys.exit("❌ BLOB_READ_WRITE_TOKEN missing")
if not DATABASE_URL:
    sys.exit("❌ DATABASE_URL missing")

oai = OpenAI(api_key=OPENAI_KEY)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}

# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--mode", choices=["missing", "suspicious", "all"], default="missing")
parser.add_argument("--limit", type=int, default=9999)
parser.add_argument("--workers", type=int, default=15)
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--test", type=str, default=None, help="Single company name to test")
parser.add_argument("--verbose", action="store_true")
parser.add_argument("--force-recheck", action="store_true",
                    help="Refetch even if vision says the current logo is valid")
args = parser.parse_args()

# ── DB helpers ────────────────────────────────────────────────────────────────

def db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_companies():
    if args.test:
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                'SELECT id, name, slug, "yahooSymbol", "logoUrl", "logoSource" '
                'FROM "Company" WHERE name ILIKE %s LIMIT 5',
                (f"%{args.test}%",),
            )
            return cur.fetchall()

    where = {
        "missing": '"logoUrl" IS NULL',
        "suspicious": '"logoSource" IN (\'og_image\',\'google_favicon\') OR "logoUrl" IS NULL',
        "all": "TRUE",
    }[args.mode]

    with db() as conn, conn.cursor() as cur:
        cur.execute(
            f'''SELECT c.id, c.name, c.slug, c."yahooSymbol", c."logoUrl", c."logoSource"
                FROM "Company" c
                WHERE {where}
                ORDER BY (SELECT COUNT(*) FROM "Declaration" d WHERE d."companyId"=c.id) DESC
                LIMIT %s''',
            (args.limit,),
        )
        return cur.fetchall()

def save_logo(cid, url, source):
    if args.dry_run:
        return
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            'UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s',
            (url, source, cid),
        )
        conn.commit()

def clear_logo(cid):
    if args.dry_run:
        return
    with db() as conn, conn.cursor() as cur:
        cur.execute('UPDATE "Company" SET "logoUrl"=NULL, "logoSource"=NULL WHERE id=%s', (cid,))
        conn.commit()

# ── Clean slug ────────────────────────────────────────────────────────────────

_SUFFIXES = re.compile(
    r"\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|"
    r"corp\b|ltd\b|s\.p\.a\.|s\.b\.|group\b|groupe\b|holding\b)\.?\s*$",
    re.IGNORECASE,
)

def clean_slug(name: str) -> str:
    clean = _SUFFIXES.sub("", name).strip()
    slug = re.sub(r"[^a-z0-9]+", "-", clean.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    return slug[:50]

# ── Image validation (bytes → PIL) ────────────────────────────────────────────

def download(url: str, timeout=8):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout,
                         allow_redirects=True, verify=False, stream=False)
        if r.status_code != 200:
            return None, None
        return r.content, r.headers.get("Content-Type", "").lower()
    except Exception:
        return None, None

def is_plausible_image(content: bytes, ct: str, min_w=40, min_h=20) -> bool:
    if not content or len(content) < 100:
        return False
    if ct and "text/html" in ct:
        return False
    # SVG
    if ct and "image/svg" in ct:
        return len(content) > 100 and b"<svg" in content[:200].lower()
    if content[:5] == b"<svg " or content[:20].lower().startswith(b"<?xml") and b"<svg" in content[:200]:
        return True
    try:
        img = Image.open(BytesIO(content))
        w, h = img.size
        if w < min_w or h < min_h:
            return False
        if w > 4000 or h > 4000:
            return False
        ratio = w / h if h else 1
        if ratio < 0.2 or ratio > 12:
            return False
        return True
    except Exception:
        return False

# ── Yahoo Finance website lookup ──────────────────────────────────────────────

try:
    import yfinance as yf  # type: ignore
    _YF_OK = True
except Exception:
    _YF_OK = False

# Tiny in-process cache — avoids repeat yf calls when a worker retries
_YF_CACHE = {}

def yahoo_website(ticker: str):
    """Resolve ticker → website via yfinance (handles Yahoo crumb)."""
    if not ticker or not _YF_OK:
        return None
    if ticker in _YF_CACHE:
        return _YF_CACHE[ticker]
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        site = info.get("website") or info.get("websiteUrl")
        site = site.strip() if isinstance(site, str) else None
        _YF_CACHE[ticker] = site
        return site
    except Exception:
        _YF_CACHE[ticker] = None
        return None

# In-memory cache for OpenAI website lookups
_OAI_SITE_CACHE = {}

def openai_resolve_website(name: str):
    """Fallback: ask GPT-4o for the company's official website root domain."""
    if not OPENAI_KEY:
        return None
    key = name.strip().lower()
    if key in _OAI_SITE_CACHE:
        return _OAI_SITE_CACHE[key]
    prompt = (
        f'What is the official website of the French listed company "{name}"? '
        f'Return ONLY the root URL (e.g. https://www.example.com), no text, no markdown.'
    )
    try:
        r = oai.chat.completions.create(
            model="gpt-4o-search-preview",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
        )
        text = (r.choices[0].message.content or "").strip()
    except Exception:
        try:
            r = oai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=60,
            )
            text = (r.choices[0].message.content or "").strip()
        except Exception:
            _OAI_SITE_CACHE[key] = None
            return None
    # Extract first URL
    m = re.search(r"https?://[^\s<>\"']+", text)
    site = None
    if m:
        site = m.group(0).rstrip(".,;!?)]'\"").split(" ")[0]
        # Keep only root
        site = re.sub(r"^(https?://[^/]+).*$", r"\1", site)
    _OAI_SITE_CACHE[key] = site
    return site

# ── Domain candidate builder ──────────────────────────────────────────────────

def domain_candidates(name: str, ticker: str):
    clean = _SUFFIXES.sub("", name).strip()
    base_name = re.sub(r"[^a-z0-9]+", "", clean.lower())[:24]
    ticker_clean = re.sub(r"\.[A-Z]{1,3}$", "", ticker or "").lower()
    cands = []
    for b in (base_name, ticker_clean):
        if b and len(b) >= 2:
            cands += [f"https://www.{b}.fr", f"https://www.{b}.com",
                      f"https://{b}.fr",     f"https://{b}.com"]
    return list(dict.fromkeys(cands))[:8]

# ── Candidate sources ─────────────────────────────────────────────────────────

def domain_of(url: str) -> str:
    return url.replace("https://", "").replace("http://", "").split("/")[0].replace("www.", "")

# NOTE: Clearbit Logo API was deprecated in Dec 2024 — removed from the pipeline.

def src_logodev(url):
    """Logo.dev public endpoint — returns the company logo if they have it indexed.
    Token-less endpoint gives 200 for known brands; otherwise 403/404."""
    if not url:
        return []
    d = domain_of(url)
    # Public "img.logo.dev" — works without auth for most public domains
    return [(f"https://img.logo.dev/{d}?size=240&format=png", "logo_dev", 90)]

def src_duckduckgo(url):
    if not url:
        return []
    d = domain_of(url)
    # DuckDuckGo's ip3 endpoint gives a real PNG (small but OK as fallback)
    return [(f"https://icons.duckduckgo.com/ip3/{d}.ico", "duckduckgo", 50)]

def src_iconhorse(url):
    if not url:
        return []
    d = domain_of(url)
    return [(f"https://icon.horse/icon/{d}", "icon_horse", 65)]

def src_google_favicon(url):
    if not url:
        return []
    d = domain_of(url)
    return [(f"https://www.google.com/s2/favicons?domain={d}&sz=256", "google_favicon", 40)]

def src_scrape(url, name=""):
    out = []
    if not url:
        return out
    try:
        r = requests.get(url, headers=HEADERS, timeout=8, verify=False, allow_redirects=True)
        if r.status_code != 200:
            return out
        soup = BeautifulSoup(r.text, "html.parser")
        base_url = r.url

        # OG / Twitter
        for prop in ("og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"):
            tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                u = tag["content"].strip().rstrip(".,;!?)")
                if not u.startswith("http"):
                    u = urljoin(base_url, u)
                out.append((u, "og_image", 50))  # low prio because often a promo photo

        # Header / nav img
        for container in (soup.find("header"), soup.find("nav"),
                          soup.find(class_=re.compile(r"navbar|nav-bar|site-header", re.I))):
            if not container:
                continue
            for img in container.find_all("img"):
                src = (img.get("src") or img.get("data-src") or img.get("data-lazy-src")
                       or img.get("data-original"))
                if not src:
                    continue
                low = src.lower()
                if any(x in low for x in ("favicon", "icon-", "16x16", "32x32", "apple-touch")):
                    continue
                if not src.startswith("http"):
                    src = urljoin(base_url, src)
                # Prio: "logo" in alt/class/src → high
                alt = (img.get("alt") or "").lower()
                cls = " ".join(img.get("class", [])).lower()
                prio = 80 if ("logo" in alt or "logo" in cls or "logo" in low) else 55
                out.append((src, "header_scrape", prio))

        # CSS selectors for logo
        for sel in ('img[class*="logo" i]', 'img[id*="logo" i]', 'img[alt*="logo" i]',
                    'img[src*="logo" i]', ".logo img", ".navbar-brand img"):
            for img in soup.select(sel)[:3]:
                src = (img.get("src") or img.get("data-src") or img.get("data-lazy-src"))
                if not src or src.startswith("data:"):
                    continue
                if not src.startswith("http"):
                    src = urljoin(base_url, src)
                out.append((src, "header_scrape", 78))
    except Exception:
        pass
    return out

def src_wikidata_logo(name, ticker=""):
    """
    Look up the official logo on Wikidata via property P154 (logo image).
    This is the canonical source for large listed companies — SVG + high-res PNG.

    Strategy: search Wikidata with name (+ ticker as fallback), walk top 3 results,
    return the P154 image URL. Multiple candidates prevent missing entries where
    the company rebranded (e.g. Teleperformance → "TP (company)").
    """
    if not name:
        return []

    def wikidata_search(q):
        try:
            r = requests.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbsearchentities",
                    "search": q,
                    "language": "en",
                    "format": "json",
                    "type": "item",
                    "limit": 5,
                },
                headers=HEADERS,
                timeout=6,
            )
            if r.status_code != 200:
                return []
            return r.json().get("search", [])
        except Exception:
            return []

    def entity_logo(qid):
        try:
            r = requests.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbgetentities",
                    "ids": qid,
                    "props": "claims|labels",
                    "format": "json",
                },
                headers=HEADERS,
                timeout=6,
            )
            if r.status_code != 200:
                return None
            ent = r.json().get("entities", {}).get(qid) or {}
            # Confirm it's a company (P31 = instance of, Q4830453 = business enterprise)
            # We don't strictly filter, but grab P154
            claims = ent.get("claims", {})
            logos = claims.get("P154", [])
            for l in logos:
                value = (
                    l.get("mainsnak", {})
                    .get("datavalue", {})
                    .get("value")
                )
                if isinstance(value, str) and value.strip():
                    return value.strip().replace(" ", "_")
            return None
        except Exception:
            return None

    # Try the name directly first
    queries = [name]
    ticker_clean = re.sub(r"\.[A-Z]{1,3}$", "", ticker or "").strip()
    if ticker_clean:
        queries.append(f"{name} {ticker_clean}")
    # Rebrand-friendly: check the short name ("TP" for Teleperformance)
    short = re.sub(_SUFFIXES, "", name).strip()
    if short and short.lower() != name.lower():
        queries.append(short)

    for q in queries:
        results = wikidata_search(q)
        for entry in results[:3]:
            qid = entry.get("id")
            if not qid:
                continue
            desc = (entry.get("description") or "").lower()
            # Soft filter: avoid matching unrelated entries (persons, places)
            if any(bad in desc for bad in ("human", "person", "surname", "given name", "village", "commune")):
                continue
            logo_file = entity_logo(qid)
            if logo_file:
                url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{logo_file}"
                # Special:FilePath 302→301 redirects down to upload.wikimedia.org
                return [(url, "wikidata", 95)]
    return []

def src_openai_search(name, ticker=""):
    """Ask GPT-4o web search for a direct logo URL."""
    if not OPENAI_KEY:
        return []
    try:
        prompt = (
            f'Task: find the official logo image URL for the French listed company "{name}"'
            f'{(" (ticker " + ticker + ")") if ticker else ""}.\n\n'
            f'Rules:\n'
            f'• Return ONLY direct image URLs ending in .png .svg .jpg .jpeg .webp (or with query string).\n'
            f'• ONE URL per line, no bullets, no prose, no markdown.\n'
            f'• Prefer URLs from the company\'s own website (CDN, /assets, /wp-content).\n'
            f'• Prefer SVG or high-resolution PNG.\n'
            f'• EXCLUDE: wikipedia.org, wikimedia.org, google.com/s2/favicons, fandom.com, '
            f'any .html URL, any social media icons.\n'
            f'• If you find 3-5 good URLs, output all of them (one per line).\n'
            f'• If unsure, search for "{name} logo png" or visit the company\'s official site.'
        )
        r = oai.chat.completions.create(
            model="gpt-4o-search-preview",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
        )
        text = (r.choices[0].message.content or "")
    except Exception:
        return []

    urls = []
    for line in text.splitlines():
        # Match any URL pointing to an image
        for m in re.findall(r"https?://[^\s<>\"\)\]\(]+", line):
            u = m.strip().rstrip(".,;!?)]'\"")
            low = u.lower()
            if not re.search(r"\.(png|svg|jpg|jpeg|webp|gif)(\?|$)", low):
                continue
            if any(bad in low for bad in
                   ("wikipedia.org", "wikimedia.org", "google.com/s2/favicons",
                    "fandom.com", "lookaside.fb", "scontent", "twimg.com")):
                continue
            urls.append(u)

    # Dedupe preserving order
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append((u, "openai", 82))
    return out[:6]

# ── Vision verification ───────────────────────────────────────────────────────

def _rasterize_svg(svg_bytes: bytes):
    """Rasterize an SVG (bytes) to a PIL Image via cairosvg."""
    try:
        import cairosvg  # type: ignore
        png_bytes = cairosvg.svg2png(bytestring=svg_bytes, output_width=320, output_height=320)
        return Image.open(BytesIO(png_bytes))
    except Exception:
        return None

def to_data_uri(content: bytes, ct: str):
    """Always return a PNG data URI — gpt-4o-mini rejects SVG data URIs."""
    try:
        img = Image.open(BytesIO(content))
    except Exception:
        # Likely SVG — rasterize
        if b"<svg" in content[:400].lower():
            img = _rasterize_svg(content)
            if img is None:
                return None
        else:
            return None
    try:
        img.thumbnail((320, 320), Image.LANCZOS)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")
        # Flatten transparency on white for better model recognition
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        buf = BytesIO()
        img.save(buf, format="PNG", optimize=False)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/png;base64,{b64}"
    except Exception:
        return None

def vision_verify(name: str, content: bytes, ct: str) -> dict:
    """GPT-4o-mini Vision: is this the official logo of <name>?"""
    data_uri = to_data_uri(content, ct)
    if not data_uri:
        return {"valid": False, "reason": "cannot encode image"}
    try:
        r = oai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f'Is this image the official LOGO of the company "{name}" '
                            f'(French listed company)? '
                            f'Reply with ONLY a JSON object — no markdown, no prose. '
                            f'{{'
                            f'"is_logo": true/false, '
                            f'"is_correct_company": true/false, '
                            f'"confidence": "high"|"medium"|"low", '
                            f'"reason": "short reason" '
                            f'}} '
                            f'REJECT if: photo of person, photo of building, stock photo, '
                            f'abstract art, screenshot, wrong company, generic social-media icon, '
                            f'generic icon library, PARTIAL/FRAGMENT of a logo (like just one '
                            f'letter when the brand is a wordmark), broken/cropped image, '
                            f'or the image clearly depicts something else. '
                            f'ACCEPT if: complete wordmark, complete brand symbol, complete letter '
                            f'mark, or complete combined logo that matches "{name}" (even if '
                            f'lowercased or styled). The logo must be recognizable and identifiable '
                            f'as belonging to "{name}" on its own — NOT a fragment that only makes '
                            f'sense in context.'
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": data_uri, "detail": "low"}},
                ],
            }],
            max_tokens=120,
            response_format={"type": "json_object"},
        )
        obj = json.loads(r.choices[0].message.content or "{}")
        valid = bool(obj.get("is_logo")) and bool(obj.get("is_correct_company"))
        return {
            "valid": valid,
            "reason": obj.get("reason") or ("ok" if valid else "rejected"),
            "confidence": obj.get("confidence", "medium"),
            "is_logo": bool(obj.get("is_logo")),
            "is_correct": bool(obj.get("is_correct_company")),
        }
    except Exception as e:
        return {"valid": False, "reason": f"vision err: {str(e)[:80]}"}

# ── WebP 400×400 conversion ───────────────────────────────────────────────────

def _rasterize_svg_to_webp(svg_bytes: bytes) -> Optional[bytes]:
    """Rasterize SVG → trimmed + padded WebP bytes (cairosvg+PIL)."""
    try:
        import cairosvg  # type: ignore
        png_bytes = cairosvg.svg2png(
            bytestring=svg_bytes, output_width=800, output_height=800, dpi=300
        )
        img = Image.open(BytesIO(png_bytes))
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        img = _trim_and_pad(img)
        buf = BytesIO()
        img.save(buf, format="WEBP", quality=90, method=6)
        return buf.getvalue()
    except Exception:
        return None

def _trim_and_pad(img: "Image.Image") -> "Image.Image":
    """Remove transparent/white whitespace, then add 8% padding for breathing room."""
    try:
        # Prefer alpha channel as the trim mask
        if img.mode == "RGBA":
            alpha = img.split()[-1]
            bbox = alpha.getbbox()
        else:
            # Fallback: bbox against white background
            bg = Image.new(img.mode, img.size, (255, 255, 255))
            diff = Image.eval(Image.alpha_composite(bg.convert("RGBA"), img.convert("RGBA")), lambda p: 255 - p)
            bbox = diff.getbbox()
        if bbox:
            img = img.crop(bbox)
        # Cap at 400px on the longer side for consistent storage size
        img.thumbnail((400, 400), Image.LANCZOS)
        # Add 8% transparent padding on each side
        pad_x = max(2, int(img.width * 0.08))
        pad_y = max(2, int(img.height * 0.08))
        new = Image.new("RGBA", (img.width + pad_x * 2, img.height + pad_y * 2), (0, 0, 0, 0))
        new.paste(img, (pad_x, pad_y), img if img.mode == "RGBA" else None)
        return new
    except Exception:
        return img

def to_webp_200(content: bytes) -> Tuple[bytes, str]:
    """
    Convert any image payload to WebP bytes + return the final content-type.

    Returns (bytes, content_type). Never silently returns SVG bytes under
    content_type='image/webp' — a bug that bricked many logos in production.
    """
    # SVG short-circuit: rasterize instead of passing raw XML through PIL
    if b"<svg" in content[:400].lower() or (
        content[:20].lower().startswith(b"<?xml") and b"<svg" in content[:400].lower()
    ):
        rasterized = _rasterize_svg_to_webp(content)
        if rasterized:
            return rasterized, "image/webp"
        # Fallback: store as SVG (correct content-type so browsers render it)
        return content, "image/svg+xml"

    # Raster image: trim + pad + convert via PIL
    try:
        img = Image.open(BytesIO(content))
        if img.mode == "P":
            img = img.convert("RGBA")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")
        img = _trim_and_pad(img)
        buf = BytesIO()
        img.save(buf, format="WEBP", quality=90, method=6)
        return buf.getvalue(), "image/webp"
    except Exception:
        return content, "application/octet-stream"

# ── Vercel Blob upload ────────────────────────────────────────────────────────

def blob_upload(filename: str, content: bytes, content_type: str):
    if args.dry_run:
        return f"https://blob.dryrun/{filename}"
    with tempfile.NamedTemporaryFile(suffix=f".{filename.rsplit('.', 1)[-1]}", delete=False) as f:
        f.write(content); tmp = f.name
    try:
        out = subprocess.run(
            ["node", "-e", f'''
const {{put}}=require("@vercel/blob");
const fs=require("fs");
put("logos/{filename}", fs.readFileSync("{tmp}"), {{
  access:"public",
  token:"{BLOB_TOKEN}",
  contentType:"{content_type}",
  addRandomSuffix:false,
  allowOverwrite:true
}}).then(r=>console.log(r.url)).catch(e=>{{console.error(e.message);process.exit(1)}});
'''],
            capture_output=True, text=True, cwd=_project, timeout=30,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
        return None
    finally:
        try: os.unlink(tmp)
        except Exception: pass

# ── Per-company pipeline ──────────────────────────────────────────────────────

def gather_candidates(name: str, ticker: str):
    """Return deduped candidate list: [(url, source, priority), ...] sorted by priority desc."""
    cands = []
    seen = set()

    # 1. Resolve official website — Yahoo first, OpenAI fallback
    site = yahoo_website(ticker) if ticker else None
    if not site:
        site = openai_resolve_website(name)

    # 2. Heuristic domain candidates (fallback when the authoritative one fails)
    dom_urls = domain_candidates(name, ticker)
    all_domains = ([site] if site else []) + dom_urls
    all_domains = list(dict.fromkeys(all_domains))[:6]

    # 3. Wikidata P154 — canonical source for big companies (highest prio)
    for t in src_wikidata_logo(name, ticker):
        if t[0] not in seen:
            seen.add(t[0])
            cands.append(t)

    # 4. Each domain → candidates from: scraping (best) + free APIs (fallbacks)
    for dom in all_domains:
        for fn in (src_scrape, src_logodev, src_iconhorse, src_google_favicon, src_duckduckgo):
            for t in (fn(dom, name) if fn is src_scrape else fn(dom)):
                url = t[0]
                if url in seen:
                    continue
                seen.add(url)
                cands.append(t)

    # 5. OpenAI web search for direct logo URLs (best when scraping fails)
    for t in src_openai_search(name, ticker):
        if t[0] not in seen:
            seen.add(t[0])
            cands.append(t)

    cands.sort(key=lambda x: x[2], reverse=True)
    return cands[:14]  # cap to limit vision calls

def process(company):
    name = company["name"]
    slug = company["slug"]
    ticker = (company.get("yahooSymbol") or "").strip()
    current_url = company.get("logoUrl")

    if args.verbose:
        print(f"  [start] {name} (ticker={ticker}, has_logo={bool(current_url)})")

    # Step 0: If a logo already exists AND we're not forcing, verify it first.
    #   If vision says it's valid, SKIP (huge speedup on `all` mode).
    if current_url and not args.force_recheck:
        content, ct = download(current_url)
        if content and is_plausible_image(content, ct or ""):
            v = vision_verify(name, content, ct or "")
            if v["valid"] and v["confidence"] in ("high", "medium"):
                return {
                    "ok": True, "skipped": True, "url": current_url,
                    "source": company.get("logoSource") or "existing",
                    "name": name, "vision": v,
                }
            # Current logo failed vision — clear it so we retry cleanly
            if args.verbose:
                print(f"  [bad logo] {name} — reason: {v['reason']}")
            clear_logo(company["id"])

    candidates = gather_candidates(name, ticker)
    if not candidates:
        return {"ok": False, "reason": "no candidates", "name": name}

    tried = []
    for url, source, prio in candidates:
        short_url = url[:60] + "…" if len(url) > 60 else url
        content, ct = download(url)
        if not content:
            tried.append((short_url, source, "download fail"))
            continue
        if not is_plausible_image(content, ct or ""):
            tried.append((short_url, source, f"not-image (ct={ct[:20] if ct else 'none'}, size={len(content)})"))
            continue

        v = vision_verify(name, content, ct or "")
        tried.append((short_url, source, f"{v['reason']} [{v.get('confidence','?')}]"))

        if v["valid"] and v["confidence"] in ("high", "medium"):
            final_bytes, final_ct = to_webp_200(content)
            ext = "svg" if final_ct == "image/svg+xml" else "webp"
            filename = f"{clean_slug(name)}.{ext}"
            blob_url = blob_upload(filename, final_bytes, final_ct)
            if not blob_url:
                return {"ok": False, "reason": "blob upload failed", "name": name}
            save_logo(company["id"], blob_url, source)
            return {"ok": True, "url": blob_url, "source": source, "name": name, "vision": v}

    return {"ok": False, "reason": "no candidate passed vision", "name": name, "tried": tried[:8]}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    cos = fetch_companies()
    total = len(cos)
    print(f"🎯 Mode: {args.mode} · workers: {args.workers} · dry-run: {args.dry_run}")
    print(f"📋 Processing {total} companies\n")

    fixed = 0
    skipped = 0
    failed = 0
    failed_list = []
    progress = [0]

    def one(co):
        nonlocal fixed, skipped, failed
        try:
            r = process(co)
        except Exception as e:
            r = {"ok": False, "reason": f"exception: {e}", "name": co["name"]}
        progress[0] += 1
        p = progress[0]
        if r["ok"]:
            if r.get("skipped"):
                skipped += 1
                if args.verbose:
                    print(f"  [{p:3d}/{total}] ⏩ {r['name'][:45].ljust(45)} (existing logo valid)")
            else:
                fixed += 1
                v = r["vision"]
                print(f"  [{p:3d}/{total}] ✅ {r['name'][:45].ljust(45)} "
                      f"[{r['source'][:12].ljust(12)}] conf={v['confidence']}")
        else:
            failed += 1
            failed_list.append(co["name"])
            print(f"  [{p:3d}/{total}] ❌ {co['name'][:45].ljust(45)} {r['reason'][:55]}")
            if args.verbose and r.get("tried"):
                for t in r["tried"]:
                    print(f"           · {t[1][:12].ljust(12)} → {t[2][:55]}")
        return r

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(one, cos))

    print(f"\n═══════════════════════════════════════════")
    print(f"✅ Fixed (new/replaced): {fixed}")
    print(f"⏩ Skipped (already OK): {skipped}")
    print(f"❌ Not found / bad     : {failed}")
    print(f"═══════════════════════════════════════════")

    if failed_list and len(failed_list) <= 30:
        print("\nFailed companies:")
        for n in failed_list:
            print(f"  · {n}")

if __name__ == "__main__":
    main()
