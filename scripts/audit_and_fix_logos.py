#!/usr/bin/env python3
"""
audit_and_fix_logos.py — Full audit + auto-fix with Vision validation

1. Fetches all logos from DB
2. GPT-4o Vision checks each logo (parallel, fast)
3. Bad logos → re-fetch via full pipeline (Clearbit → scrape → favicon → OpenAI)
4. Every candidate validated by Vision BEFORE uploading to Blob
5. Only confirmed logos get saved

Usage:
  python3 scripts/audit_and_fix_logos.py [--workers=20] [--fix-workers=30] [--dry-run]
"""

import os, re, sys, json, base64, argparse, subprocess, tempfile, warnings
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from PIL import Image
import psycopg2, psycopg2.extras
from openai import OpenAI

warnings.filterwarnings('ignore')

# ── Load env ──────────────────────────────────────────────────────────────────
def load_env(f):
    try:
        for l in open(f):
            m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.+)$', l.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"\'')
    except: pass

script_dir  = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(script_dir)
load_env(os.path.join(project_dir, '.env.local'))
load_env(os.path.join(project_dir, '.env'))
load_env('/Users/simonazoulay/SurfCampSenegal/.env')

OPENAI_KEY   = os.environ.get('OPENAI_API_KEY', '')
BLOB_TOKEN   = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')

if not OPENAI_KEY: print('❌ No OPENAI_API_KEY'); sys.exit(1)
if not BLOB_TOKEN: print('❌ No BLOB_READ_WRITE_TOKEN'); sys.exit(1)
print(f'✅ OpenAI: {OPENAI_KEY[:8]}...\n')

parser = argparse.ArgumentParser(prog='audit_and_fix_logos')
parser.add_argument('--workers',     type=int, default=20, help='Vision audit workers')
parser.add_argument('--fix-workers', type=int, default=30, help='Re-fetch workers')
parser.add_argument('--dry-run',     action='store_true')
parser.add_argument('--audit-only',  action='store_true')
args, _ = parser.parse_known_args()  # ignore unknown args from other scripts

UA     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124'
client = OpenAI(api_key=OPENAI_KEY)

# ── DB ────────────────────────────────────────────────────────────────────────
def get_db(): return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_all_logos():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id, name, slug, "logoUrl", "logoSource" FROM "Company" WHERE "logoUrl" IS NOT NULL ORDER BY name')
            return cur.fetchall()

def clear_logo(cid):
    if args.dry_run: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=NULL, "logoSource"=NULL WHERE id=%s', (cid,))
        conn.commit()

def save_logo(cid, url, source):
    if args.dry_run: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s', (url, source, cid))
        conn.commit()

# ── Image utils ───────────────────────────────────────────────────────────────
def fetch_bytes(url, timeout=7):
    r = requests.get(url, headers={'User-Agent': UA}, timeout=timeout, verify=False, allow_redirects=True)
    if not r.ok: return None, None
    ct = r.headers.get('Content-Type', '')
    return r.content, ct

def is_real_image(content, ct):
    if not content or len(content) < 300: return False
    if ct and 'text/html' in ct: return False
    if ct and 'svg' in ct: return len(content) > 100
    try:
        img = Image.open(BytesIO(content))
        w, h = img.size
        if w < 30 or h < 30: return False
        if w > 4000 or h > 4000: return False
        return True
    except:
        return bool(content[:4] in (b'\x89PNG', b'\xff\xd8\xff', b'RIFF', b'GIF8') or
                    b'<svg' in content[:100])

