"""Generate logo assets from source PNG. Run: python scripts/process_logo.py"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\1\Downloads\ChatGPT Image 7 июн. 2026 г., 10_58_40.png")
# apple-touch-icon 180×180 → radius 30 (reference in UI)
CORNER_RADIUS_RATIO = 30 / 180

if not SOURCE.exists():
    raise SystemExit(f"Logo source not found: {SOURCE}")

img = Image.open(SOURCE).convert("RGBA")
w, h = img.size
pixels = np.array(img)


def row_density(y: int) -> float:
    row = pixels[y]
    return float(((row[:, :3].max(axis=1) > 25) & (row[:, 3] > 128)).sum()) / w


def content_bbox(y0: int, y1: int):
    sub = pixels[y0:y1]
    mask = (sub[:, :, :3].max(axis=2) > 25) & (sub[:, :, 3] > 128)
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0, y1 - y0, 0, w
    return y0 + int(ys.min()), y0 + int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1


def find_tagline_top() -> int:
    """Bottom tagline starts after a quiet gap below «ЭФИР AI»."""
    for y in range(int(h * 0.88), h - 8):
        if row_density(y) > 0.12 and max(row_density(i) for i in range(max(0, y - 30), y)) < 0.04:
            return max(0, y - 12)
    return int(h * 0.90)


def crop_region(y0: int, y1: int, pad: int = 24) -> Image.Image:
    top, bottom, left, right = content_bbox(y0, y1)
    top = max(0, top - pad)
    bottom = min(h, bottom + pad)
    left = max(0, left - pad)
    right = min(w, right + pad)
    return img.crop((left, top, right, bottom))


def fit_square(im: Image.Image, out_w: int, bg=(0, 0, 0, 255)) -> Image.Image:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    scale = min(out_w / im.width, out_w / im.height)
    nw = max(1, round(im.width * scale))
    nh = max(1, round(im.height * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (out_w, out_w), bg)
    ox, oy = (out_w - nw) // 2, (out_w - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def round_square(im: Image.Image, out_w: int) -> Image.Image:
    """Squircle mask — radius 30px at 180px reference size."""
    im = fit_square(im, out_w, (0, 0, 0, 0))
    radius = max(2, round(out_w * CORNER_RADIUS_RATIO))
    mask = Image.new("L", (out_w, out_w), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, out_w, out_w), radius=radius, fill=255)
    im.putalpha(Image.composite(im.split()[3], Image.new("L", (out_w, out_w), 0), mask))
    bg = Image.new("RGBA", (out_w, out_w), (0, 0, 0, 255))
    bg.paste(im, (0, 0), im)
    return bg


def save_icon(im: Image.Image, out_w: int, path: Path) -> None:
    round_square(im, out_w).convert("RGB").save(path)


tagline_top = find_tagline_top()
icon_top, icon_bottom, _, _ = content_bbox(0, tagline_top)
# Icon only: graphic above the «ЭФИР AI» wordmark (gap ~y=907 in source).
icon_only_bottom = tagline_top
for y in range(int(h * 0.62), tagline_top):
    if row_density(y) < 0.03 and row_density(y - 1) > 0.12:
        icon_only_bottom = y + 8
        break
else:
    icon_only_bottom = int(h * 0.66)

icon_src = crop_region(icon_top, icon_only_bottom, pad=28)
compact_src = crop_region(0, tagline_top, pad=20)
full_src = img

web = ROOT / "website" / "assets"
web.mkdir(parents=True, exist_ok=True)

fit_square(full_src, 1024, (0, 0, 0, 255)).convert("RGB").save(web / "logo-full.png")
save_icon(compact_src, 1024, web / "logo-compact.png")
save_icon(icon_src, 1024, web / "logo-icon.png")

for size, name in [(512, "icon-512.png"), (32, "favicon-32.png"), (180, "apple-touch-icon.png")]:
    save_icon(icon_src, size, web / name)

android_res = ROOT / "android" / "app" / "src" / "main" / "res"
densities = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

for folder, px in densities.items():
    d = android_res / folder
    d.mkdir(parents=True, exist_ok=True)
    round_square(icon_src, px).save(d / "ic_launcher_foreground.png")
    save_icon(compact_src, px, d / "ic_launcher.png")
    save_icon(compact_src, px, d / "ic_launcher_round.png")

drawable = android_res / "drawable-nodpi"
drawable.mkdir(parents=True, exist_ok=True)
save_icon(compact_src, 512, drawable / "logo_efir_ai.png")

print(f"tagline_top={tagline_top}, icon_only_bottom={icon_only_bottom}")
print("done")
