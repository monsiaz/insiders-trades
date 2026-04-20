#!/usr/bin/env python3
"""
Process brand logos:
  - Crop the surrounding white padding
  - Make white background transparent
  - Generate a dark-mode variant (navy → warm cream)
  - Export WebP (small) + PNG (favicon + apple-touch-icon)

Inputs:
  assets/logo-insiders-trades-sigma.png   — wordmark + mark
  assets/logo-footer.png                  — mark only

Outputs (to public/):
  logo-mark.webp          — mark, light theme (navy)
  logo-mark-dark.webp     — mark, dark theme (cream)
  logo-mark.png           — mark PNG 512px (for og:image / sharing)
  logo-wordmark.webp      — wordmark + mark, light theme
  logo-wordmark-dark.webp — wordmark + mark, dark theme
  favicon.ico             — multi-size ICO (16, 32, 48)
  favicon.svg             — simple SVG fallback pointing to mark
  apple-touch-icon.png    — 180×180 PNG
  icon-192.png / icon-512.png — PWA manifest sizes
"""
import os, sys
from pathlib import Path
from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "public"
PUBLIC.mkdir(exist_ok=True)

# ── Color-space ──────────────────────────────────────────────────────────────
# Navy source (approx #17305C in the logo)
# For dark mode we map to "warm cream" (#F0EDE8 — matches --tx-1 in the dark theme)
DARK_CREAM = (240, 237, 232, 255)


def trim_whitespace(img: Image.Image, white_thresh: int = 240) -> Image.Image:
    """Crop away near-white border pixels."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    # Build a bbox based on non-white pixels
    r, g, b, a = img.split()
    # Non-white mask: any channel below threshold OR alpha < 255
    mask = r.point(lambda v: 255 if v < white_thresh else 0)
    mask = ImageChops.lighter(mask, g.point(lambda v: 255 if v < white_thresh else 0))
    mask = ImageChops.lighter(mask, b.point(lambda v: 255 if v < white_thresh else 0))
    bbox = mask.getbbox()
    if bbox:
        pad = 8  # small margin around content
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(img.width, bbox[2] + pad)
        y1 = min(img.height, bbox[3] + pad)
        img = img.crop((x0, y0, x1, y1))
    return img


def make_white_transparent(img: Image.Image, threshold: int = 245) -> Image.Image:
    """Set near-white pixels to fully transparent, fade in near-white edges."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    data = img.getdata()
    new = []
    for r, g, b, a in data:
        # How "white" is this pixel? 0 = pure content, 1 = pure white
        lightness = min(r, g, b)
        if lightness >= 250:
            new.append((r, g, b, 0))  # fully transparent
        elif lightness >= threshold:
            # Smooth fade on near-white edges (antialias)
            fade = (lightness - threshold) / (250 - threshold)
            new.append((r, g, b, int(a * (1 - fade))))
        else:
            new.append((r, g, b, a))
    img.putdata(new)
    return img


