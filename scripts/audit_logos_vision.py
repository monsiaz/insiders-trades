#!/usr/bin/env python3
"""
audit_logos_vision.py — Audit logos with GPT-4o Vision + rename files

1. Fetches all logos from DB
2. Uses GPT-4o vision to check if the image is actually the company logo
3. Flags bad logos (photos, icons, wrong brand, etc.)
4. Re-fetches bad logos using the Python pipeline
5. Renames blob files to clean slugs (company-name.ext, no AMF suffix numbers)

Usage:
  python3 scripts/audit_logos_vision.py [--audit-only] [--fix] [--limit=N]
"""

import os, re, sys, json, base64, argparse
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image
import psycopg2, psycopg2.extras

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

if not OPENAI_KEY: print('❌ No OPENAI_API_KEY'); sys.exit(1)
if not BLOB_TOKEN: print('❌ No BLOB_READ_WRITE_TOKEN'); sys.exit(1)
print(f'✅ OpenAI: {OPENAI_KEY[:8]}...\n')

# ── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--audit-only', action='store_true')
parser.add_argument('--fix', action='store_true')
parser.add_argument('--rename', action='store_true')
parser.add_argument('--limit', type=int, default=9999)
parser.add_argument('--workers', type=int, default=20)
parser.add_argument('--fix-workers', type=int, default=50)
args = parser.parse_args()

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124'

import warnings; warnings.filterwarnings('ignore')

# ── DB ────────────────────────────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def fetch_logos():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT id, name, slug, "logoUrl", "logoSource"
                FROM "Company"
                WHERE "logoUrl" IS NOT NULL
                ORDER BY name
                LIMIT %s
            ''', (args.limit,))
            return cur.fetchall()

def clear_logo(company_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=NULL, "logoSource"=NULL WHERE id=%s', (company_id,))
        conn.commit()

def save_logo(company_id, url, source):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE "Company" SET "logoUrl"=%s, "logoSource"=%s WHERE id=%s', (url, source, company_id))
        conn.commit()

# ── Clean slug for filenames ───────────────────────────────────────────────────

def clean_slug(name):
    """Generate clean filename from company name (no AMF number suffix)."""
    # Remove legal suffixes
    clean = re.sub(
        r'\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|s\.p\.a\.|s\.b\.)\.?\s*$',
        '', name, flags=re.IGNORECASE
    ).strip()
    # Normalize: lowercase, replace non-alphanum with hyphen
    slug = re.sub(r'[^a-z0-9]+', '-', clean.lower()).strip('-')
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    return slug[:50]

# ── GPT-4o Vision audit ───────────────────────────────────────────────────────

from openai import OpenAI
oai_client = OpenAI(api_key=OPENAI_KEY)

def encode_image_url(url):
    """Download and base64-encode image for Vision API."""
    try:
        r = requests.get(url, headers={'User-Agent': UA}, timeout=8, verify=False)
        if not r.ok: return None
        # Resize large images to save tokens
        img = Image.open(BytesIO(r.content))
        img.thumbnail((256, 256), Image.LANCZOS)
        buf = BytesIO()
        fmt = 'PNG' if url.endswith('.svg') else img.format or 'PNG'
        if fmt == 'SVG': fmt = 'PNG'
        img.save(buf, format=fmt)
        b64 = base64.b64encode(buf.getvalue()).decode()
        ct = 'image/png' if fmt == 'PNG' else f'image/{fmt.lower()}'
        return f'data:{ct};base64,{b64}'
    except: return None

def audit_logo_vision(company_name, logo_url):
    """Use GPT-4o to check if this is actually the company logo."""
    img_data = encode_image_url(logo_url)
    if not img_data:
        return {'valid': False, 'reason': 'Could not download image'}

    try:
        resp = oai_client.chat.completions.create(
            model='gpt-4o',
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': f'''Is this image the official logo of the company "{company_name}"?

Answer with a JSON object:
{{
  "is_logo": true/false,
  "is_correct_company": true/false,
  "issue": "brief description if wrong, or null if correct",
  "confidence": "high/medium/low"
}}

