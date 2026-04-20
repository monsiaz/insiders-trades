#!/usr/bin/env python3
"""
generate-brand-assets.py — Full brand asset pipeline for InsiderTrades Sigma.

Uses OpenAI's gpt-image-1 (latest image model) to generate a new logo suite
following the Sigma DA:
  • Geometric, pure-vision eye (no chart, no arrow)
  • Corporate navy #112A46 (brand primary)
  • Minimalist, clean, editorial
  • Sigma (Σ) as integration concept

Pipeline:
  1. List of assets to produce (manifest)
  2. Call gpt-image-1 with carefully crafted prompts
  3. Post-process with PIL (crop, transparent bg, dark variant, sizes)
  4. Write to public/ and generate favicon.ico + PWA icons

Usage:
  python3 scripts/generate-brand-assets.py [--skip-generation] [--dry-run]
"""
import os, sys, base64, argparse, json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

# ── Env loader ───────────────────────────────────────────────────────────────

def load_env(path):
    try:
        import re
        for line in open(path):
            m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.+)$", line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip("\"'")
    except Exception:
        pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PUBLIC = ROOT / "public"
CACHE = ROOT / ".asset-cache"
CACHE.mkdir(exist_ok=True)

load_env(ROOT / ".env.local")
load_env(ROOT / ".env")
load_env("/Users/simonazoulay/SurfCampSenegal/.env")

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_KEY:
    sys.exit("❌ OPENAI_API_KEY missing")

from openai import OpenAI
oai = OpenAI(api_key=OPENAI_KEY)

# ── Args ─────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--skip-generation", action="store_true",
                    help="Reuse cached images from .asset-cache/ (re-runs post-processing only)")
parser.add_argument("--dry-run", action="store_true", help="No file writes")
parser.add_argument("--only", choices=["mark", "wordmark", "all"], default="all")
args = parser.parse_args()

# ── Brand constants ──────────────────────────────────────────────────────────

NAVY = (17, 42, 70, 255)       # #112A46 corporate navy
NAVY_HEX = "#112A46"
CREAM = (240, 237, 232, 255)   # warm paper-white for dark mode

# ── Asset manifest ───────────────────────────────────────────────────────────

ASSET_MANIFEST = {
    "mark": {
        "description": "Geometric pure-vision eye icon",
        "source_size": "1024x1024",
        "generation_quality": "high",
        "prompt": (
            "A minimalist, geometric logo icon of a pure, deconstructed human eye, "
            "centered on a pure white background. "
            "The eye is drawn with clean, precise lines: "
            "an outer almond-shape contour (two arcs meeting at points left and right), "
            "a perfect inner circle iris, and a small solid center dot for the pupil. "
            "No chart line, no arrow, no graph, no text — just the pure eye geometry. "
            "All lines are solid corporate navy blue #112A46, stroke weight approximately 16-20px, "
            "clean vector quality, no gradients, no shading, no 3D effect, no decorative elements, "
            "no typography, no letters, no arrow, no stock chart. "
            "Extremely minimalist, modernist, Swiss design style — think Saul Bass or Paul Rand. "
            "Flat design, sharp precise geometric construction. "
            "The eye symbol represents pure vision, clarity, integration (Sigma). "
            "Generous white space around the icon. Centered composition."
        ),
    },
    # Wordmark is NOT AI-generated — typography is composed locally with PIL
    # for pixel-perfect letterforms (AI image models hallucinate text).
}

# ── Image generation ─────────────────────────────────────────────────────────

def generate_with_openai(prompt: str, size: str, quality: str, cache_path: Path):
    """Generate an image via gpt-image-1 and save to cache_path."""
    if args.skip_generation and cache_path.exists():
        print(f"  · using cached {cache_path.name}")
        return cache_path

    print(f"  · calling gpt-image-1 (size={size}, quality={quality})…")
    resp = oai.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size=size,
        quality=quality,
        n=1,
        background="transparent",
        output_format="png",
    )
    b64 = resp.data[0].b64_json
    raw = base64.b64decode(b64)
    cache_path.write_bytes(raw)
    print(f"  ✓ saved {cache_path.name} ({len(raw) / 1024:.1f} KB)")
    return cache_path

