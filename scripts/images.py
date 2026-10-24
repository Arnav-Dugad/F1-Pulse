"""
Responsive image variants for public/media (run: `npm run media:images`).

For every photo (logos, flags, maps, number art and SVGs are skipped) it writes:
  * an AVIF sibling (`name.avif`) when it is meaningfully smaller than the source;
  * for circuit heroes (`*-hero.*`) and gallery photos, 800 px wide `name-800.webp` / `name-800.avif`;
  * for opaque heroes and gallery photos, a tiny blurred LQIP (base64) used as a blur-up placeholder.

It records what exists in `src/data/image-variants.json`, which `Img` (src/ui/core.tsx) reads so the
browser is only ever offered files that exist. Idempotent: sources whose size/mtime are unchanged
since the last run (tracked in `scripts/images-state.json`) are skipped. Pass `--force` to rebuild.
Requires Pillow >= 11.3 (built-in AVIF support).
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageFilter, features

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "public" / "media"
MANIFEST = ROOT / "src" / "data" / "image-variants.json"
STATE = ROOT / "scripts" / "images-state.json"
MEDIA_JSON = ROOT / "src" / "data" / "media.json"

SKIP_DIRS = {"flags", "brand", "commons"}  # commons: already-compressed WebP; keeps the bundled manifest small
SKIP_NAME = re.compile(r"(logo|flag|-map|-number|badge|icon)", re.I)
VARIANT = re.compile(r"-800$")
EXTS = {".webp", ".jpg", ".jpeg", ".png"}
SMALL_WIDTH = 800
AVIF_QUALITY = 45
MIN_SAVING = 0.08  # keep an AVIF only if it saves at least 8 %
LQIP_WIDTH = 24


def public_url(path: Path) -> str:
    return "/" + path.relative_to(ROOT / "public").as_posix()


def gallery_sources() -> set[str]:
    try:
        media = json.loads(MEDIA_JSON.read_text("utf-8"))
    except (OSError, ValueError):
        return set()
    out: set[str] = set()
    for group in (media.get("galleries") or {}).values():
        for items in (group or {}).values():
            for item in items or []:
                if isinstance(item, dict) and isinstance(item.get("src"), str):
                    out.add(item["src"])
    return out


def is_opaque(im: Image.Image) -> bool:
    if im.mode in ("RGB", "L", "CMYK", "YCbCr"):
        return True
    if "A" in im.getbands():
        return im.getchannel("A").getextrema()[0] >= 250
    if im.mode == "P":
        return "transparency" not in im.info
    return True


def normalise(im: Image.Image) -> Image.Image:
    if im.mode in ("RGB", "RGBA"):
        return im
    return im.convert("RGBA" if ("A" in im.getbands() or "transparency" in im.info) else "RGB")


def save_avif(im: Image.Image, path: Path) -> int:
    im.save(path, format="AVIF", quality=AVIF_QUALITY, speed=6)
    return path.stat().st_size


def lqip(im: Image.Image) -> str:
    h = max(1, round(im.height * LQIP_WIDTH / im.width))
    tiny = im.convert("RGB").resize((LQIP_WIDTH, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    tiny.save(buf, format="WEBP", quality=35, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def candidates():
    for path in sorted(MEDIA.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in EXTS:
            continue
        rel = path.relative_to(MEDIA)
        if rel.parts and rel.parts[0] in SKIP_DIRS:
            continue
        if SKIP_NAME.search(path.stem) or VARIANT.search(path.stem):
            continue
        yield path


def main() -> int:
    if not features.check("avif"):
        print("Pillow was built without AVIF support (need Pillow >= 11.3).", file=sys.stderr)
        return 1
    force = "--force" in sys.argv
    try:
        state = {} if force else json.loads(STATE.read_text("utf-8"))
    except (OSError, ValueError):
        state = {}
    galleries = gallery_sources()
    manifest: dict[str, dict] = {}
    new_state: dict[str, dict] = {}
    made = skipped = 0
    started = time.time()
    for src in candidates():
        url = public_url(src)
        st = src.stat()
        key = f"{st.st_size}:{int(st.st_mtime)}"
        responsive = src.stem.endswith("-hero") or url in galleries
        avif = src.with_suffix(".avif")
        small = src.with_name(src.stem + f"-{SMALL_WIDTH}" + src.suffix)
        small_avif = src.with_name(src.stem + f"-{SMALL_WIDTH}.avif")
        prev = state.get(url)
        outputs_ok = prev and prev.get("key") == key and prev.get("responsive") == responsive and (
            not prev["entry"].get("avif") or avif.exists()
        ) and (not prev["entry"].get("sizes") or (small.exists() and small_avif.exists()))
        if outputs_ok:
            entry = prev["entry"]
            skipped += 1
        else:
            with Image.open(src) as raw:
                raw.load()
                im = normalise(raw)
            entry: dict = {"w": im.width, "h": im.height}
            size = st.st_size
            if save_avif(im, avif) <= size * (1 - MIN_SAVING):
                entry["avif"] = 1
            else:
                avif.unlink(missing_ok=True)
            if responsive and im.width > SMALL_WIDTH * 1.15:
                h = round(im.height * SMALL_WIDTH / im.width)
                resized = im.resize((SMALL_WIDTH, h), Image.LANCZOS)
                if src.suffix.lower() == ".webp":
                    resized.save(small, format="WEBP", quality=80, method=6)
                elif src.suffix.lower() == ".png":
                    resized.save(small, format="PNG", optimize=True)
                else:
                    resized.convert("RGB").save(small, format="JPEG", quality=82, optimize=True, progressive=True)
                save_avif(resized, small_avif)
                entry["sizes"] = [SMALL_WIDTH]
            else:
                small.unlink(missing_ok=True)
                small_avif.unlink(missing_ok=True)
            if responsive and is_opaque(im):
                entry["lqip"] = lqip(im)
            made += 1
            print(f"  {url}  {'avif ' if entry.get('avif') else ''}{'800w ' if entry.get('sizes') else ''}{'lqip' if entry.get('lqip') else ''}")
        new_state[url] = {"key": key, "responsive": responsive, "entry": entry}
        if entry.get("avif") or entry.get("sizes") or entry.get("lqip"):
            # The manifest ships in the main bundle: keep it lean (width only matters for srcset).
            manifest[url] = {k: v for k, v in entry.items() if k not in ("w", "h") or entry.get("sizes")}
            manifest[url].pop("h", None)
    # Remove variants whose source disappeared.
    for url in set(state) - set(new_state):
        base = ROOT / "public" / url.lstrip("/")
        for p in (base.with_suffix(".avif"), base.with_name(base.stem + f"-{SMALL_WIDTH}" + base.suffix), base.with_name(base.stem + f"-{SMALL_WIDTH}.avif")):
            p.unlink(missing_ok=True)
    MANIFEST.write_text(json.dumps(manifest, separators=(",", ":"), sort_keys=True) + "\n", "utf-8")
    STATE.write_text(json.dumps(new_state, indent=1, sort_keys=True) + "\n", "utf-8")
    print(
        f"image variants: {made} processed, {skipped} up to date, {len(manifest)} in manifest "
        f"({MANIFEST.stat().st_size // 1024} KB) in {time.time() - started:.1f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
