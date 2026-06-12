"""Generate circular persona avatars from website portrait art (face-focused)."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "website" / "assets" / "personas"
OUT_DIR = ROOT / "play-store" / "personas-round"

# Fine-tune vertical crop (fraction of image height where square center sits)
# Default matches website object-position ~ upper face
CROP_CENTER_Y: dict[str, float] = {
    "radio_host": 0.34,
    "night_dj": 0.32,
    "expert": 0.33,
    "contemporary": 0.34,
    "fan": 0.33,
    "backstage": 0.34,
}

NAMES_RU = {
    "radio_host": "Радиоведущий",
    "night_dj": "Ночной диджей",
    "expert": "Эксперт жанра",
    "contemporary": "Современник эпохи",
    "fan": "Фанат-коллекционер",
    "backstage": "Инсайдер с закулисья",
}

OUTPUT_SIZES = (256, 512, 1024)


def crop_face_square(img: Image.Image, persona_id: str) -> Image.Image:
    w, h = img.size
    size = min(w, h)
    center_x = w // 2
    center_y = int(h * CROP_CENTER_Y.get(persona_id, 0.34))
    half = size // 2
    left = max(0, min(w - size, center_x - half))
    top = max(0, min(h - size, center_y - half))
    return img.crop((left, top, left + size, top + size))


def apply_circle_mask(square: Image.Image) -> Image.Image:
    square = square.convert("RGBA")
    size = square.width
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(square, (0, 0), mask)
    return out


def resize(img: Image.Image, px: int) -> Image.Image:
    if img.width == px:
        return img
    return img.resize((px, px), Image.Resampling.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, str | int]] = []

    for src in sorted(SRC_DIR.glob("persona-*.png")):
        persona_id = src.stem.replace("persona-", "")
        img = Image.open(src).convert("RGBA")
        cropped = crop_face_square(img, persona_id)
        circular = apply_circle_mask(cropped)

        for px in OUTPUT_SIZES:
            out_path = OUT_DIR / f"persona-{persona_id}-round-{px}.png"
            resize(circular, px).save(out_path, optimize=True)

        # Primary release file (512)
        primary = OUT_DIR / f"persona-{persona_id}-round.png"
        resize(circular, 512).save(primary, optimize=True)

        manifest.append(
            {
                "id": persona_id,
                "nameRu": NAMES_RU.get(persona_id, persona_id),
                "source": str(src.relative_to(ROOT)).replace("\\", "/"),
                "files": {
                    "primary": str(primary.relative_to(ROOT)).replace("\\", "/"),
                    **{
                        str(px): str(
                            (OUT_DIR / f"persona-{persona_id}-round-{px}.png").relative_to(ROOT)
                        ).replace("\\", "/")
                        for px in OUTPUT_SIZES
                    },
                },
            }
        )
        print(f"OK {persona_id} -> {primary.name}")

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"personas": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Saved {len(manifest)} personas to {OUT_DIR}")


if __name__ == "__main__":
    main()