Reject if: photo/building/person/abstract art, wrong company logo, generic icon, favicon too small, social media icon.
Accept if: company wordmark, brand symbol, letter mark that matches the company.'''
                    },
                    {
                        'type': 'image_url',
                        'image_url': {'url': img_data, 'detail': 'low'}
                    }
                ]
            }],
            max_tokens=150,
            response_format={'type': 'json_object'},
        )
        result = json.loads(resp.choices[0].message.content)
        valid = result.get('is_logo', False) and result.get('is_correct_company', True)
        return {
            'valid': valid,
            'reason': result.get('issue'),
            'confidence': result.get('confidence', 'medium'),
            'is_logo': result.get('is_logo', False),
            'is_correct': result.get('is_correct_company', True),
        }
    except Exception as e:
        return {'valid': False, 'reason': f'Vision API error: {str(e)[:50]}'}

# ── Vercel Blob operations ─────────────────────────────────────────────────────

import subprocess

def upload_blob(filename, content, content_type):
    """Upload to Vercel Blob with clean filename."""
    import tempfile
    ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'png'
    with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as f:
        f.write(content); tmp = f.name

    result = subprocess.run([
        'node', '-e', f'''
const {{put}}=require("@vercel/blob");
const fs=require("fs");
const buf=fs.readFileSync("{tmp}");
put("logos/{filename}",buf,{{
  access:"public",
  token:"{BLOB_TOKEN}",
  contentType:"{content_type}",
  addRandomSuffix:false,
  allowOverwrite:true
}}).then(r=>console.log(r.url)).catch(e=>{{console.error(e.message);process.exit(1)}});
'''
    ], capture_output=True, text=True, cwd=project_dir)
    os.unlink(tmp)

    if result.returncode == 0:
        return result.stdout.strip()
    raise Exception(f'Blob upload failed: {result.stderr[:100]}')

def delete_blob(url):
    """Delete a blob by URL."""
    subprocess.run([
        'node', '-e', f'''
