"""Resize the supplied artwork for the web; retain originals in icons/."""
from pathlib import Path
from shutil import copyfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)
copyfile(ROOT / "icons" / "favicon.ico", ROOT / "public" / "favicon.ico")
with Image.open(ROOT / "icons" / "brainrosetta-color.png") as source:
    for size in (96, 180, 192, 512):
        icon = source.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        if size == 180:
            # Apple touch icons need an opaque background.
            background = Image.new("RGBA", icon.size, "white")
            icon = Image.alpha_composite(background, icon).convert("RGB")
            name = "apple-touch-icon.png"
        else:
            name = f"brainrosetta-{size}.png"
        icon.save(OUTPUT / name, optimize=True)
