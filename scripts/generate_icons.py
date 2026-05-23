from PIL import Image
from pathlib import Path

src = Path(r"C:\Users\1\.cursor\projects\c-Users-1-OneDrive-Desktop-Music-story\assets\music_story_app_icon.png")
res = Path(r"c:\Users\1\OneDrive\Desktop\Music story\android\app\src\main\res")
assets = Path(r"c:\Users\1\OneDrive\Desktop\Music story\assets")
assets.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGBA")

sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for folder, size in sizes.items():
    out_dir = res / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    icon = img.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(out_dir / "ic_launcher.png", optimize=True)
    icon.save(out_dir / "ic_launcher_round.png", optimize=True)
    icon.save(out_dir / "ic_launcher_foreground.png", optimize=True)

img.save(assets / "music_story_app_icon.png")
print("done")
