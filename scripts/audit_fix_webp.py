#!/usr/bin/env python3
"""
audit_fix_webp.py — Full logo pipeline:
1. Vision audit all existing logos (parallel)
2. Re-fetch bad ones with Vision validation before upload
3. Convert ALL logos to WebP (max 200×200, quality 85) for performance
4. Upload optimized WebP to Blob, update DB

Usage:
  python3 scripts/audit_fix_webp.py [--workers=20] [--dry-run] [--audit-only]
"""

import os, re, sys, json, base64, argparse, subprocess, tempfile, warnings
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image
import psycopg2, psycopg2.extras

warnings.filterwarnings('ignore')

# ── Env ───────────────────────────────────────────────────────────────────────
def load_env(f):
    try:
        for l in open(f):
            m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.+)$', l.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"\'')
    except: pass

sd = os.path.dirname(os.path.abspath(__file__))
pd = os.path.dirname(sd)
load_env(os.path.join(pd, '.env.local'))
load_env(os.path.join(pd, '.env'))
load_env('/Users/simonazoulay/SurfCampSenegal/.env')

OPENAI_KEY   = os.environ.get('OPENAI_API_KEY', '')
BLOB_TOKEN   = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')

if not OPENAI_KEY: print('❌ No OPENAI_API_KEY'); sys.exit(1)
if not BLOB_TOKEN: print('❌ No BLOB_READ_WRITE_TOKEN'); sys.exit(1)
print(f'✅ OpenAI: {OPENAI_KEY[:8]}...\n')

parser = argparse.ArgumentParser()
parser.add_argument('--workers',    type=int, default=20)
parser.add_argument('--dry-run',    action='store_true')
parser.add_argument('--audit-only', action='store_true')
args, _ = parser.parse_known_args()

from openai import OpenAI
client = OpenAI(api_key=OPENAI_KEY)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124'

# ── DB ────────────────────────────────────────────────────────────────────────
def get_db(): return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_all():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id, name, slug, "logoUrl", "logoSource" FROM "Company" WHERE "logoUrl" IS NOT NULL ORDER BY name')
            return cur.fetchall()

def fetch_missing():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id, name, slug, "yahooSymbol" FROM "Company" WHERE "logoUrl" IS NULL ORDER BY name')
            return cur.fetchall()

def save_logo(cid, url, source):
    if args.dry_run: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s', (url, source, cid))
        conn.commit()

def clear_logo(cid):
    if args.dry_run: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=NULL, "logoSource"=NULL WHERE id=%s', (cid,))
        conn.commit()

# ── Image utils ───────────────────────────────────────────────────────────────
def fetch_bytes(url, timeout=8):
    r = requests.get(url, headers={'User-Agent': UA}, timeout=timeout, verify=False, allow_redirects=True)
    if not r.ok: return None, None
    return r.content, r.headers.get('Content-Type', 'image/png')

def to_webp(content, ct, max_size=200, quality=85):
    """Convert any image to WebP 200×200 max, return bytes."""
    try:
        img = Image.open(BytesIO(content)).convert('RGBA')
        # Transparent background → white for logos
        bg = Image.new('RGBA', img.size, (255, 255, 255, 0))
        bg.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
        img = bg.convert('RGB') if img.mode == 'RGBA' else img.convert('RGB')
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='WEBP', quality=quality, method=6)
        return buf.getvalue()
    except Exception as e:
        return None

def is_real_image(content, ct):
    if not content or len(content) < 200: return False
    if ct and 'text/html' in ct: return False
    # SVG: accept if non-trivial
    if ct and 'svg' in ct: return len(content) > 80
    try:
        img = Image.open(BytesIO(content))
        w, h = img.size
        if w < 16 or h < 16: return False
        if w > 5000 or h > 5000: return False
        return True
    except:
        return bool(content[:4] in (b'\x89PNG', b'\xff\xd8\xff', b'RIFF', b'GIF8'))

def encode_vision(content, ct):
    try:
        img = Image.open(BytesIO(content)).convert('RGB')
        img.thumbnail((200, 200), Image.LANCZOS)
        buf = BytesIO(); img.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f'data:image/png;base64,{b64}'
    except:
        b64 = base64.b64encode(content[:40000]).decode()
        return f'data:image/png;base64,{b64}'

# ── Vision check ─────────────────────────────────────────────────────────────
def vision_ok(name, content, ct):
    img_data = encode_vision(content, ct)
    try:
        resp = client.chat.completions.create(
            model='gpt-4o',
            messages=[{'role': 'user', 'content': [
                {'type': 'text', 'text': f'Is this the official logo of "{name}"? Reply JSON: {{"ok": true/false, "reason": "brief reason or null"}}. Reject: photos, buildings, people, wrong brand, generic/abstract art. Accept: wordmark, brand symbol, letter mark for this company.'},
                {'type': 'image_url', 'image_url': {'url': img_data, 'detail': 'low'}}
            ]}],
            max_tokens=80,
            response_format={'type': 'json_object'},
        )
        r = json.loads(resp.choices[0].message.content)
        return r.get('ok', False), r.get('reason')
    except Exception as e:
        return False, f'vision err: {str(e)[:40]}'

