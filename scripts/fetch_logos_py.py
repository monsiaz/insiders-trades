#!/usr/bin/env python3
"""
fetch_logos_py.py — Port fidèle de step_06 adapté au projet insiders-trades.

Pipeline (identique au script Python à 90% de succès) :
  1. Clearbit logo API (200 ou 403 WAF acceptés)
  2. Scraping site officiel (OG image + header logo + sélecteurs CSS)
  3. Google Favicon HD (fallback)
  4. CDN guessing (SimpleIcons, etc.)
  5. OpenAI gpt-4o-search-preview (dernier recours, 3 prompts parallèles)

Upload vers Vercel Blob, stocke l'URL en DB.

Usage:
  python3 scripts/fetch_logos_py.py [--limit=N] [--workers=50] [--dry-run]
"""

import os, re, sys, json, asyncio, argparse
from io import BytesIO
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup
from PIL import Image

# ── Load env ──────────────────────────────────────────────────────────────────

def load_env(path):
    try:
        for line in open(path):
            m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.+)$', line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"\'')
    except: pass

script_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(script_dir)
load_env(os.path.join(project_dir, '.env.local'))
load_env(os.path.join(project_dir, '.env'))
load_env('/Users/simonazoulay/SurfCampSenegal/.env')

OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')
BLOB_TOKEN = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')

if not OPENAI_KEY: print('⚠️  No OPENAI_API_KEY')
else: print(f'✅ OpenAI: {OPENAI_KEY[:8]}...')
if not BLOB_TOKEN: print('❌ No BLOB_READ_WRITE_TOKEN'); sys.exit(1)

# ── Args ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument('--limit', type=int, default=9999)
parser.add_argument('--workers', type=int, default=50)
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

# ── DB via psycopg2 ───────────────────────────────────────────────────────────

