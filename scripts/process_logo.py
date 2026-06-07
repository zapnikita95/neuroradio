"""Generate logo assets from source PNG. Run: python scripts/process_logo.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\1\Downloads\ChatGPT Image 7 июн. 2026 г., 10_58_40.png")

if not SOURCE.exists():
    raise SystemExit(f"Logo source not found: {SOURCE}")

img = Image.open(SOURCE).convert("RGBA")
size = img.width

compact_bottom = round(size * 0.815)
icon_bottom = round(size * 0.46)

def crop_box(top: int, bottom: int) -> Image.Image:
    return img.crop((0, top, size, bottom))

def fit_square(im: Image.Image, out_w: int, bg=(0, 0, 0, 255)) -> Image.Image:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    scale = min(out_w / im.width, out_w / im.height)
    nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (out_w, out_w), bg)
    ox, oy = (out_w - nw) // 2, (out_w - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas

icon_src = crop_box(0, icon_bottom)
compact_src = crop_box(0, compact_bottom)
full_src = img

web = ROOT / "website" / "assets"
web.mkdir(parents=True, exist_ok=True)

fit_square(full_src, 1024, (0, 0, 0, 255)).convert("RGB").save(web / "logo-full.png")
fit_square(compact_src, 1024, (0, 0, 0, 255)).convert("RGB").save(web / "logo-compact.png")
fit_square(icon_src, 1024, (0, 0, 0, 255)).convert("RGB").save(web / "logo-icon.png")

for w, name in [(512, "icon-512.png"), (32, "favicon-32.png"), (180, "apple-touch-icon.png")]:
    fit_square(icon_src, w, (0, 0, 0, 255)).convert("RGB").save(web / name)

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
    fit_square(icon_src, px, (0, 0, 0, 0)).save(d / "ic_launcher_foreground.png")
    fit_square(compact_src, px, (0, 0, 0, 255)).convert("RGB").save(d / "ic_launcher.png")
    fit_square(compact_src, px, (0, 0, 0, 255)).convert("RGB").save(d / "ic_launcher_round.png")

drawable = android_res / "drawable-nodpi"
drawable.mkdir(parents=True, exist_ok=True)
fit_square(compact_src, 512, (0, 0, 0, 255)).convert("RGB").save(drawable / "logo_efir_ai.png")

print("done")