# ── OpenAI search for logo URL ────────────────────────────────────────────────
def search_logo_openai(name, ticker=''):
    prompts = [
        f'Find the official logo image URL (.png .svg .jpg .webp) for French company "{name}"{(" ticker "+ticker) if ticker else ""}. Exclude: wikipedia.org, wikimedia.org, google.com/s2/favicons. Search official website, cdnlogo.com, seeklogo.com, worldvectorlogo.com. Return ONLY the direct image URL.',
        f'"{name}" French company official logo URL. Check: official website header, brandfetch.io, cdnlogo.com. NOT wikipedia, NOT google favicons. Return ONE direct image URL ending in .png .svg .jpg .webp.',
    ]
    for prompt in prompts:
        try:
            r = client.chat.completions.create(
                model='gpt-4o-mini-search-preview',
                messages=[{'role':'user','content': prompt}],
                max_tokens=200,
            )
            text = r.choices[0].message.content or ''
            urls = re.findall(r'https?://[^\s<>"\']+', text)
            urls = [u.rstrip('.,;') for u in urls if
                    not any(b in u for b in ['wikipedia','wikimedia','google.com/s2'])]
            # Prioritize image extensions
            urls.sort(key=lambda u: 0 if re.search(r'\.(png|svg|jpg|webp)(\?|$)', u, re.I) else 1)
            for url in urls[:5]:
                content, ct = fetch_bytes(url)
                if content and is_real_image(content, ct):
                    ok, reason = vision_ok(name, content, ct)
                    if ok:
                        return url, content, ct
        except: pass
    return None, None, None