import psycopg2, psycopg2.extras

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_companies(limit):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT c.id, c.name, c.slug, c."yahooSymbol"
                FROM "Company" c
                WHERE c."logoUrl" IS NULL
                ORDER BY (SELECT COUNT(*) FROM "Declaration" d WHERE d."companyId" = c.id) DESC
                LIMIT %s
            ''', (limit,))
            return cur.fetchall()

def save_logo(company_id, logo_url, source):
    if args.dry_run: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s',
                (logo_url, source, company_id)
            )
        conn.commit()

# ── Image validation (avec PIL, identique au script Python) ───────────────────

def test_image_url(url, min_width=50, min_height=20):
    """Strict validation: HTTP 200 + Content-Type + PIL dimensions."""
    if not url or not url.startswith('http'):
        return False
    # Rejeter Wikipedia, Fandom
    bad = ['wikipedia.org', 'wikimedia.org', 'fandom.com', 'special:filepath',
           'google.com/s2/favicons']
    if any(b in url.lower() for b in bad):
        return False
    try:
        url = url.strip().rstrip('.,;!?)').rstrip('([')
        url = re.sub(r'[\s\u200b-\u200d\ufeff]+', '', url)
        r = requests.get(url, headers={'User-Agent': UA}, timeout=7,
                         allow_redirects=True, verify=False, stream=True)
        if r.status_code != 200:
            return False
        ct = r.headers.get('Content-Type', '').lower()
        if 'text/html' in ct:
            return False
        content = r.content
        # SVG: just check size
        if '.svg' in url.lower() or 'image/svg' in ct:
            return len(content) > 100
        # PNG/JPG: validate dimensions with PIL
        try:
            img = Image.open(BytesIO(content))
            w, h = img.size
            if w < min_width or h < min_height: return False
            if w > 3000 or h > 2000: return False
            ratio = w / h
            if ratio < 0.3 or ratio > 10: return False
            return True
        except:
            return 'image' in ct
    except:
        return False

# ── Clearbit ──────────────────────────────────────────────────────────────────

def get_logo_clearbit(website):
    if not website: return None
    domain = website.replace('https://','').replace('http://','').split('/')[0]
    variants = []
    if 'www.' in domain:
        variants += [domain, domain.replace('www.','')]
    else:
        variants += [f'www.{domain}', domain]
    # Also try .com if it's .fr
    base = domain.replace('www.','')
    if base.endswith('.fr'):
        variants += [base[:-3]+'.com', 'www.'+base[:-3]+'.com']

    for v in dict.fromkeys(variants):  # dedupe preserving order
        url = f'https://logo.clearbit.com/{v}'
        try:
            r = requests.get(url, headers={'User-Agent': UA}, timeout=5,
                             allow_redirects=True, verify=False, stream=True)
            ct = r.headers.get('Content-Type','').lower()
            content = r.content
            if r.status_code in (200, 403):
                if 'image' in ct: return (url, 'clearbit')
                if len(content) > 100:
                    if (content.startswith(b'\x89PNG') or content.startswith(b'\xff\xd8\xff')
                            or content.startswith(b'<svg') or content.startswith(b'<?xml')):
                        return (url, 'clearbit')
                if r.status_code == 403 and len(content) > 50:
                    return (url, 'clearbit')
        except: pass
    return None

# ── Scraping (OG + header + CSS selectors) ────────────────────────────────────

def scrape_logo(website, name=''):
    if not website: return None
    try:
        if not website.startswith(('http://','https://')):
            website = 'https://' + website
        r = requests.get(website, headers={
            'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8'
        }, timeout=9, allow_redirects=True, verify=False)
        if r.status_code != 200: return None
        soup = BeautifulSoup(r.text, 'html.parser')
        base_url = r.url

        # 1. OG image
        for prop in ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']:
            tag = soup.find('meta', property=prop) or soup.find('meta', attrs={'name': prop})
            if tag and tag.get('content'):
                img_url = tag['content'].strip().rstrip('.,;!?)')
                if not img_url.startswith('http'):
                    img_url = urljoin(base_url, img_url)
                if test_image_url(img_url): return (img_url, 'og_image')
                if test_image_url(img_url, 32, 32): return (img_url, 'og_image')

        # 2. Header/nav logo
        for container in [soup.find('header'), soup.find('nav'),
                          soup.find(class_=re.compile(r'navbar|nav-bar|site-header', re.I))]:
            if not container: continue
            for img in container.find_all('img'):
                src = (img.get('src') or img.get('data-src') or img.get('data-lazy-src')
                       or img.get('data-original') or img.get('data-lazy'))
                if not src: continue
                if any(x in src.lower() for x in ['favicon','icon-','icon.','16x16','32x32','apple-touch']): continue
                if not src.startswith('http'): src = urljoin(base_url, src)
                src = src.replace('&amp;','&').replace(' ','%20')
                if src.endswith('.svg') or 'image/svg' in src:
                    if test_image_url(src): return (src, 'scraped')
                elif test_image_url(src): return (src, 'scraped')

        # 3. CSS selectors for logo
        selectors = [
            'img[class*="logo" i]', 'img[id*="logo" i]', 'img[alt*="logo" i]',
            'img[src*="logo" i]', '.logo img', 'a.logo img', '.navbar-brand img',
        ]
        candidates = []
        for sel in selectors:
            for img in soup.select(sel)[:5]:
                src = (img.get('src') or img.get('data-src') or img.get('data-lazy-src')
                       or img.get('data-original'))
                if not src or src.startswith('data:'): continue
                if not src.startswith('http'): src = urljoin(base_url, src)
                src = src.replace('&amp;','&').replace(' ','%20')
                alt = img.get('alt',''); cls = ' '.join(img.get('class',[]))
                prio = 2 if ('logo' in alt.lower() or 'logo' in cls.lower()) else 1
                candidates.append((prio, src))

        candidates.sort(key=lambda x: x[0], reverse=True)
        for _, src in candidates:
            try:
                from urllib.parse import urlparse; urlparse(src)
                if test_image_url(src): return (src, 'scraped')
            except: pass

    except Exception as e:
        pass
    return None

# ── Google Favicon ────────────────────────────────────────────────────────────

def get_google_favicon(website):
    if not website: return None
    domain = website.replace('https://','').replace('http://','').split('/')[0]
    url = f'https://www.google.com/s2/favicons?domain={domain}&sz=128'
    try:
        r = requests.get(url, headers={'User-Agent': UA}, timeout=5, verify=False)
        if r.status_code == 200 and 'image' in r.headers.get('Content-Type','').lower():
            return (url, 'google_favicon')
    except: pass
    return None

# ── OpenAI gpt-4o-search-preview ─────────────────────────────────────────────

def openai_search(name, website=''):
    if not OPENAI_KEY: return None
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)

    prompts = [
        f'Find the official logo image URL (.png .svg .jpg .webp) for the French company "{name}"{(" website: "+website) if website else ""}. Exclude wikipedia.org, wikimedia.org, google.com/s2/favicons. Return ONLY direct image URLs, one per line.',
        f'Logo URL for French company "{name}". Check official website header, cdnlogo.com, seeklogo.com, worldvectorlogo.com. Return ONLY image URLs (.png .svg .jpg .webp).',
        f'"{name}" French company logo. Find on official site assets, CDN, or logo database. Direct image URL only.',
    ]

    url_patterns = [
        r'https?://[^\s<>"\)]+\.(?:png|jpg|jpeg|svg|webp|gif)',
        r'https?://[^\s<>"\)]+/logo[^\s<>"\)]*',
        r'https?://[^\s<>"\)]+/brand[^\s<>"\)]*',
    ]

    def call(prompt):
        try:
            r = client.chat.completions.create(
                model='gpt-4o-search-preview',
                messages=[{'role':'user','content':prompt}],
                max_tokens=400,
            )
            return r.choices[0].message.content or ''
        except: return ''

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = [ex.submit(call, p) for p in prompts]
        texts = [f.result() for f in futures]

    all_urls = []
    for text in texts:
        for pat in url_patterns:
            all_urls.extend(re.findall(pat, text, re.IGNORECASE))
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('http'):
                cleaned = re.sub(r'[^\w\.\-\/:%&?=#+@]+$', '', line)
                all_urls.append(cleaned)

    # Dedupe, prioritize image extensions
    seen = set()
    sorted_urls = sorted(
        [u.strip().rstrip('.,;!?)') for u in all_urls if u.startswith('http')],
        key=lambda u: (
            2 if re.search(r'\.(png|svg|jpg|webp)(\?|$)', u, re.I) else 0
        ) + (1 if 'logo' in u.lower() or 'brand' in u.lower() else 0),
        reverse=True
    )

    for url in sorted_urls:
        if url in seen or not url.startswith('http'): continue
        seen.add(url)
        if any(b in url for b in ['wikipedia.org','wikimedia.org','google.com/s2/favicons']): continue
        if test_image_url(url): return (url, 'openai')
        if test_image_url(url, 32, 16): return (url, 'openai')

    return None

# ── Upload to Vercel Blob ─────────────────────────────────────────────────────

def clean_slug_for_filename(name):
    """Generate clean filename from company name — no AMF number suffix."""
    clean = re.sub(
        r'\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|'
        r'corp\b|ltd\b|s\.p\.a\.|s\.b\.|group\b|groupe\b|holding\b)\.?\s*$',
        '', name, flags=re.IGNORECASE
    ).strip()
    slug = re.sub(r'[^a-z0-9]+', '-', clean.lower()).strip('-')
    slug = re.sub(r'-+', '-', slug)
    return slug[:50]

def upload_blob(db_slug, content, content_type, company_name=None):
    """Upload with clean filename. Uses company_name for clean slug if provided."""
    if args.dry_run:
        return f'https://blob.vercel-storage.com/dry/{db_slug}'

    # Determine extension
    ext = 'svg' if ('svg' in (content_type or '') or content[:5] == b'<svg ') else \
          'webp' if 'webp' in (content_type or '') else \
          'jpg' if ('jpg' in (content_type or '') or 'jpeg' in (content_type or '')) else 'png'

    # Use clean name-based slug, not the AMF-number slug
    if company_name:
        filename_base = clean_slug_for_filename(company_name)
    else:
        # Strip trailing -NNNN from db_slug
        filename_base = re.sub(r'-\d+$', '', db_slug)

    filename = f'{filename_base}.{ext}'

    import tempfile, subprocess
    with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as f:
        f.write(content); tmp = f.name

    ct_safe = (content_type or 'image/png').split(';')[0].strip()
    result = subprocess.run([
        'node', '-e', f'''
