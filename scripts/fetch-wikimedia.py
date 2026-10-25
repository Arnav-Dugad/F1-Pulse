"""Freely licensed historical photos from Wikimedia Commons for every driver, constructor and circuit.

  python scripts/fetch-wikimedia.py                 # everything (resumes from the on-disk cache)
  python scripts/fetch-wikimedia.py drivers circuits  # only some kinds (others keep their current entries)

Subjects: every driver / constructor / circuit in public/data/archive.json (1950-2025) plus the current
season's entries. Jolpica gives each one its English Wikipedia article.

  drivers       the article's lead image (pageimages, free licences only) -> 600 px photo + 256 px
                face-centred headshot (OpenCV YuNet face detector; upper-centre crop for portrait photos
                without a detectable face; no headshot for landscape photos without a face).
  constructors  the lead image if it is a free photograph, else the best free photograph on the
                article (logos, maps, SVGs and portraits skipped; car/team file names preferred).
  circuits      a free aerial/track/grandstand photograph from the article (no layout maps, logos or
                portraits) plus up to 5 more photos of the circuit and its surroundings ("places").

Only free licences are kept (CC0, public domain, CC BY, CC BY-SA, GFDL); every file is recorded with
artist, licence and its Commons file page in public/data/wikimedia.json (lazy-loaded by the site) and
public/media/sources.json, and listed on public/media/credits.html.

Manual review decisions live in scripts/wikimedia-overrides.json:
  {"drop": {"drivers": [ids]}, "file": {"drivers": {id: "File:..."}}, "nohead": [driverIds],
   "dropFiles": ["File:..."]}
"""

import io
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps

from media_seasons_lib import jolpica
from wikimedia_lib import (YEAR as YEAR_IN_NAME, CACHE, COMMONS, ENWIKI, WIKIDATA, api, chunks, download, license_ok, meta_value, photo_year, stats,
                           strip_html, title_from_url)

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT_DIR = PUBLIC / "media" / "commons"
OUT_JSON = PUBLIC / "data" / "wikimedia.json"
SOURCES = PUBLIC / "media" / "sources.json"
CREDITS = PUBLIC / "media" / "credits.html"
OVERRIDES = Path(__file__).resolve().parent / "wikimedia-overrides.json"
REPORT = CACHE / "report.json"  # selection log for review (why each subject got its photo or none)
CURRENT = 2026
FOLDER = {"drivers": "drivers", "constructors": "teams", "circuits": "circuits"}

WIDTH = {"drivers": 520, "constructors": 1000, "hero": 1600, "places": 1000}
QUALITY = 78
PHOTO_EXT = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp")
PHOTO_MIME = ("image/jpeg", "image/png", "image/tiff", "image/webp")
EXTMETA = "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|ImageDescription|ObjectName|Credit|NonFree|Copyrighted|Restrictions"

overrides = json.loads(OVERRIDES.read_text("utf-8")) if OVERRIDES.exists() else {}
DROP_FILES = set(overrides.get("dropFiles", []))


# ─────────────────────────────────────────────────────────────── subjects
def jolpica_all(kind, table, key):
    out, off = [], 0
    while True:
        d = jolpica(f"{kind}.json?limit=100&offset={off}")["MRData"]
        out += d[table][key]
        off += 100
        if off >= int(d["total"]):
            return out


def season_windows(teams):
    """
    A constructor photo dated inside the team's racing years is an in-period race photo: it only
    represents seasons near it (a 2025 McLaren is not a 1970 McLaren), so it gets `seasons: [from, to]`.
    Photos dated outside those years are museum / historic-event shots of a period car and fit any season.
    """
    archive = json.loads((PUBLIC / "data" / "archive.json").read_text("utf-8"))
    years = {}
    for race in archive["races"]:
        for row in race[6]:
            cid = archive["constructors"][row[1]][0]
            lo, hi = years.get(cid, (race[0], race[0]))
            years[cid] = (min(lo, race[0]), max(hi, race[0]))
    for cid, photo in teams.items():
        photo.pop("seasons", None)
        lo, hi = years.get(cid, (CURRENT, CURRENT))
        hi = max(hi, CURRENT) if hi >= int(archive["last"]) else hi
        try:
            taken = int(str(photo["credit"].get("date", ""))[:4])
        except ValueError:
            continue
        if lo <= taken <= hi:
            photo["seasons"] = [max(lo, taken - 8), min(hi, taken + 8)]


def subjects():
    archive = json.loads((PUBLIC / "data" / "archive.json").read_text("utf-8"))
    ids = {
        "drivers": {r[0] for r in archive["drivers"]},
        "constructors": {r[0] for r in archive["constructors"]},
        "circuits": {r[0] for r in archive["circuits"]},
    }
    # Current season: race starters, constructors and circuits on the calendar.
    for race in jolpica(f"{CURRENT}/results.json?limit=100")["MRData"]["RaceTable"]["Races"]:
        for row in race["Results"]:
            ids["drivers"].add(row["Driver"]["driverId"])
            ids["constructors"].add(row["Constructor"]["constructorId"])
    for c in jolpica(f"{CURRENT}/constructors.json?limit=100")["MRData"]["ConstructorTable"]["Constructors"]:
        ids["constructors"].add(c["constructorId"])
    for c in jolpica(f"{CURRENT}/circuits.json?limit=100")["MRData"]["CircuitTable"]["Circuits"]:
        ids["circuits"].add(c["circuitId"])
    try:  # full current-season results may span several pages
        off = 100
        while True:
            d = jolpica(f"{CURRENT}/results.json?limit=100&offset={off}")["MRData"]
            for race in d["RaceTable"]["Races"]:
                for row in race["Results"]:
                    ids["drivers"].add(row["Driver"]["driverId"])
            off += 100
            if off >= int(d["total"]):
                break
    except Exception as err:  # noqa: BLE001
        print("  current-season results:", err)
    tables = {
        "drivers": {d["driverId"]: d for d in jolpica_all("drivers", "DriverTable", "Drivers")},
        "constructors": {c["constructorId"]: c for c in jolpica_all("constructors", "ConstructorTable", "Constructors")},
        "circuits": {c["circuitId"]: c for c in jolpica_all("circuits", "CircuitTable", "Circuits")},
    }
    out = {}
    for kind, wanted in ids.items():
        out[kind] = {}
        for sid in sorted(wanted):
            rec = tables[kind].get(sid)
            if not rec:
                continue
            title = title_from_url(rec.get("url"))
            if not title and kind == "drivers":
                title = f"{rec['givenName']} {rec['familyName']}"  # verified by its short description below
            if title:
                out[kind][sid] = {**rec, "title": title}
    return out, ids