# ── Post-processing (PIL) ────────────────────────────────────────────────────

def trim_whitespace(img: Image.Image, white_thresh: int = 245, pad: int = 24) -> Image.Image:
    """Crop to the smallest rect containing visible, non-white content.
    Works on both transparent and opaque inputs."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    r, g, b, a = img.split()
    # "Visible" = has alpha AND is not near-white
    alpha_mask = a.point(lambda v: 255 if v > 15 else 0)
    # Lightness mask: how "not-white" is this pixel (higher = more content)
    r_dark = r.point(lambda v: 255 if v < white_thresh else 0)
    g_dark = g.point(lambda v: 255 if v < white_thresh else 0)
    b_dark = b.point(lambda v: 255 if v < white_thresh else 0)
    color_mask = ImageChops.lighter(r_dark, ImageChops.lighter(g_dark, b_dark))
    # Pixel is "content" iff it has alpha AND is darker than near-white
    content = ImageChops.multiply(alpha_mask, color_mask).point(lambda v: 255 if v > 100 else 0)
    bbox = content.getbbox()
    if not bbox:
        return img
    x0 = max(0, bbox[0] - pad)
    y0 = max(0, bbox[1] - pad)
    x1 = min(img.width, bbox[2] + pad)
    y1 = min(img.height, bbox[3] + pad)
    return img.crop((x0, y0, x1, y1))


def make_white_transparent(img: Image.Image, threshold: int = 240) -> Image.Image:
    """Drop near-white pixels to transparent, with smooth edge fade."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    data = list(img.getdata())
    out = []
    for r, g, b, a in data:
        lightness = min(r, g, b)
        if lightness >= 250:
            out.append((r, g, b, 0))
        elif lightness >= threshold:
            fade = (lightness - threshold) / (250 - threshold)
            out.append((r, g, b, int(a * (1 - fade))))
        else:
            out.append((r, g, b, a))
    img.putdata(out)
    return img