const {{put}}=require("@vercel/blob");
const fs=require("fs");
const buf=fs.readFileSync("{tmp}");
put("logos/{filename}",buf,{{
  access:"public",
  token:"{BLOB_TOKEN}",
  contentType:"{ct_safe}",
  addRandomSuffix:false,
  allowOverwrite:true
}}).then(r=>console.log(r.url)).catch(e=>{{console.error(e.message);process.exit(1)}});
'''
    ], capture_output=True, text=True, cwd=project_dir)
    os.unlink(tmp)

    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()
    raise Exception(f'Blob upload failed: {result.stderr[:100]}')

# ── Per-company pipeline ──────────────────────────────────────────────────────

def get_content_for_url(url):
    """Download image and return (content_bytes, content_type)."""
    try:
        r = requests.get(url, headers={'User-Agent': UA}, timeout=8,
                         allow_redirects=True, verify=False)
        ct = r.headers.get('Content-Type', 'image/png')
        return r.content, ct
    except: return None, None

def process_company(company):
    name = company['name']
    slug = company['slug']
    ticker = company.get('yahooSymbol') or ''

    # Build domain candidates from name
    clean = re.sub(
        r'\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b)\.?\s*$',
        '', name, flags=re.IGNORECASE
    ).strip()
    slug_name = re.sub(r'[^a-z0-9]+', '', clean.lower())[:20]
    ticker_clean = re.sub(r'\.[A-Z]{1,3}$', '', ticker).lower()

    # Website candidates
    websites = []
    for base in [slug_name, ticker_clean]:
        if base and len(base) >= 2:
            websites += [f'https://www.{base}.fr', f'https://www.{base}.com',
                         f'https://{base}.fr', f'https://{base}.com']
    websites = list(dict.fromkeys(filter(None, websites)))[:8]

    # Phase 1: Clearbit (most reliable when accessible)
    for w in websites[:4]:
        r = get_logo_clearbit(w)
        if r:
            content, ct = get_content_for_url(r[0])
            if content:
                blob_url = upload_blob(slug, content, ct or 'image/png', company_name=name)
                return {'url': blob_url, 'source': r[1]}

    # Phase 2: Scrape each candidate website
    for w in websites[:4]:
        r = scrape_logo(w, name)
        if r:
            content, ct = get_content_for_url(r[0])
            if content:
                blob_url = upload_blob(slug, content, ct or 'image/png', company_name=name)
                return {'url': blob_url, 'source': r[1]}

    # Phase 3: Google Favicon (quick fallback, acceptable quality)
    for w in websites[:2]:
        r = get_google_favicon(w)
        if r:
            content, ct = get_content_for_url(r[0])
            if content:
                blob_url = upload_blob(slug, content, ct or 'image/png', company_name=name)
                return {'url': blob_url, 'source': r[1]}

    # Phase 4: OpenAI last resort
    best_website = websites[0] if websites else ''
    r = openai_search(name, best_website)
    if r:
        content, ct = get_content_for_url(r[0])
        if content:
            blob_url = upload_blob(slug, content, ct or 'image/png', company_name=name)
            return {'url': blob_url, 'source': r[1]}

    return None

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import warnings
    warnings.filterwarnings('ignore')  # suppress SSL warnings

    companies = fetch_companies(args.limit)
    total = len(companies)
    print(f'📊  {total} companies without logo\n')
    print(f'   workers={args.workers}  {"DRY RUN" if args.dry_run else "LIVE"}\n')

    stats = {'found': 0, 'notFound': 0, 'bySource': {}}
    completed = [0]
    failed = []

    def proc(co):
        result = process_company(dict(co))
        completed[0] += 1
        if result:
            if not args.dry_run:
                save_logo(co['id'], result['url'], result['source'])
            stats['found'] += 1
            stats['bySource'][result['source']] = stats['bySource'].get(result['source'], 0) + 1
            pct = completed[0]/total*100
            src_str = '  '.join(f'{k}={v}' for k,v in stats['bySource'].items())
            print(f'  ✅ [{result["source"][:12].ljust(12)}] {co["name"][:40].ljust(40)}')
        else:
            stats['notFound'] += 1
            failed.append(co['name'])
        pct = completed[0]/total*100
        bar = '█'*int(pct/2) + '░'*(50-int(pct/2))
        src_str = '  '.join(f'{k}={v}' for k,v in stats['bySource'].items())
        print(f'\r[{bar}] {pct:.0f}% ({completed[0]}/{total}) ✅{stats["found"]}  ❌{stats["notFound"]}  [{src_str}]', end='', flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(proc, companies))

    print('\n')
    # Get final DB counts
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) as total FROM "Company"')
            db_total = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" IS NOT NULL')
            db_with = cur.fetchone()['c']

    print('════════════════════════════════════════════════════')
    print(f'✅ Found    : {stats["found"]} / {total} ({stats["found"]/total*100:.0f}%)')
    print(f'❌ Not found: {stats["notFound"]}')
    print(f'\nBy source:')
    for k,v in stats['bySource'].items():
        print(f'  {k.ljust(16)}: {v}')
    print(f'\n📊 DB coverage: {db_with}/{db_total} ({db_with/db_total*100:.1f}%)')
    if failed:
        print(f'\n❌ Still missing ({len(failed)}):')
        for n in failed[:20]: print(f'  - {n}')
    print('════════════════════════════════════════════════════\n')

if __name__ == '__main__':
    main()