# ─────────────────────────────────────────────────────────────── article metadata
def resolve(titles, extra_props=""):
    """title -> page dict (redirects followed), for many titles, 50 per request."""
    out = {}
    for batch in chunks(sorted(set(titles))):
        data = api(ENWIKI, {
            "titles": "|".join(batch), "redirects": "1",
            "prop": "pageimages|pageprops|description" + extra_props,
            "piprop": "original|name", "pilicense": "free", "ppprop": "disambiguation|wikibase_item",
            "pilimit": "50",
        })
        q = data.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in batch:
            final = norm.get(t, t)
            for _ in range(3):
                final = redir.get(final, final)
            out[t] = pages.get(final)
    return out


def article_images(titles):
    """title (final) -> [File:... names] on the article."""
    out = {}
    for batch in chunks(sorted(set(titles)), 20):
        data = api(ENWIKI, {"titles": "|".join(batch), "prop": "images", "imlimit": "max"})
        for p in data.get("query", {}).get("pages", []):
            out[p["title"]] = [i["title"] for i in p.get("images", [])]
    return out


def imageinfo(files, width):
    """File:... -> {url, thumb, width, height, mime, meta, page, repo} (Commons first, then local enwiki files)."""
    files = [f for f in sorted(set(files)) if f not in DROP_FILES]
    out = {}
    for endpoint in (COMMONS, ENWIKI):
        todo = [f for f in files if f not in out]
        for batch in chunks(todo):
            data = api(endpoint, {
                "titles": "|".join(batch), "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": str(width), "iiextmetadatafilter": EXTMETA, "iiextmetadatalanguage": "en",
            })
            q = data.get("query", {})
            back = {v: k for k, v in {n["from"]: n["to"] for n in q.get("normalized", [])}.items()}
            for p in q.get("pages", []):
                info = (p.get("imageinfo") or [None])[0]
                if not info or p.get("missing"):
                    continue
                name = back.get(p["title"], p["title"])
                out[name] = {
                    "title": p["title"], "url": info.get("url"), "thumb": info.get("thumburl") or info.get("url"),
                    "width": info.get("width", 0), "height": info.get("height", 0), "mime": info.get("mime", ""),
                    "meta": info.get("extmetadata") or {}, "page": info.get("descriptionurl"),
                }
    return out


