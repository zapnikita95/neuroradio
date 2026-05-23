from PIL import Image
from pathlib import Path

SRC_CANDIDATES = [
    Path(r"c:\Users\1\OneDrive\Desktop\Music story\assets\music_story_app_icon.png"),
    Path(r"C:\Users\1\.cursor\projects\c-Users-1-OneDrive-Desktop-Music-story\assets\music_story_app_icon.png"),
]

res = Path(r"c:\Users\1\OneDrive\Desktop\Music story\android\app\src\main\res")
assets = Path(r"c:\Users\1\OneDrive\Desktop\Music story\assets")
assets.mkdir(parents=True, exist_ok=True)

src_path = next((p for p in SRC_CANDIDATES if p.exists()), None)
if src_path is None:
    raise SystemExit("Source icon not found")

img = Image.open(src_path).convert("RGBA")
print(f"source: {src_path} {img.size}")

# Adaptive icon safe zone ~66%; legacy launchers use full square without stretch.
CONTENT_SCALE = 0.62


def fit_square(source: Image.Image, size: int, content_scale: float = CONTENT_SCALE) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    max_side = max(1, int(size * content_scale))
    ratio = source.width / source.height

    if ratio >= 1:
        new_w = max_side
        new_h = max(1, int(max_side / ratio))
    else:
        new_h = max_side
        new_w = max(1, int(max_side * ratio))

    fitted = source.resize((new_w, new_h), Image.Resampling.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def legacy_square(source: Image.Image, size: int) -> Image.Image:
    """Full-bleed square for old launchers — fit inside, no distortion."""
    return fit_square(source, size, content_scale=0.88)


sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

master = fit_square(img, 512)
master.save(assets / "music_story_app_icon.png", optimize=True)

for folder, size in sizes.items():
    out_dir = res / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    foreground = fit_square(img, size)
    legacy = legacy_square(img, size)
    legacy.save(out_dir / "ic_launcher.png", optimize=True)
    legacy.save(out_dir / "ic_launcher_round.png", optimize=True)
    foreground.save(out_dir / "ic_launcher_foreground.png", optimize=True)
    print(f" wrote {folder}: legacy {legacy.size}, fg {foreground.size}")

print("done")