const {{del}}=require("@vercel/blob");
del("{url}", {{token:"{BLOB_TOKEN}"}}).then(()=>console.log('deleted')).catch(()=>{{}});
'''
    ], capture_output=True, text=True, cwd=project_dir)

# ── Re-fetch logo ─────────────────────────────────────────────────────────────

def refetch_logo(company):
    """Re-run the fetch pipeline for a company."""
    # Import from our Python fetch script
    sys.path.insert(0, script_dir)
    from fetch_logos_py import scrape_logo, get_google_favicon, openai_search, test_image_url

    name = company['name']
    clean = re.sub(r'[^a-z0-9]+', '', name.lower().replace(' ',''))[:20]
    ticker = ''  # We don't have ticker here easily

    websites = [f'https://www.{clean}.fr', f'https://www.{clean}.com',
                f'https://{clean}.fr', f'https://{clean}.com']

    for w in websites[:3]:
        r = scrape_logo(w, name)
        if r:
            try:
                resp = requests.get(r[0], headers={'User-Agent': UA}, timeout=8, verify=False)
                ct = resp.headers.get('Content-Type', 'image/png')
                return (resp.content, ct, r[1], r[0])
            except: pass

    for w in websites[:2]:
        r = get_google_favicon(w)
        if r:
            try:
                resp = requests.get(r[0], headers={'User-Agent': UA}, timeout=8, verify=False)
                ct = resp.headers.get('Content-Type', 'image/png')
                return (resp.content, ct, r[1], r[0])
            except: pass

    r = openai_search(name, '')
    if r:
        try:
            resp = requests.get(r[0], headers={'User-Agent': UA}, timeout=8, verify=False)
            ct = resp.headers.get('Content-Type', 'image/png')
            return (resp.content, ct, r[1], r[0])
        except: pass

    return None

# ── Main audit ─────────────────────────────────────────────────────────────────

def main():
    companies = fetch_logos()
    total = len(companies)
    print(f'🔍 Auditing {total} logos with GPT-4o Vision...')
    print(f'   workers={args.workers}\n')

    bad = []
    good = []
    errors = []

    completed = [0]

    def audit_one(co):
        result = audit_logo_vision(co['name'], co['logoUrl'])
        completed[0] += 1
        pct = completed[0]/total*100
        if not result['valid']:
            status = f'❌ BAD [{result.get("reason","?")}]'
            bad.append({**dict(co), **result})
        else:
            status = '✅ OK'
            good.append(dict(co))
        # Progress every 10
        if completed[0] % 10 == 0 or not result['valid']:
            conf = result.get('confidence','?')
            print(f'  [{completed[0]:3d}/{total}] {co["name"][:40].ljust(40)} {status} [{conf}]')
        return result

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(audit_one, companies))

    print(f'\n')
    print('═'*60)
    print(f'AUDIT RESULTS')
    print('═'*60)
    print(f'✅ Valid logos : {len(good)} / {total} ({len(good)/total*100:.0f}%)')
    print(f'❌ Bad logos   : {len(bad)}')
    print(f'\n❌ BAD logos:')
    for b in bad:
        print(f'  - {b["name"][:50].ljust(50)} [{b.get("reason","?")}]')

    # Save audit report
    report_path = os.path.join(script_dir, 'logo_audit_report.json')
    with open(report_path, 'w') as f:
        json.dump({'good': len(good), 'bad': len(bad), 'bad_list': bad}, f, indent=2, default=str)
    print(f'\n📄 Report saved: {report_path}')

    if args.fix and bad:
        print(f'\n🔧 Re-fetching {len(bad)} bad logos with {args.fix_workers} workers...\n')
        # Clear all bad logos first
        for co in bad:
            clear_logo(co['id'])

        # Use the full Python pipeline (same as fetch_logos_py.py)
        sys.path.insert(0, script_dir)
        import fetch_logos_py as flp
        import importlib; importlib.reload(flp)

        fixed = [0]
        completed2 = [0]

        def fix_one(co):
            result = flp.process_company(dict(co))
            completed2[0] += 1
            if result:
                save_logo(co['id'], result['url'], result['source'])
                fixed[0] += 1
                print(f'  ✅ [{result["source"][:12].ljust(12)}] {co["name"][:40].ljust(40)} {result["url"][:50]}')
            else:
                pass  # still missing
            pct = completed2[0]/len(bad)*100
            print(f'\r  {completed2[0]}/{len(bad)} ({pct:.0f}%)  fixed={fixed[0]}', end='', flush=True)

        with ThreadPoolExecutor(max_workers=args.fix_workers) as ex:
            list(ex.map(fix_one, bad))

        print(f'\n\n✅ Fixed {fixed[0]} / {len(bad)} bad logos')

    if args.rename:
        print(f'\n✏️  Renaming all blob files to clean names...\n')
        all_logos = fetch_logos()
        renamed = 0
        for co in all_logos:
            if not co['logoUrl']: continue
            current_url = co['logoUrl']
            ext = current_url.rsplit('.', 1)[-1].split('?')[0]
            if ext not in ('png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'):
                ext = 'png'
            new_slug = clean_slug(co['name'])
            new_filename = f'{new_slug}.{ext}'
            new_url = f'https://jgfyfeemh9oaokpn.public.blob.vercel-storage.com/logos/{new_filename}'

            # Skip if already clean
            current_filename = current_url.split('/logos/')[-1].split('?')[0]
            if current_filename == new_filename:
                continue

            print(f'  {co["name"][:35].ljust(35)} {current_filename} → {new_filename}')
            try:
                # Download current
                r = requests.get(current_url, headers={'User-Agent': UA}, timeout=8, verify=False)
                if not r.ok: continue
                ct = r.headers.get('Content-Type', f'image/{ext}')
                # Upload with new name
                blob_url = upload_blob(new_filename, r.content, ct)
                # Update DB
                save_logo(co['id'], blob_url, co['logoSource'])
                # Delete old (optional)
                if current_url != blob_url:
                    delete_blob(current_url)
                renamed += 1
            except Exception as e:
                print(f'    ❌ Error: {e}')

        print(f'\n✅ Renamed {renamed} files')

if __name__ == '__main__':
    main()