def encode_for_vision(content, ct):
    """Resize + encode for Vision API (minimize tokens)."""
    try:
        img = Image.open(BytesIO(content)).convert('RGBA' if 'png' in (ct or '') else 'RGB')
        img.thumbnail((200, 200), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f'data:image/png;base64,{b64}'
    except:
        b64 = base64.b64encode(content[:50000]).decode()
        return f'data:image/png;base64,{b64}'

# ── Vision validation ─────────────────────────────────────────────────────────
def vision_check(company_name: str, content: bytes, ct: str) -> dict:
    """Ask GPT-4o if this image is the correct logo for this company."""
    img_data = encode_for_vision(content, ct)
    try:
        resp = client.chat.completions.create(
            model='gpt-4o',
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': f'''Is this the official logo of the company "{company_name}"?

Respond with JSON only:
{{"is_logo": true/false, "is_correct_company": true/false, "issue": "brief issue or null", "confidence": "high/medium/low"}}

Reject if: photo, building, person, landscape, map, product image, wrong company logo, generic icon, abstract art.
Accept if: wordmark, brand symbol, letter mark that visually represents this company.'''
                    },
                    {'type': 'image_url', 'image_url': {'url': img_data, 'detail': 'low'}}
                ]
            }],
            max_tokens=120,
            response_format={'type': 'json_object'},
        )
        r = json.loads(resp.choices[0].message.content)
        valid = r.get('is_logo', False) and r.get('is_correct_company', True)
        return {'valid': valid, 'reason': r.get('issue'), 'confidence': r.get('confidence', '?'), 'raw': r}
    except Exception as e:
        return {'valid': False, 'reason': f'vision error: {str(e)[:60]}', 'confidence': '?'}

def audit_one(co):
    """Audit a single company logo. Returns (company_dict, audit_result)."""
    content, ct = fetch_bytes(co['logoUrl'])
    if content is None:
        return co, {'valid': False, 'reason': 'download failed', 'confidence': '?'}
    if not is_real_image(content, ct):
        return co, {'valid': False, 'reason': 'not a valid image file', 'confidence': 'high'}
    result = vision_check(co['name'], content, ct)
    return co, result

# ── Blob upload ───────────────────────────────────────────────────────────────
def clean_slug(name):
    c = re.sub(r'\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b)\.?\s*$', '', name, flags=re.IGNORECASE).strip()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', c.lower())).strip('-')[:50]

def upload_blob(company_name, slug, content, ct):
    if args.dry_run: return f'https://blob.vercel-storage.com/dry/{slug}'
    ext = 'svg' if ('svg' in (ct or '') or content[:5] == b'<svg ') else \
          'webp' if 'webp' in (ct or '') else \
          'jpg' if ('jpg' in (ct or '') or 'jpeg' in (ct or '')) else 'png'
    filename = f'{clean_slug(company_name)}.{ext}'
    ct_safe = (ct or 'image/png').split(';')[0].strip()
    with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as f:
        f.write(content); tmp = f.name
    result = subprocess.run([
        'node', '-e', f'''
const {{put}}=require("@vercel/blob");
const fs=require("fs");
const buf=fs.readFileSync("{tmp}");
put("logos/{filename}",buf,{{access:"public",token:"{BLOB_TOKEN}",contentType:"{ct_safe}",addRandomSuffix:false,allowOverwrite:true}})
.then(r=>console.log(r.url)).catch(e=>{{console.error(e.message);process.exit(1)}});'''
    ], capture_output=True, text=True, cwd=project_dir)
    os.unlink(tmp)
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()
    raise Exception(f'upload failed: {result.stderr[:80]}')

# ── Re-fetch pipeline (inline, no import to avoid conflicts) ──────────────────
# Inlined from fetch_logos_py to avoid import side-effects

def refetch_with_vision_check(co):
    """Re-fetch logo using the pipeline, validate each candidate with Vision before saving."""
    name   = co['name']
    slug   = co['slug']
    clean  = re.sub(r'[^a-z0-9]+', '', name.lower())[:20]
    ticker = ''

    websites = [f'https://www.{clean}.fr', f'https://www.{clean}.com',
                f'https://{clean}.fr', f'https://{clean}.com']

    strategies = [
        ('clearbit',   lambda: try_clearbit(name, clean, websites)),
        ('scrape',     lambda: try_scrape_sites(name, websites)),
        ('favicon',    lambda: try_favicons(websites)),
        ('openai',     lambda: try_openai_search(name)),
    ]

    for strategy_name, fn in strategies:
        try:
            result = fn()
            if not result: continue
            url, source = result
            content, ct = fetch_bytes(url)
            if not content or not is_real_image(content, ct): continue
            # ✅ VISION CHECK BEFORE UPLOAD
            check = vision_check(name, content, ct)
            if not check['valid']:
                print(f'  ⚠️  [{strategy_name}] rejected by vision: {check["reason"]} — {name}')
                continue
            # Upload
            blob_url = upload_blob(name, slug, content, ct)
            return blob_url, source
        except Exception as e:
            continue
    return None, None

def try_clearbit(name, clean, websites):
    domains = [f'{clean}.fr', f'{clean}.com']
    for d in domains:
        url = f'https://logo.clearbit.com/{d}'
        try:
            r = requests.get(url, headers={'User-Agent': UA}, timeout=5, verify=False)
            ct = r.headers.get('Content-Type', '')
            if r.status_code in (200, 403) and ('image' in ct or r.status_code == 200):
                if len(r.content) > 200: return url, 'clearbit'
        except: pass
    return None

def try_scrape_sites(name, websites):
    """Scrape header logo from websites."""
    for w in websites[:3]:
        try:
            r = requests.get(w, headers={'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9'},
                             timeout=8, verify=False, allow_redirects=True)
            if not r.ok: continue
            html = r.text
            base = r.url.split('/')[0] + '//' + r.url.split('/')[2]
            # OG image
            m = re.search(r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
            if not m: m = re.search(r'content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image', html, re.I)
            if m:
                url = m.group(1).strip()
                if not url.startswith('http'): url = base + url
                return url, 'og_image'
            # Header logo
            header_m = re.search(r'<header[^>]*>([\s\S]{0,8000}?)</header>', html, re.I)
            block = header_m.group(1) if header_m else html[:10000]
            imgs = re.findall(r'<img[^>]+>', block, re.I)
            for tag in imgs:
                src = re.search(r'(?:src|data-src)=["\']([^"\']+)', tag, re.I)
                if not src: continue
                url = src.group(1)
                if any(x in url.lower() for x in ['favicon','16x16','32x32','sprite']): continue
                if not url.startswith('http'): url = base + (url if url.startswith('/') else '/' + url)
                url = url.replace('&amp;','&').replace(' ','%20')
                if re.search(r'logo|brand', tag+url, re.I):
                    return url, 'scraped'
        except: continue
    return None

def try_favicons(websites):
    """Google Favicon HD."""
    for w in websites[:2]:
        try:
            domain = w.replace('https://','').replace('http://','').split('/')[0]
            url = f'https://www.google.com/s2/favicons?domain={domain}&sz=128'
            r = requests.get(url, headers={'User-Agent': UA}, timeout=5, verify=False)
            if r.ok and 'image' in r.headers.get('Content-Type','').lower():
                return url, 'google_favicon'
        except: continue
    return None

def try_openai_search(name):
    """OpenAI web search for logo URL."""
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini-search-preview',
            messages=[{'role':'user','content':
                f'Find official logo image URL (.png .svg .jpg) for French company "{name}". '
                f'Exclude wikipedia.org, wikimedia.org, google.com/s2/favicons. '
                f'Return ONLY the direct image URL.'}],
            max_tokens=150,
        )
        text = resp.choices[0].message.content or ''
        urls = re.findall(r'https?://[^\s<>"\']+\.(?:png|jpg|jpeg|svg|webp)', text, re.I)
        urls = [u for u in urls if 'wikipedia' not in u and 'google.com/s2' not in u]
        if urls: return urls[0], 'openai'
    except: pass
    return None

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    companies = fetch_all_logos()
    total = len(companies)
    print(f'🔍 Auditing {total} logos with GPT-4o Vision ({args.workers} workers)...\n')

    bad  = []
    good = []
    completed = [0]

    def audit_wrapper(co):
        co_dict, result = audit_one(co)
        completed[0] += 1
        pct = completed[0] / total * 100
        if not result['valid']:
            bad.append({**dict(co_dict), **result})
            print(f'  ❌ [{completed[0]:3d}/{total}] {co["name"][:45].ljust(45)} {result.get("reason","?")[:50]} [{result.get("confidence","?")}]')
        else:
            good.append(dict(co_dict))
        if completed[0] % 50 == 0:
            print(f'\n  Progress: {completed[0]}/{total} ({pct:.0f}%) — ✅{len(good)} ❌{len(bad)}\n')
        return result

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(audit_wrapper, companies))

    print(f'\n{"="*60}')
    print(f'AUDIT COMPLETE')
    print(f'  ✅ Valid   : {len(good)} / {total} ({len(good)/total*100:.0f}%)')
    print(f'  ❌ Invalid : {len(bad)}')

    # Save report
    report = {'good': len(good), 'bad': len(bad), 'bad_list': [
        {'name': b['name'], 'reason': b.get('reason'), 'confidence': b.get('confidence'), 'url': b['logoUrl']}
        for b in bad
    ]}
    with open(os.path.join(script_dir, 'logo_audit_report.json'), 'w') as f:
        json.dump(report, f, indent=2)
    print(f'  📄 Report: scripts/logo_audit_report.json')

    if args.audit_only:
        return

    print(f'\n🔧 Re-fetching {len(bad)} bad logos with Vision validation ({args.fix_workers} workers)...\n')

    # Clear bad logos first
    for b in bad:
        clear_logo(b['id'])

    fixed  = [0]
    failed = []
    done   = [0]

    def fix_wrapper(co):
        done[0] += 1
        blob_url, source = refetch_with_vision_check(co)
        if blob_url:
            save_logo(co['id'], blob_url, source)
            fixed[0] += 1
            print(f'  ✅ [{done[0]:3d}/{len(bad)}] [{source.ljust(12)}] {co["name"][:45]}')
        else:
            failed.append(co['name'])
            print(f'  ❌ [{done[0]:3d}/{len(bad)}] No valid logo found: {co["name"][:45]}')
        pct = done[0] / len(bad) * 100
        print(f'\r  Progress: {done[0]}/{len(bad)} ({pct:.0f}%) — fixed={fixed[0]}', end='', flush=True)

    with ThreadPoolExecutor(max_workers=args.fix_workers) as ex:
        list(ex.map(fix_wrapper, bad))

    print(f'\n\n{"="*60}')
    print(f'FIX COMPLETE')
    print(f'  ✅ Fixed   : {fixed[0]} / {len(bad)}')
    print(f'  ❌ Failed  : {len(failed)}')

    # DB final count
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" IS NOT NULL')
            with_logo = cur.fetchone()['c']
            cur.execute('SELECT COUNT(*) as c FROM "Company"')
            total_co = cur.fetchone()['c']
    print(f'\n  📊 DB coverage: {with_logo}/{total_co} ({with_logo/total_co*100:.1f}%)')

    if failed:
        print(f'\n  ❌ Still missing ({len(failed)}):')
        for n in failed[:20]: print(f'    - {n}')
    print('='*60)

if __name__ == '__main__':
    main()