# ─────────────────────────────────────────────────────────────── file-name heuristics
def norm(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


NOT_PHOTO = re.compile(
    r"\b(logo|logos|logotype|emblem|badge|crest|wordmark|flag|flags|map|maps|karte|mapa|carte|plan|layout|diagram|"
    r"chart|graph|icon|signature|autograph|helmet|casco|commons|wikidata|wikiquote|wikinews|wiktionary|question book|"
    r"edit clear|symbol|portal|ambox|disambig|locator|location|stub|crystal|nuvola|folder|office|sound|audio|"
    r"loudspeaker|text|lock|padlock|trophy|medal|stamp|coat of arms|wappen|blason|escudo|livery drawing|"
    r"silhouette|outline|sketch|drawing|poster|ticket|programme|program|cover|track map|circuit map|streckenplan|"
    r"route|elevation|profile|sector|sectors|qualifying|results|timeline|standings|seal|vector|clipart|pictogram)\b"
)
PORTRAIT_WORDS = re.compile(r"\b(portrait|headshot|face|cropped|interview|press conference|podium|celebrat|smiling|wedding)\b")
CAR_WORDS = re.compile(r"\b(car|cars|f1|formula|gp|grand prix|racing|chassis|race|monoposto|rennwagen|bolide|launch|pit|garage|test|testing)\b")
PLACE_STRONG = re.compile(r"\b(aerial|aerea|aereo|luftbild|luftaufnahme|vista|panorama|overview|bird s eye|from above|drone|satellite)\b")
PLACE_WORDS = re.compile(
    r"\b(grandstand|grandstands|tribune|tribuna|tribunes|stands|pit|pits|paddock|start|finish|grid|straight|corner|"
    r"turn|curve|curva|kurve|hairpin|banking|chicane|track|circuit|circuito|circuit de|autodromo|autodrome|ring|"
    r"raceway|speedway|tower|entrance|gate|bridge|tunnel|lake|harbour|harbor|marina|beach|view|esses|section|"
    r"complex|hill|bend|loop|lap|esse|stadium|hotel|building|old|historic)\b"
)


LEAD_NOT_PHOTO = re.compile(r"\b(logo|emblem|badge|crest|flag|map|signature|autograph|helmet|casque|casco|grave|tomb|plaque|stamp|drawing|sketch|vector|icon)\b")


ROAD_CAR = re.compile(
    r"\b(sedan|saloon|coupe|berlinetta|spider|spyder|cabriolet|convertible|roadster|estate|wagon|suv|hatchback|"
    r"limousine|automatic|facelift|tdi|tsi|interior|dashboard|headquarters|hq|building|tower|factory|plant|dealer|dealership|"
    r"showroom|engine|motor|v6|v8|v10|v12|concept|tractor|truck|van|bus|plate|chassis plate|badge)\b")
OTHER_SERIES = re.compile(r"\b(formula e|eprix|e prix|wec|lmp1|lmp2|lmh|dtm|nascar|rally|rallye|cup car|gt3|carrera cup|indycar)\b")
NOT_PLACE = re.compile(
    r"\b(plaque|sign|signage|poster|board|register|marker|memorial|statue|monument|grave|tomb|ticket|programme|"
    r"screenshot|render|rendering|visualization|visualisation|telemetry|lap chart|truck|lorry|concert|stamp|stamps|postcard|lithograph|accident|crash|souvenir|podium|prize)\b")


def graphic(im):
    """Logos, maps and diagrams: a few flat colours dominate the image."""
    from collections import Counter
    small = im.convert("RGB").resize((64, 64))
    counts = Counter((r >> 4, g >> 4, b >> 4) for r, g, b in small.getdata())
    top = counts.most_common(1)[0][1] / 4096
    return top >= 0.6 or (top >= 0.35 and len(counts) < 120)


def is_photo_name(name, lead=False):
    base = name.split(":", 1)[-1]
    if not base.lower().endswith(PHOTO_EXT):
        return False
    return not (LEAD_NOT_PHOTO if lead else NOT_PHOTO).search(norm(base.rsplit(".", 1)[0]))


def tokens(text, stop=()):
    return {t for t in norm(text).split() if len(t) >= 3 and t not in stop}


TEAM_STOP = {"team", "racing", "the", "and", "f1", "formula", "grand", "prix", "engineering", "cars", "motor", "motors",
             "automobiles", "scuderia", "works", "equipe", "ecurie", "special", "spa", "ltd", "inc"}


# ─────────────────────────────────────────────────────────────── image processing
_detector = []
MODEL_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"


def detector():
    """OpenCV's YuNet face detector (OpenCV 5 dropped the Haar cascades); the 230 KB model is cached."""
    import cv2
    if not _detector:
        model = CACHE / "models" / "yunet.onnx"
        if not model.exists():
            model.parent.mkdir(parents=True, exist_ok=True)
            data = download(MODEL_URL)
            if not data:
                raise RuntimeError("could not download the YuNet face model")
            model.write_bytes(data)
        _detector.append(cv2.FaceDetectorYN.create(str(model), "", (320, 320), 0.7, 0.3, 50))
    return _detector[0]


def faces(im, min_frac=0.06, score=0.8):
    """Faces (x, y, w, h) in a PIL image, largest first."""
    import numpy as np
    scale = 900 / max(im.size) if max(im.size) > 900 else 1
    small = im.convert("RGB").resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))))
    bgr = np.ascontiguousarray(np.asarray(small)[:, :, ::-1])
    det = detector()
    det.setInputSize((small.width, small.height))
    _, found = det.detect(bgr)
    if found is None:
        return []
    side = min(small.size) * min_frac
    k = im.width / small.width
    out = [(int(f[0] * k), int(f[1] * k), int(f[2] * k), int(f[3] * k)) for f in found if f[14] >= score and min(f[2], f[3]) >= side]
    return sorted(out, key=lambda f: -f[2] * f[3])


def open_rgb(data):
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


def save_webp(im, rel, width, quality=QUALITY, max_h=None):
    k = min(1, width / im.width, (max_h / im.height) if max_h else 1)
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    write_webp(im, OUT_DIR / rel, quality)
    return im.size, (OUT_DIR / rel).stat().st_size


def write_webp(im, path, quality):
    """Encode, and only touch the file when the bytes changed (keeps mtimes stable for scripts/images.py)."""
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    data = buf.getvalue()
    if path.exists() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def headshot(im, rel, strict=False):
    """256 px face-centred square. Returns 'face' | 'upper' | None.

    The largest face must clearly dominate (a group photo gives no headshot). `strict` (photos that are
    not the article's lead image) also requires exactly one face, at least 15 % of the image width, and
    never falls back to the upper-centre crop."""
    fs = faces(im)
    if not fs and not strict:
        fs = faces(im, min_frac=0.04, score=0.5)  # old B&W prints, goggles and caps defeat the strict pass
    w, h = im.size
    how = None
    if len(fs) >= 2 and fs[0][2] * fs[0][3] < 1.8 * fs[1][2] * fs[1][3]:
        return None
    if strict and (len(fs) != 1 or fs[0][2] < 0.15 * w):
        return None
    if fs:
        x, y, fw, fh = fs[0]
        size = min(int(fw * 2.3), w, h)
        cx, cy = x + fw / 2, y + fh / 2 + fh * 0.12
        how = "face"
    elif h >= w * 1.25:
        size = int(w * 0.72)
        cx, cy = w / 2, h * 0.32
        how = "upper"
    else:
        return None
    left = int(min(max(0, cx - size / 2), w - size))
    top = int(min(max(0, cy - size / 2), h - size))
    crop = im.crop((left, top, left + size, top + size)).resize((256, 256), Image.LANCZOS)
    write_webp(crop, OUT_DIR / rel, 80)
    return how


def dhash(im):
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


