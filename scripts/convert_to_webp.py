#!/usr/bin/env python3
"""Convert all non-WebP logos to WebP format (200×200 max, quality 85)."""

import os, re, sys, subprocess, tempfile, warnings
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image
import psycopg2, psycopg2.extras

warnings.filterwarnings('ignore')

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

BLOB_TOKEN   = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')
DRY_RUN = '--dry-run' in sys.argv
WORKERS = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--workers=')), '30'))

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124'

def get_db(): return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_non_webp():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, slug, "logoUrl", "logoSource"
                FROM "Company"
                WHERE "logoUrl" IS NOT NULL
                  AND "logoUrl" NOT LIKE '%.webp'
                ORDER BY name
            """)
            return cur.fetchall()

def to_webp(content, max_size=200, quality=85):
    try:
        img = Image.open(BytesIO(content))
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert('RGB')
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='WEBP', quality=quality, method=6)
        return buf.getvalue()
    except:
        return None

def clean_slug(name):
    c = re.sub(r'\s+(s\.a\.|s\.e\.|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b)\.?\s*$', '', name, flags=re.IGNORECASE).strip()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', c.lower())).strip('-')[:50]

def upload_webp(company_name, slug, webp_bytes):
    if DRY_RUN: return f'https://blob.vercel-storage.com/dry/{slug}.webp'
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
    raise Exception(result.stderr[:80])

def save_logo(cid, url, source):
    if DRY_RUN: return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s', (url, source, cid))
        conn.commit()

def convert_one(co, stats):
    try:
        r = requests.get(co['logoUrl'], headers={'User-Agent': UA}, timeout=8, verify=False)
        if not r.ok: stats['fail'] += 1; return
        webp = to_webp(r.content)
        if not webp: stats['fail'] += 1; return
        blob_url = upload_webp(co['name'], co['slug'], webp)
        save_logo(co['id'], blob_url, co['logoSource'])
        stats['done'] += 1
    except Exception as e:
        stats['fail'] += 1

def main():
    companies = fetch_non_webp()
    print(f'🔄 Converting {len(companies)} logos to WebP (workers={WORKERS})...')
    stats = {'done': 0, 'fail': 0}
    processed = [0]

    def wrapper(co):
        convert_one(co, stats)
        processed[0] += 1
        if processed[0] % 50 == 0:
            pct = processed[0] / len(companies) * 100
            print(f'  {processed[0]}/{len(companies)} ({pct:.0f}%) — converted={stats["done"]} failed={stats["fail"]}')

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(wrapper, companies))

    # Final stats
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" LIKE \'%.webp\'')
            webp_count = cur.fetchone()['c']
            cur.execute('SELECT COUNT(*) as c FROM "Company" WHERE "logoUrl" IS NOT NULL')
            total_logos = cur.fetchone()['c']

    print(f'\n✅ Converted : {stats["done"]} / {len(companies)}')
    print(f'❌ Failed    : {stats["fail"]}')
    print(f'🖼️  WebP total: {webp_count}/{total_logos} ({webp_count/(total_logos or 1)*100:.0f}%)')

if __name__ == '__main__':
    main()