def colorize_to_cream(img: Image.Image) -> Image.Image:
    """Darken to cream for dark mode: every non-transparent navy pixel → cream,
    alpha scaled by how dark the source was. Any stray color (shouldn't exist
    in our pure-navy logo) maps to cream too."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    data = list(img.getdata())
    out = []
    for r, g, b, a in data:
        if a == 0:
            out.append((r, g, b, 0))
            continue
        lum = (r + g + b) / 3
        darkness = max(0.0, (255 - lum) / 255)
        new_a = int(a * min(1.0, darkness * 1.35))
        if new_a < 8:
            out.append((0, 0, 0, 0))
            continue
        out.append((CREAM[0], CREAM[1], CREAM[2], new_a))
    img.putdata(out)
    return img


def resize_to_width(img: Image.Image, width: int) -> Image.Image:
    if img.width == width:
        return img
    h = max(1, int(img.height * width / img.width))
    return img.resize((width, h), Image.LANCZOS)


def square_pad(img: Image.Image, size: int, bg=(0, 0, 0, 0)) -> Image.Image:
    if img.width > img.height:
        w = size
        h = max(1, int(img.height * size / img.width))
    else:
        h = size
        w = max(1, int(img.width * size / img.height))
    resized = img.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(resized, ((size - w) // 2, (size - h) // 2), resized)
    return canvas


def save_webp(img: Image.Image, path: Path, quality: int = 92):
    if args.dry_run:
        return
    img.save(path, format="WEBP", quality=quality, method=6)
    print(f"  ✓ {path.name:30s} {img.size[0]:>4}×{img.size[1]:<4}  {path.stat().st_size / 1024:.1f} KB")


def save_png(img: Image.Image, path: Path):
    if args.dry_run:
        return
    img.save(path, format="PNG", optimize=True)
    print(f"  ✓ {path.name:30s} {img.size[0]:>4}×{img.size[1]:<4}  {path.stat().st_size / 1024:.1f} KB")


# ── Main ─────────────────────────────────────────────────────────────────────

def process_mark() -> Image.Image:
    """Process the mark and return the trimmed light-mode version for reuse."""
    print("\n━━━ Mark (geometric eye) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    cache = CACHE / "mark-source.png"
    generate_with_openai(
        ASSET_MANIFEST["mark"]["prompt"],
        ASSET_MANIFEST["mark"]["source_size"],
        ASSET_MANIFEST["mark"]["generation_quality"],
        cache,
    )

    src = Image.open(cache)
    trimmed = trim_whitespace(src.copy(), pad=24)
    mark_light = make_white_transparent(trimmed)
    print(f"  · trimmed to {mark_light.size}")

    mark_dark = colorize_to_cream(mark_light.copy())

    # Light-mode WebP
    save_webp(resize_to_width(mark_light, 800), PUBLIC / "logo-mark.webp", 92)
    # Dark-mode WebP
    save_webp(resize_to_width(mark_dark, 800), PUBLIC / "logo-mark-dark.webp", 92)
    # 512px PNG (OG image / sharing fallback)
    save_png(resize_to_width(mark_light, 512), PUBLIC / "logo-mark.png")

    # Favicons (square-padded)
    fav_48 = square_pad(mark_light, 48)
    fav_ico = PUBLIC / "favicon.ico"
    if not args.dry_run:
        fav_48.save(fav_ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
        print(f"  ✓ favicon.ico                  16+32+48            {fav_ico.stat().st_size / 1024:.1f} KB")

    # apple-touch-icon (180×180 on warm paper bg — iOS needs opaque)
    apple = square_pad(mark_light, 180, bg=(253, 251, 247, 255))
    save_png(apple, PUBLIC / "apple-touch-icon.png")

    # PWA icons
    save_png(square_pad(mark_light, 192), PUBLIC / "icon-192.png")
    save_png(square_pad(mark_light, 512), PUBLIC / "icon-512.png")

    return mark_light


FUTURA_PATH = "/System/Library/Fonts/Supplemental/Futura.ttc"

def _futura_bold(size: int) -> ImageFont.FreeTypeFont:
    """Load Futura Bold from macOS system. Futura.ttc index=2 is 'Bold'."""
    if os.path.exists(FUTURA_PATH):
        return ImageFont.truetype(FUTURA_PATH, size, index=2)  # Futura Bold
    return ImageFont.load_default()


def _compose_wordmark(mark_img: Image.Image, color: tuple, letter_spacing: int = 22) -> Image.Image:
    """Compose a wordmark = mark on top + 'INSIDERS TRADES SIGMA' below.

    Typography is rendered with Futura Bold (macOS system font) for crisp,
    deterministic lettering — no AI hallucinated characters.
    """
    # Normalize mark to reasonable working size
    mark_h = 340
    mw = int(mark_img.width * mark_h / mark_img.height)
    mark = mark_img.resize((mw, mark_h), Image.LANCZOS)

    # Typography
    WORDS = ["INSIDERS", "TRADES", "SIGMA"]
    font_size = 130
    word_gap = 80         # px between words
    mark_text_gap = 68    # px between mark and text

    font = _futura_bold(font_size)
    # Measure text width (with manual letter-spacing)
    def _text_width(s: str) -> int:
        w = 0
        for i, ch in enumerate(s):
            bbox = font.getbbox(ch)
            cw = bbox[2] - bbox[0]
            w += cw
            if i < len(s) - 1:
                w += letter_spacing
        return w

    word_widths = [_text_width(w) for w in WORDS]
    text_w = sum(word_widths) + word_gap * (len(WORDS) - 1)
    # Estimate text height from single letter
    asc, desc = font.getmetrics()
    text_h = asc + desc

    # Canvas = max(text_w, mark.width) + padding
    pad = 80
    canvas_w = max(text_w, mark.width) + pad * 2
    canvas_h = pad + mark_h + mark_text_gap + text_h + pad

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # Paste mark, horizontally centered
    mark_x = (canvas_w - mark.width) // 2
    mark_y = pad
    canvas.paste(mark, (mark_x, mark_y), mark)

    # Draw each word horizontally centered, letter-spaced manually
    cursor_x = (canvas_w - text_w) // 2
    cursor_y = mark_y + mark_h + mark_text_gap
    for w_i, word in enumerate(WORDS):
        wx = cursor_x
        for i, ch in enumerate(word):
            draw.text((wx, cursor_y), ch, font=font, fill=color)
            bbox = font.getbbox(ch)
            cw = bbox[2] - bbox[0]
            wx += cw
            if i < len(word) - 1:
                wx += letter_spacing
        cursor_x += word_widths[w_i] + word_gap

    return canvas


def _recolor_mark_to_color(mark_light: Image.Image, target: tuple) -> Image.Image:
    """Take the navy light-mode mark and recolor its opaque pixels to `target`.
    Preserves anti-aliasing via alpha channel."""
    if mark_light.mode != "RGBA":
        mark_light = mark_light.convert("RGBA")
    data = list(mark_light.getdata())
    out = []
    for r, g, b, a in data:
        if a == 0:
            out.append((0, 0, 0, 0))
        else:
            out.append((target[0], target[1], target[2], a))
    img = Image.new("RGBA", mark_light.size)
    img.putdata(out)
    return img


def process_wordmark(mark_light: Image.Image):
    """Compose the wordmark LOCALLY using PIL (AI fails on typography)."""
    print("\n━━━ Wordmark (mark + Futura Bold text) ━━━━━━━━━━━━━━━━━━━━━━")

    # Light version — navy mark + navy text
    wm_light = _compose_wordmark(mark_light, color=NAVY)
    wm_light = trim_whitespace(wm_light, pad=40)
    print(f"  · light wordmark: {wm_light.size}")

    # Dark version — cream mark + cream text
    mark_cream = _recolor_mark_to_color(mark_light, CREAM)
    wm_dark = _compose_wordmark(mark_cream, color=CREAM)
    wm_dark = trim_whitespace(wm_dark, pad=40)
    print(f"  · dark wordmark:  {wm_dark.size}")

    save_webp(resize_to_width(wm_light, 1200), PUBLIC / "logo-wordmark.webp", 92)
    save_webp(resize_to_width(wm_dark, 1200), PUBLIC / "logo-wordmark-dark.webp", 92)


def main():
    print(f"🎨 Brand asset generation — InsiderTrades Sigma")
    print(f"   Palette : corporate navy {NAVY_HEX}")
    print(f"   Model   : gpt-image-1 (OpenAI)")
    print(f"   Cache   : {CACHE}")
    print(f"   Target  : {PUBLIC}")

    mark_light = None
    if args.only in ("all", "mark"):
        mark_light = process_mark()
    if args.only in ("all", "wordmark"):
        if mark_light is None:
            # Load the already-saved light mark
            mark_light = Image.open(PUBLIC / "logo-mark.webp").convert("RGBA")
        process_wordmark(mark_light)

    # Manifest dump for reference
    manifest_out = PUBLIC / "brand-manifest.json"
    manifest_out.write_text(json.dumps({
        "palette": { "corporate-navy": NAVY_HEX, "dark-cream": "#F0EDE8" },
        "assets": {k: v["description"] for k, v in ASSET_MANIFEST.items()},
    }, indent=2))
    print(f"\n📋 brand-manifest.json written")
    print(f"\n✅ All brand assets ready.")


if __name__ == "__main__":
    main()