# ─────────────────────────────────────────────────────────────── credits
def is_mono(im):
    """Black-and-white (or sepia-toned) print."""
    from PIL import ImageStat
    small = im.convert("RGB").resize((48, 48))
    r, g, b = (ImageStat.Stat(small.getchannel(c)).mean[0] for c in "RGB")
    sat = ImageStat.Stat(small.convert("HSV").getchannel("S")).mean[0]
    return sat < 28 or (abs(r - g) < 6 and abs(g - b) < 6)


def tidy_artist(artist):
    """Commons 'Artist' fields carry file names, archive catalogue numbers and wiki markup: keep the people."""
    a = artist.split(".mw-parser-output")[0]
    a = re.sub(r"^(File:)?[^:/]+\.(jpe?g|png|tiff?|svg|gif):\s*", "", a, flags=re.I)  # "Foo.jpg: Author ..."
    a = re.sub(r"\s*/?\s*derivative work:\s*", " / ", a, flags=re.I)
    a = re.sub(r"\bUser:", "", a)
    a = re.sub(r"\s*\(talk\)", "", a)
    a = re.sub(r"\s*,?\s*https?://\S+", "", a)
    a = re.sub(r"\s*(,\s*NL-HaNA.*|/\s*neg\. stroken.*)$", "", a)  # Nationaal Archief / Anefo catalogue text
    a = re.sub(r"\s*Minor restoration by .*$", "", a)
    a = re.sub(r"^This photo was taken by\s+", "", a, flags=re.I)
    a = re.sub(r"\s{2,}", " ", a).strip(" ,;/")
    return a or artist


def credit(info, im=None, min_year=1900):
    meta = info["meta"]
    artist = meta_value(meta, "Artist") or meta_value(meta, "Credit") or "Unknown author"
    artist = re.sub(r"^(original|photo|photograph|author)\s*:\s*", "", artist, flags=re.I)
    assumed = re.match(r"^No machine-readable author provided\.\s*(.+?)\s+assumed\b", artist, flags=re.I)
    if assumed:
        artist = assumed.group(1)
    artist = re.sub(r"^(.+?)\s*\1$", r"\1", artist)  # "Unknown authorUnknown author"
    flickr = re.match(r"^https?://(?:www\.)?flickr\.com/(?:photos|people)/([^/\s]+)/?$", artist)
    if flickr:
        artist = f"{flickr.group(1)} (Flickr)"
    elif re.match(r"^(https?:)?//", artist) or artist.lower() in ("unknown", "unknown author", "anonymous", "unknown photographer"):
        artist = "Unknown author"
    artist = re.sub(r",?\s*(eigenes Werk|own work|trabajo propio|travail personnel)\s*$", "", artist, flags=re.I).strip(" ,")
    artist = tidy_artist(artist)
    if len(artist) > 90:
        artist = artist[:87].rsplit(" ", 1)[0] + "…"
    desc = meta_value(meta, "ImageDescription") or meta_value(meta, "ObjectName")
    # Bundesarchiv files open with a standard archive disclaimer, not a description of the photo.
    desc = re.sub(r"^For documentary purposes the German Federal Archive.*?(?:extreme|offensive)[^.]*\.\s*", "", desc, flags=re.I | re.S).strip()
    if desc.lower().startswith("for documentary purposes"):
        desc = ""
    if len(desc) > 160:
        desc = desc[:157].rsplit(" ", 1)[0] + "…"
    c = {
        "artist": artist,
        "license": meta_value(meta, "LicenseShortName"),
        "source": info["page"],
    }
    lic_url = meta_value(meta, "LicenseUrl")
    if lic_url:
        c["licenseUrl"] = lic_url if lic_url.startswith("http") else "https:" + lic_url
    year = photo_year(meta, info["title"], min_year)
    if year and im is not None and int(year) > 1985 and is_mono(im) and not YEAR_IN_NAME.search(info["title"]):
        year = None  # a recent "date taken" on a black-and-white print is the scan date, not the photo's
    if year:
        c["date"] = year
    if desc:
        c["title"] = desc
    return c


def usable(info, min_width):
    return (info and license_ok(info["meta"]) and info["mime"] in PHOTO_MIME and info["width"] >= min_width
            and info.get("thumb"))


# ─────────────────────────────────────────────────────────────── per-kind pipelines
PERSON = re.compile(r"(racing|racer|driver|motor|formula|grand prix|race car|racecar|motorcycl|rally|pilot|engineer|"
                    r"team owner|sports car|speedway|indycar|nascar|automobile|aviator|businessman|hillclimb|f1)", re.I)
report = {"drivers": {}, "constructors": {}, "circuits": {}}
sources = []


def record(rel, kind, subject, info, article, c=None):
    c = c or credit(info)
    sources.append({
        "file": "/media/commons/" + rel, "kind": kind, "subject": subject, "source": info["page"],
        "sourcePage": article, "license": c.get("license"), "licenseUrl": c.get("licenseUrl"), "artist": c["artist"],
        "bytes": (OUT_DIR / rel).stat().st_size, **({"season": int(c["date"])} if c.get("date") else {}),
    })


BAD_SUBJECT = re.compile(r"\b(grave|graves|tomb|memorial|statue|monument|plaque|bust|museum|street|strasse|house|birthplace|cemetery|stamp|circuit|autodromo|track|corner|curve|curva|kurve|trophy|award|helmet|casque|casco|kask|helm|race car drawing|livery)\b")


def is_driver_page(p, allow=False):
    if not p or p.get("missing") or "disambiguation" in (p.get("pageprops") or {}):
        return False
    return allow or not p.get("description") or bool(PERSON.search(p["description"]))


