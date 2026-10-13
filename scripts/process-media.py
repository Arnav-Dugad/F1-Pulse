"""Post-process downloaded media: recompress large photos and derive headshot crops.
Run after scripts/fetch-media.py:  python scripts/process-media.py
"""
import glob
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA = ROOT / "public" / "media"

DONE = ROOT / "scripts" / ".media-processed"  # kept out of the deployed folder
done = set(DONE.read_text().split()) if DONE.exists() else set()

for f in glob.glob(str(MEDIA / "circuits" / "*.webp")):
    if pathlib.Path(f).name in done:
        continue  # never re-encode a lossy file twice
    done.add(pathlib.Path(f).name)
    im = Image.open(f)
    im.load()
    if "-hero" in f:
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.convert("RGB").save(f, "WEBP", quality=74, method=6)
    else:
        im.save(f, "WEBP", quality=80, method=6)

for f in glob.glob(str(MEDIA / "drivers" / "*-front.webp")):
    im = Image.open(f).convert("RGBA")
    if pathlib.Path(f).name not in done:
        im.save(f, "WEBP", quality=82, method=6)
        done.add(pathlib.Path(f).name)
    w, _ = im.size
    alpha = im.split()[3]
    x0, y0, x1, _ = alpha.getbbox()
    size = int(w * 0.40)
    band = alpha.crop((0, y0, w, y0 + int(size * 0.7))).getbbox()
    hx = (band[0] + band[2]) / 2 if band else (x0 + x1) / 2
    top = y0 - int(size * 0.06)
    head = im.crop((int(hx - size / 2), top, int(hx + size / 2), top + size)).resize((256, 256), Image.LANCZOS)
    head.save(f.replace("-front.webp", "-head.webp"), "WEBP", quality=86, method=6)

manifest_path = ROOT / "src" / "data" / "media.json"
manifest = json.loads(manifest_path.read_text())
for driver in manifest["drivers"].values():
    if driver.get("front"):
        driver["head"] = driver["front"].replace("-front.webp", "-head.webp")
manifest_path.write_text(json.dumps(manifest, indent=1))
DONE.write_text("\n".join(sorted(done)))
print("processed")