# ── Scrape website for logo ───────────────────────────────────────────────────
def scrape_for_logo(name, ticker=''):
    slug = re.sub(r'[^a-z0-9]+', '', name.lower())[:18]
    t = ticker.replace('.PA','').lower() if ticker else ''
    domains = list(dict.fromkeys([f'{slug}.fr', f'{slug}.com', f'{t}.fr', f'{t}.com'] if t else [f'{slug}.fr', f'{slug}.com']))

    for domain in domains[:4]:
        for scheme in [f'https://www.{domain}', f'https://{domain}']:
            try:
                res = requests.get(scheme, headers={'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9'},
                                   timeout=7, verify=False, allow_redirects=True)
                if not res.ok: continue
                html = res.text
                base = res.url.split('/')[0] + '//' + res.url.split('/')[2]

                # OG image
                m = re.search(r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
                if not m: m = re.search(r'content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image', html, re.I)
                if m:
                    url = m.group(1)
                    if not url.startswith('http'): url = base + url
                    url = url.replace('&amp;', '&').replace(' ', '%20')
                    content, ct = fetch_bytes(url)
                    if content and is_real_image(content, ct):
                        ok, _ = vision_ok(name, content, ct)
                        if ok: return url, content, ct

                # Header logo imgs
                block = (re.search(r'<header[^>]*>([\s\S]{0,8000}?)</header>', html, re.I) or re.search(r'<nav[^>]*>([\s\S]{0,5000}?)</nav>', html, re.I))
                block = block.group(1) if block else html[:10000]
                for tag in re.findall(r'<img[^>]+>', block, re.I)[:10]:
                    src_m = re.search(r'(?:src|data-src)=["\']([^"\']+)', tag, re.I)
                    if not src_m: continue
                    src = src_m.group(1)
                    if any(x in src.lower() for x in ['favicon','16x16','32x32','sprite']): continue
                    if not src.startswith('http'): src = base + (src if src.startswith('/') else '/' + src)
                    src = src.replace('&amp;', '&').replace(' ', '%20')
                    if re.search(r'logo|brand', tag + src, re.I):
                        content, ct = fetch_bytes(src)
                        if content and is_real_image(content, ct):
                            ok, _ = vision_ok(name, content, ct)
                            if ok: return src, content, ct
            except: continue
    return None, None, None

# ── Blob upload ───────────────────────────────────────────────────────────────
def clean_slug(name):
    c = re.sub(r'\s+(s\.a\.|s\.e\.|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b)\.?\s*$', '', name, flags=re.IGNORECASE).strip()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', c.lower())).strip('-')[:50]

def upload_webp(company_name, slug, webp_bytes):
    if args.dry_run: return f'https://blob.vercel-storage.com/dry/{slug}.webp'
    filename = f'{clean_slug(company_name)}.webp'
    with tempfile.NamedTemporaryFile(suffix='.webp', delete=False) as f:
        f.write(webp_bytes); tmp = f.name
    result = subprocess.run([
        'node', '-e', f'''
const {{put}}=require("@vercel/blob");
const fs=require("fs");
const buf=fs.readFileSync("{tmp}");
put("logos/{filename}",buf,{{access:"public",token:"{BLOB_TOKEN}",contentType:"image/webp",addRandomSuffix:false,allowOverwrite:true}})
.then(r=>console.log(r.url)).catch(e=>{{console.error(e.message);process.exit(1)}});'''
    ], capture_output=True, text=True, cwd=pd)
    os.unlink(tmp)
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()
    raise Exception(f'upload failed: {result.stderr[:80]}')

# ── Main pipeline ─────────────────────────────────────────────────────────────
def main():
    print(f'🔍 PHASE 1 — Vision audit + WebP conversion ({args.workers} workers)\n')

    companies = fetch_all()
    total = len(companies)
    bad, good, converted = [], [], []
    done = [0]

    def audit_one(co):
        content, ct = fetch_bytes(co['logoUrl'])
        done[0] += 1
        pct = done[0] / total * 100

        if not content or not is_real_image(content, ct):
            bad.append(dict(co))
            print(f'  ❌ [{done[0]:3d}/{total}] {co["name"][:45].ljust(45)} download failed')
            return

        ok, reason = vision_ok(co['name'], content, ct)
        if not ok:
            bad.append(dict(co))
            print(f'  ❌ [{done[0]:3d}/{total}] {co["name"][:45].ljust(45)} {str(reason)[:50]}')
            return

        # Good logo — convert to WebP if not already
        current_url = co['logoUrl']
        already_webp = current_url.endswith('.webp')

        if already_webp:
            good.append(dict(co))
            return

        webp = to_webp(content, ct)
        if webp:
            try:
                new_url = upload_webp(co['name'], co['slug'], webp)
                save_logo(co['id'], new_url, co['logoSource'])
                converted.append({'name': co['name'], 'from': current_url[-30:], 'to': new_url[-30:]})
            except Exception as e:
                print(f'  ⚠️  upload err {co["name"]}: {e}')
                good.append(dict(co))
        else:
            good.append(dict(co))

        if done[0] % 50 == 0:
            print(f'\n  ── {done[0]}/{total} ({pct:.0f}%) | ✅{len(good)+len(converted)} ❌{len(bad)} 🔄{len(converted)} ──\n')

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(audit_one, companies))

    print(f'\n{"═"*60}')
    print(f'PHASE 1 RESULTS')
    print(f'  ✅ Valid logos   : {len(good) + len(converted)}')
    print(f'  🔄 Converted→WebP: {len(converted)}')
    print(f'  ❌ Bad logos      : {len(bad)}')

    if args.audit_only:
        print(f'\n❌ Bad ({len(bad)}):')
        for b in bad[:30]: print(f'  - {b["name"]}')
        return

    # ── PHASE 2: Fix bad + fetch missing ──────────────────────────────────────
    missing = fetch_missing()
    to_fix = bad + list(missing)
    print(f'\n🔧 PHASE 2 — Fix {len(bad)} bad + {len(missing)} missing = {len(to_fix)} total\n')

    fixed = [0]; failed = []
    done2 = [0]

    def fix_one(co):
        done2[0] += 1
        name = co['name']
        ticker = co.get('yahooSymbol', '') or ''

        # Clear existing bad logo first
        if co.get('logoUrl'):
            clear_logo(co['id'])

        # Try scraping first (faster), then OpenAI
        url, content, ct = scrape_for_logo(name, ticker)
        source = 'scraped'

        if not content:
            url, content, ct = search_logo_openai(name, ticker)
            source = 'openai'

        if content:
            webp = to_webp(content, ct)
            if webp:
                try:
                    blob_url = upload_webp(name, co['slug'] if 'slug' in co else re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')[:40], webp)
                    save_logo(co['id'], blob_url, source)
                    fixed[0] += 1
                    print(f'  ✅ [{done2[0]:3d}/{len(to_fix)}] [{source.ljust(8)}] {name[:45]}')
                    return
                except Exception as e:
                    print(f'  ⚠️  [{done2[0]:3d}/{len(to_fix)}] upload err {name}: {e}')

        failed.append(name)
        if done2[0] % 20 == 0:
            print(f'\r  ── {done2[0]}/{len(to_fix)} | fixed={fixed[0]} failed={len(failed)} ──', flush=True)

    # Run with limited concurrency to respect OpenAI rate limits
    with ThreadPoolExecutor(max_workers=min(args.workers, 8)) as ex:
        list(ex.map(fix_one, to_fix))

    # Final DB stats
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" IS NOT NULL')
            with_logo = cur.fetchone()['c']
            cur.execute('SELECT COUNT(*) as c FROM "Company"')
            total_co = cur.fetchone()['c']
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" LIKE \'%.webp\'')
            webp_count = cur.fetchone()['c']

    print(f'\n{"═"*60}')
    print(f'FINAL RESULTS')
    print(f'  ✅ Fixed        : {fixed[0]} / {len(to_fix)}')
    print(f'  ❌ Still missing: {len(failed)}')
    print(f'  📊 Coverage     : {with_logo}/{total_co} ({with_logo/total_co*100:.1f}%)')
    print(f'  🖼️  WebP logos   : {webp_count}/{with_logo} ({webp_count/(with_logo or 1)*100:.0f}%)')
    if failed[:20]:
        print(f'\n❌ Still missing:')
        for n in failed[:20]: print(f'  - {n}')
    print('═'*60)

if __name__ == '__main__':
    main()