def wikidata_images(qids):
    """Q-id -> {"p18": "File:...", "p373": "Category:..."} from Wikidata."""
    out = {}
    for batch in chunks(sorted(set(qids))):
        data = api(WIKIDATA, {"action": "wbgetentities", "ids": "|".join(batch), "props": "claims"})
        for qid, ent in (data.get("entities") or {}).items():
            claims = ent.get("claims") or {}
            val = lambda prop: next((c["mainsnak"].get("datavalue", {}).get("value") for c in claims.get(prop, [])
                                     if c.get("mainsnak", {}).get("datavalue")), None)
            out[qid] = {"p18": ("File:" + val("P18")) if val("P18") else None,
                        "p373": ("Category:" + val("P373")) if val("P373") else None}
    return out


def drivers(subs):
    print(f"drivers: {len(subs)} subjects")
    pages = resolve([s["title"] for s in subs.values()])
    forced = overrides.get("file", {}).get("drivers", {})
    dropped = set(overrides.get("drop", {}).get("drivers", []))
    nohead = set(overrides.get("nohead", []))
    allow = set(overrides.get("allow", []))
    # Jolpica links some drivers to a disambiguation page: try the usual article titles instead.
    retry = {}
    for sid, s in subs.items():
        p = pages.get(s["title"])
        if not is_driver_page(p, sid in allow):
            full = f"{s['givenName']} {s['familyName']}"
            retry[sid] = [f"{full} (racing driver)", f"{full} (driver)", f"{s['title']} (racing driver)", full]
    alt = resolve({t for lst in retry.values() for t in lst})
    for sid, lst in retry.items():
        for t in lst:
            q = alt.get(t)
            if q and is_driver_page(q) and q.get("description") and PERSON.search(q["description"]):
                pages[subs[sid]["title"]] = q
                report["drivers"].setdefault(sid, {})["retitled"] = q["title"]
                break
    picks, need_more = {}, {}
    for sid, s in subs.items():
        p = pages.get(s["title"])
        rep = report["drivers"][sid] = {"title": s["title"], **report["drivers"].get(sid, {})}
        if sid in dropped:
            rep["skip"] = "dropped in review"
            continue
        if not p or p.get("missing"):
            rep["skip"] = "no article"
            continue
        rep["article"] = p["title"]
        rep["description"] = p.get("description", "")
        if "disambiguation" in (p.get("pageprops") or {}):
            rep["skip"] = "disambiguation page"
            continue
        if not is_driver_page(p, sid in allow):
            rep["skip"] = f"description does not look like a racing driver: {p['description']}"
            continue
        if sid in forced:
            picks[sid] = forced[sid]
        elif p.get("pageimage") and is_photo_name("File:" + p["pageimage"], lead=True):
            picks[sid] = "File:" + p["pageimage"].replace("_", " ")
        else:
            need_more[sid] = p
    # No usable lead image: (1) a photo on the article whose file name carries the driver's full name,
    # (2) the Wikidata image (P18), (3) the best photo in the driver's own Commons category (P373).
    imgs = article_images([p["title"] for p in need_more.values()])
    wd = wikidata_images([(p.get("pageprops") or {}).get("wikibase_item") for p in need_more.values() if (p.get("pageprops") or {}).get("wikibase_item")])
    chains = {}  # sid -> [(file, via)] in order of preference; the first free, large-enough one wins
    for sid, p in need_more.items():
        s = subs[sid]
        given, family = norm(s["givenName"]), norm(s["familyName"])

        def named(f):
            n = norm(f.split(":", 1)[1].rsplit(".", 1)[0])
            return is_photo_name(f) and family in n and given.split()[0] in n and not BAD_SUBJECT.search(n)
        chain = [(f, "article") for f in imgs.get(p["title"], []) if named(f)][:3]
        info = wd.get((p.get("pageprops") or {}).get("wikibase_item"), {})
        if info.get("p18") and is_photo_name(info["p18"], lead=True) and not BAD_SUBJECT.search(norm(info["p18"])):
            chain.append((info["p18"], "wikidata"))
        if info.get("p373"):
            data = api(COMMONS, {"list": "categorymembers", "cmtitle": info["p373"], "cmtype": "file", "cmlimit": "100"}, max_pages=1)
            files = [m["title"] for m in data.get("query", {}).get("categorymembers", [])]

            def score(f, given=given, family=family):
                n = norm(f.split(":", 1)[1].rsplit(".", 1)[0])
                if BAD_SUBJECT.search(n):
                    return -99
                return (3 if family in n else 0) + (2 if given.split()[0] in n else 0) + (2 if PORTRAIT_WORDS.search(n) else 0)
            chain += [(f, "commons category") for f in rank_files(files, score, 6)]
            report["drivers"][sid]["category"] = info["p373"]
        chains[sid] = chain
    chain_info = imageinfo({f for chain in chains.values() for f, _ in chain}, 960)
    for sid, chain in chains.items():
        hit = next(((f, via) for f, via in chain if usable(chain_info.get(f), 300)), None)
        if hit:
            picks[sid], report["drivers"][sid]["via"] = hit
        else:
            report["drivers"][sid]["skip"] = "no free photo found"
    infos = imageinfo(picks.values(), 960)
    archive = json.loads((PUBLIC / "data" / "archive.json").read_text("utf-8"))
    last_season = {}
    born = {d[0]: int(d[3][:4]) for d in archive["drivers"] if d[3]}
    for race in archive["races"]:
        for row in race[6]:
            did = archive["drivers"][row[0]][0]
            last_season[did] = max(last_season.get(did, 0), race[0])
    out = {}
    for sid, f in sorted(picks.items()):
        info = infos.get(f)
        rep = report["drivers"][sid]
        rep["file"] = f
        if not usable(info, 160):
            rep["skip"] = "not usable (" + (f"{info['meta'].get('LicenseShortName', {}).get('value', '?')}, {info['mime']}, {info['width']} px" if info else "missing") + ")"
            continue
        data = download(info["thumb"])
        if not data:
            rep["skip"] = "download failed"
            continue
        year = photo_year(info["meta"], info["title"])
        if rep.get("via") and year and int(year) > last_season.get(sid, CURRENT) + 20:
            rep["skip"] = f"fallback photo from {year}, long after the driver's career (likely a car or memorial)"
            continue
        im = open_rgb(data)
        rel = f"drivers/{sid}.webp"
        (w, h), _ = save_webp(im, rel, WIDTH["drivers"], quality=74, max_h=680)
        how = None if sid in nohead else headshot(im, f"drivers/{sid}-head.webp", strict=bool(rep.get("via")))
        rep["head"] = how
        name = f"{subs[sid]['givenName']} {subs[sid]['familyName']}"
        c = credit(info, im, born.get(sid, 1890) + 12)
        photo = {"src": "/media/commons/" + rel, "width": w, "height": h,
                 "alt": name + (f", {c['date']}" if c.get("date") else ""), "credit": c}
        record(rel, "Commons photo (driver)", sid, info, subs[sid].get("url") or "", c)
        if how:
            photo["head"] = f"/media/commons/drivers/{sid}-head.webp"
            record(f"drivers/{sid}-head.webp", "Commons headshot crop", sid, info, subs[sid].get("url") or "", c)
        else:
            (OUT_DIR / f"drivers/{sid}-head.webp").unlink(missing_ok=True)
        out[sid] = photo
    return out