def darken_colorize_to_cream(img: Image.Image) -> Image.Image:
    """Convert navy pixels → cream, preserve green arrow.

    Strategy:
      1. First separate the green arrow (high G channel dominance) → keep + slight boost
      2. Everything else (navy + grey AA noise) → map luminance to cream
         with alpha scaled by 'darkness' so light-grey noise fades out cleanly.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    data = list(img.getdata())
    out = []
    for r, g, b, a in data:
        if a == 0:
            out.append((r, g, b, 0))
            continue

        # Green arrow: strongly green-biased pixels
        is_green = g > r + 15 and g > b + 15 and g > 80

        if is_green:
            # Keep green, brighten slightly for dark bg contrast
            out.append((
                max(0, int(r * 0.55)),
                min(255, int(g * 1.10 + 10)),
                max(0, int(b * 0.55)),
                a,
            ))
            continue

        # Everything else (navy + AA + shadow) → cream, with alpha scaled
        # by how dark the source pixel is. Light-grey noise becomes invisible,
        # true navy becomes opaque cream.
        lum = (r + g + b) / 3         # 0-255
        darkness = max(0, (255 - lum) / 255)  # 0 (white) → 1 (black)
        # Alpha: only dark pixels are truly visible. Fades near-white to 0.
        new_a = int(a * min(1, darkness * 1.3))
        if new_a < 8:
            out.append((0, 0, 0, 0))
            continue
        out.append((DARK_CREAM[0], DARK_CREAM[1], DARK_CREAM[2], new_a))

    img.putdata(out)
    return img


def resize_to_width(img: Image.Image, width: int) -> Image.Image:
    if img.width == width:
        return img
    h = int(img.height * width / img.width)
    return img.resize((width, h), Image.LANCZOS)


def square_pad(img: Image.Image, size: int, bg=(0, 0, 0, 0)) -> Image.Image:
    """Center an image into a square canvas of given size."""
    # Resize preserving aspect ratio, then paste centered
    if img.width > img.height:
        w = size
        h = int(img.height * size / img.width)
    else:
        h = size
        w = int(img.width * size / img.height)
    resized = img.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(resized, ((size - w) // 2, (size - h) // 2), resized)
    return canvas


def save_webp(img: Image.Image, path: Path, quality: int = 92) -> None:
    img.save(path, format="WEBP", quality=quality, method=6)
    print(f"  ✓ {path.name:30s} {img.size[0]:>4}×{img.size[1]:<4}  {path.stat().st_size / 1024:.1f} KB")


def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, format="PNG", optimize=True)
    print(f"  ✓ {path.name:30s} {img.size[0]:>4}×{img.size[1]:<4}  {path.stat().st_size / 1024:.1f} KB")


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    print("Processing brand logos…\n")

    # ── 1. Mark only (from logo-footer.png) ──────────────────────────────────
    print("[1/3] Mark (eye + arrow)")
    mark_src = Image.open(ASSETS / "logo-footer.png")
    mark_light = trim_whitespace(mark_src.copy())
    mark_light = make_white_transparent(mark_light)
    print(f"  · trimmed to {mark_light.size}")

    mark_dark = darken_colorize_to_cream(mark_light.copy())

    # Light-mode mark (WebP, 240px max width — sharp for retina)
    mark_light_800 = resize_to_width(mark_light, 800)
    save_webp(mark_light_800, PUBLIC / "logo-mark.webp", quality=92)
    # Dark-mode variant
    mark_dark_800 = resize_to_width(mark_dark, 800)
    save_webp(mark_dark_800, PUBLIC / "logo-mark-dark.webp", quality=92)
    # PNG 512 for og:image sharing / fallback
    save_png(resize_to_width(mark_light, 512), PUBLIC / "logo-mark.png")

    # ── 2. Wordmark (from logo-insiders-trades-sigma.png) ────────────────────
    print("\n[2/3] Wordmark (eye + arrow + INSIDERS TRADES SIGMA)")
    wm_src = Image.open(ASSETS / "logo-insiders-trades-sigma.png")
    wm_light = trim_whitespace(wm_src.copy())
    wm_light = make_white_transparent(wm_light)
    print(f"  · trimmed to {wm_light.size}")
    wm_dark = darken_colorize_to_cream(wm_light.copy())

    save_webp(resize_to_width(wm_light, 1000), PUBLIC / "logo-wordmark.webp", quality=92)
    save_webp(resize_to_width(wm_dark, 1000), PUBLIC / "logo-wordmark-dark.webp", quality=92)

    # ── 3. Favicon + apple-touch-icon + PWA icons ────────────────────────────
    print("\n[3/3] Favicons")
    # Square-padded mark for favicons
    fav_48 = square_pad(mark_light, 48)
    fav_32 = square_pad(mark_light, 32)
    fav_16 = square_pad(mark_light, 16)
    # Save multi-size ICO
    ico_path = PUBLIC / "favicon.ico"
    fav_48.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  ✓ favicon.ico                  16+32+48            {ico_path.stat().st_size / 1024:.1f} KB")

    # apple-touch-icon 180 — needs a solid background for iOS
    apple = square_pad(mark_light, 180, bg=(253, 251, 247, 255))  # warm paper white
    save_png(apple, PUBLIC / "apple-touch-icon.png")

    # PWA icons (transparent)
    save_png(square_pad(mark_light, 192), PUBLIC / "icon-192.png")
    save_png(square_pad(mark_light, 512), PUBLIC / "icon-512.png")

    print("\n✅ All assets ready in public/")


if __name__ == "__main__":
    main()