def rank_files(files, score, limit):
    scored = [(score(f), f) for f in files if is_photo_name(f) and f not in DROP_FILES]
    scored = [x for x in scored if x[0] > -50]
    return [f for _, f in sorted(scored, key=lambda x: (-x[0], x[1]))[:limit]]


def category_candidates(pages, scorers, limit, min_score):
    """sid -> files from the subject's own Commons category (Wikidata P373), best first."""
    qids = {sid: (p.get("pageprops") or {}).get("wikibase_item") for sid, p in pages.items()}
    wd = wikidata_images([q for q in qids.values() if q])
    out = {}
    for sid, q in qids.items():
        cat = wd.get(q, {}).get("p373") if q else None
        if not cat:
            continue
        data = api(COMMONS, {"list": "categorymembers", "cmtitle": cat, "cmtype": "file", "cmlimit": "200"}, max_pages=1)
        files = [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
        out[sid] = [f for f in rank_files(files, scorers[sid], limit) if scorers[sid](f) >= min_score]
    return out


def constructors(subs):
    print(f"constructors: {len(subs)} subjects")
    pages = resolve([s["title"] for s in subs.values()])
    titles = {sid: pages[s["title"]]["title"] for sid, s in subs.items() if pages.get(s["title"]) and not pages[s["title"]].get("missing")}
    imgs = article_images(titles.values())
    forced = overrides.get("file", {}).get("constructors", {})
    cands, scorers = {}, {}
    for sid, title in titles.items():
        s = subs[sid]
        p = pages[s["title"]]
        toks = tokens(s["name"] + " " + title, TEAM_STOP)
        if "disambiguation" in (p.get("pageprops") or {}):
            report["constructors"][sid] = {"skip": "disambiguation"}
            continue
        if sid in set(overrides.get("drop", {}).get("constructors", [])):
            report["constructors"][sid] = {"skip": "dropped in review (road car, building or non-F1 photo)"}
            continue

        def score(f, toks=toks, lead=p.get("pageimage")):
            n = norm(f.split(":", 1)[1].rsplit(".", 1)[0])
            v = 0
            if lead and f.replace(" ", "_").endswith(lead):
                v += 4
            if toks & set(n.split()):
                v += 4
            if CAR_WORDS.search(n) or re.search(r"\b[a-z]{0,4}\d{2,3}[a-z]?\b", n):
                v += 2
            if re.search(r"\b(f1|formula one|formula 1|grand prix|gp)\b", n):
                v += 2
            if PORTRAIT_WORDS.search(n):
                v -= 4
            if ROAD_CAR.search(n):
                v -= 6
            if OTHER_SERIES.search(n):
                v -= 4
            return v
        lst = [forced[sid]] if sid in forced else [f for f in rank_files(imgs.get(title, []), score, 12) if score(f) >= 0]
        cands[sid], scorers[sid] = lst, score
        report["constructors"][sid] = {"article": title, "candidates": lst}
    # Then the team's own Commons category (cars it built), for teams whose article has few photos.
    thin = {sid: pages[subs[sid]["title"]] for sid in cands if sid not in forced and len(cands[sid]) < 4}
    for sid, extra in category_candidates(thin, scorers, 10, 2).items():
        cands[sid] += [f for f in extra if f not in cands[sid]]
    infos = imageinfo({f for lst in cands.values() for f in lst}, WIDTH["constructors"])
    out = {}
    for sid, lst in sorted(cands.items()):
        rep = report["constructors"][sid]
        tried = 0
        for f in lst:
            info = infos.get(f)
            if not usable(info, 640) or (info["mime"] == "image/png" and sid not in forced):
                continue  # PNGs on Wikipedia are logos, diagrams and renders
            if tried >= 6:
                break
            tried += 1
            data = download(info["thumb"])
            if not data:
                continue
            im = open_rgb(data)
            if im.height > im.width * 1.25:
                continue  # portrait orientation: rarely a car
            if graphic(im):
                rep.setdefault("rejected", []).append(f + " (graphic)")
                continue
            fs = faces(im, min_frac=0.05)
            if fs and fs[0][2] * fs[0][3] > 0.025 * im.width * im.height:
                rep.setdefault("rejected", []).append(f + " (face)")
                continue
            rel = f"teams/{sid}.webp"
            (w, h), _ = save_webp(im, rel, WIDTH["constructors"], quality=74)
            c = credit(info, im)
            out[sid] = {"src": "/media/commons/" + rel, "width": w, "height": h,
                        "alt": c.get("title") or f"{subs[sid]['name']}", "credit": c}
            record(rel, "Commons photo (constructor)", sid, info, subs[sid].get("url") or "", c)
            rep["file"] = f
            break
        else:
            rep["skip"] = "no free photograph"
    return out


def circuits(subs, official):
    print(f"circuits: {len(subs)} subjects")
    pages = resolve([s["title"] for s in subs.values()])
    titles = {sid: pages[s["title"]]["title"] for sid, s in subs.items() if pages.get(s["title"]) and not pages[s["title"]].get("missing")}
    imgs = article_images(titles.values())
    archive = json.loads((PUBLIC / "data" / "archive.json").read_text("utf-8"))
    surnames = {norm(r[2]) for r in archive["drivers"] if len(norm(r[2])) > 4}
    forced = overrides.get("file", {}).get("circuits", {})
    cands, scorers = {}, {}
    for sid, title in titles.items():
        s = subs[sid]
        toks = tokens(s["circuitName"] + " " + title + " " + s["Location"]["locality"], {"circuit", "international", "the", "and", "racing", "grand", "prix", "street", "autodromo", "circuito", "park"})

        def score(f, toks=toks):
            n = norm(f.split(":", 1)[1].rsplit(".", 1)[0])
            words = set(n.split())
            v = 0
            if PLACE_STRONG.search(n):
                v += 5
            if PLACE_WORDS.search(n):
                v += 2
            if toks & words:
                v += 3
            if PORTRAIT_WORDS.search(n):
                v -= 6
            if words & surnames and not (toks & words):
                v -= 3  # named after a driver: likely a person or a car, not the place
            if NOT_PLACE.search(n):
                v -= 8
            if re.search(r"\b(satellite|iss|landsat|sentinel|nasa|esa)\b", n):
                v -= 1  # fine as a "place", but a ground-level photo makes a better hero
            return v
        lst = forced.get(sid) or rank_files(imgs.get(title, []), score, 30)
        cands[sid], scorers[sid] = lst, score
        report["circuits"][sid] = {"article": title, "candidates": len(lst)}
    # Then the venue's own Commons category: more photos of the circuit and its surroundings.
    more = {sid: pages[subs[sid]["title"]] for sid in cands if sid not in forced}
    for sid, extra in category_candidates(more, scorers, 30, 0).items():
        cands[sid] += [f for f in extra if f not in cands[sid]]
        report["circuits"][sid]["category"] = len(extra)
    infos = imageinfo({f for lst in cands.values() for f in lst}, WIDTH["hero"])
    out = {}
    for sid, lst in sorted(cands.items()):
        rep = report["circuits"][sid]
        photos, hashes = [], []
        need_hero = not official.get(sid)
        for f in lst:
            if len(photos) >= 5:
                break
            info = infos.get(f)
            if not usable(info, 800) or info["mime"] == "image/png":
                continue  # PNGs on Wikipedia are layout maps, diagrams and renders
            if scorers.get(sid, lambda _: 0)(f) < -4:
                continue
            if info["height"] > info["width"] * 1.1 and not photos:
                continue  # the lead photo must be landscape
            data = download(info["thumb"])
            if not data:
                continue
            im = open_rgb(data)
            if graphic(im):
                rep.setdefault("rejected", []).append(f + " (graphic)")
                continue
            fs = faces(im, min_frac=0.04)
            if fs and fs[0][2] * fs[0][3] > 0.012 * im.width * im.height:
                rep.setdefault("rejected", []).append(f + " (face)")
                continue
            hsh = dhash(im)
            if any(bin(hsh ^ o).count("1") <= 10 for o in hashes):
                continue  # near-duplicate (e.g. a cropped copy)
            hashes.append(hsh)
            i = len(photos)
            hero = i == 0 and need_hero and im.width >= 1200
            rel = f"circuits/{sid}-hero.webp" if hero else f"circuits/{sid}-{i + 1}.webp"
            (w, h), _ = save_webp(im, rel, WIDTH["hero"] if hero else WIDTH["places"], quality=74 if hero else 68)
            c = credit(info, im)
            photos.append({"src": "/media/commons/" + rel, "width": w, "height": h,
                           "alt": c.get("title") or subs[sid]["circuitName"], "credit": c})
            record(rel, "Commons photo (circuit)" if i == 0 else "Commons photo (circuit surroundings)", sid, info,
                   subs[sid].get("url") or "", c)
        rep["photos"] = len(photos)
        if photos:
            out[sid] = photos
    return out


# ─────────────────────────────────────────────────────────────── outputs
def credits_html(data, names):
    esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    rows = []
    for kind, label in (("drivers", "Drivers"), ("constructors", "Constructors"), ("circuits", "Circuits & places")):
        items = []
        for sid, val in sorted(data[kind].items(), key=lambda kv: names[kind].get(kv[0], kv[0])):
            for p in (val if isinstance(val, list) else [val]):
                c = p["credit"]
                lic = f'<a href="{esc(c.get("licenseUrl"))}">{esc(c.get("license"))}</a>' if c.get("licenseUrl") else esc(c.get("license"))
                items.append(
                    f'<tr><td>{esc(names[kind].get(sid, sid))}</td><td><a href="{esc(c["source"])}">'
                    f'{esc(c["source"].rsplit("/File:", 1)[-1].replace("_", " "))}</a></td><td>{esc(c["artist"])}</td>'
                    f'<td>{lic}</td><td>{esc(c.get("date", ""))}</td></tr>')
        rows.append(f'<h2 id="{kind}">{label} <small>{len(items)} files</small></h2><table><thead><tr><th>Subject</th>'
                    f'<th>File (Wikimedia Commons)</th><th>Author</th><th>Licence</th><th>Year</th></tr></thead><tbody>'
                    + "".join(items) + "</tbody></table>")
    total = sum(len(v) if isinstance(v, list) else 1 for k in ("drivers", "constructors", "circuits") for v in data[k].values())
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photo credits · F1 Pulse</title><meta name="robots" content="noindex">
<style>
:root{{color-scheme:light dark;--bg:#f5f5f7;--fg:#1d1d1f;--mut:#6e6e73;--line:#d2d2d7;--card:#fff;--link:#0066cc}}
@media (prefers-color-scheme:dark){{:root{{--bg:#000;--fg:#f5f5f7;--mut:#a1a1a6;--line:#38383a;--card:#1c1c1e;--link:#2997ff}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:1100px;margin:0 auto;padding:32px 16px 64px}}h1{{font-size:32px;letter-spacing:-.02em;margin:0 0 8px}}
h2{{margin:40px 0 12px;font-size:20px}}h2 small{{color:var(--mut);font-weight:500;font-size:13px}}p{{color:var(--mut);max-width:760px}}
a{{color:var(--link);text-decoration:none}}a:hover{{text-decoration:underline}}nav a{{margin-right:16px}}
.wrap{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:13px}}
th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}}
th{{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}}td:first-child{{font-weight:600;white-space:nowrap}}
@media (max-width:640px){{td:nth-child(5),th:nth-child(5){{display:none}}td:first-child{{white-space:normal}}}}
</style></head><body><main>
<p><a href="/settings">← Back to F1 Pulse</a></p>
<h1>Photo credits</h1>
<p>{total} freely licensed photographs from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a> illustrate historical drivers, constructors and circuits. Each is used under the licence shown (CC0, public domain, CC BY, CC BY-SA or GFDL) and was resized and re-encoded (and, for driver headshots, cropped) for the web. Follow a file name for the original, its full description and licence terms. Official Formula 1 imagery is listed separately in the <a href="/media/sources.json">provenance register</a>.</p>
<nav><a href="#drivers">Drivers</a><a href="#constructors">Constructors</a><a href="#circuits">Circuits</a></nav>
<div class="wrap">{"".join(rows)}</div>
</main></body></html>
"""


def main():
    kinds = [k for k in ("drivers", "constructors", "circuits") if k in sys.argv[1:]] or ["drivers", "constructors", "circuits"]
    started = time.time()
    subs, ids = subjects()
    media = json.loads((ROOT / "src" / "data" / "media.json").read_text("utf-8"))
    official = {k: bool(v.get("hero")) for k, v in media["circuits"].items()}
    old = json.loads(OUT_JSON.read_text("utf-8")) if OUT_JSON.exists() else {}
    data = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "source": "Wikimedia Commons",
            "drivers": old.get("drivers", {}), "constructors": old.get("constructors", {}), "circuits": old.get("circuits", {})}
    old_sources = json.loads(SOURCES.read_text("utf-8"))
    keep_prefix = tuple("/media/commons/" + FOLDER[k] + "/" for k in kinds)
    if "drivers" in kinds:
        data["drivers"] = drivers(subs["drivers"])
    if "constructors" in kinds:
        data["constructors"] = constructors(subs["constructors"])
    if "circuits" in kinds:
        data["circuits"] = circuits(subs["circuits"], official)
    # Remove files of this run's kinds that are no longer referenced.
    referenced = {s["file"] for s in sources}
    for k in kinds:
        folder = OUT_DIR / FOLDER[k]
        for path in folder.glob("*.webp") if folder.exists() else []:
            url = "/media/commons/" + path.relative_to(OUT_DIR).as_posix()
            if url not in referenced:
                path.unlink()
    merged = {s["file"]: s for s in old_sources if not s["file"].startswith(keep_prefix)}
    for s in sources:
        merged[s["file"]] = s
    SOURCES.write_text(json.dumps(sorted(merged.values(), key=lambda s: s["file"]), indent=1, ensure_ascii=False), encoding="utf-8")
    season_windows(data["constructors"])
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    names = {
        "drivers": {sid: f"{s['givenName']} {s['familyName']}" for sid, s in subs["drivers"].items()},
        "constructors": {sid: s["name"] for sid, s in subs["constructors"].items()},
        "circuits": {sid: s["circuitName"] for sid, s in subs["circuits"].items()},
    }
    CREDITS.write_text(credits_html(data, names), encoding="utf-8")
    old_report = json.loads(REPORT.read_text("utf-8")) if REPORT.exists() else {}
    REPORT.write_text(json.dumps({**old_report, **{k: report[k] for k in kinds}}, indent=1, ensure_ascii=False), encoding="utf-8")
    total_bytes = sum((OUT_DIR / s["file"][len("/media/commons/"):]).stat().st_size for s in merged.values() if s["file"].startswith("/media/commons/"))
    for k in ("drivers", "constructors", "circuits"):
        have = len(data[k])
        print(f"  {k}: {have}/{len(ids[k])} subjects with photos ({have / max(1, len(ids[k])) * 100:.1f}%)")
    print(f"  commons total {total_bytes / 1e6:.1f} MB · API {stats['api']} live / {stats['api_cached']} cached · files {stats['file']} live / {stats['file_cached']} cached · {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
