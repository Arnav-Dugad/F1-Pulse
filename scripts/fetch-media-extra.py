"""More official Formula 1 imagery: per-race trackside galleries (2026) and helmet artwork (2019+).

The site owner states permission to use official Formula 1 marks and photographs. Every file is
recorded with its source URL in public/media/sources.json.

  python scripts/fetch-media-extra.py            # both
  python scripts/fetch-media-extra.py races      # race-weekend galleries for every completed 2026 round
  python scripts/fetch-media-extra.py helmets    # official helmets, 2019 to the current season

Race galleries: the official race page (formula1.com/en/racing/2026/<slug>) and the weekend's reports
linked from it embed Getty / trackside photo records. A photo belongs to a round only when its Getty
dateline (e.g. "SUZUKA, JAPAN - MARCH 29:") falls on that race weekend, or - with no dateline - its
trackside folder names that Grand Prix. Up to 8 distinct photos per round (1400 px, <= 220 KB),
spread over sessions, race day first. -> media.json galleries.races["2026-<round>"].

Helmets: content/dam/fom-website/manual/Helmets{YEAR}/{surname}.png (surname slug variants are probed;
a missing file is a 404). Byte-identical files shared by several drivers in a season are placeholders
and dropped; a driver's file identical to an earlier season's is a stale copy and dropped.
-> media.json helmets[driverId][year].
"""

import datetime
import hashlib
import io
import json
import re
import sys
import unicodedata
import urllib.parse

from PIL import Image

import media_gallery_lib as gal
from media_seasons_lib import CDN, MEDIA, ROOT, http, roster, season_results

PERMISSION = "Site owner states permission granted"
SEASON = 2026
PER_RACE = 8
DONE_FILE = ROOT / "scripts" / ".media-processed"
done = set(DONE_FILE.read_text().split()) if DONE_FILE.exists() else set()
sources = []

RACE_SLUGS = {  # circuitId -> formula1.com race page slug (2026)
    "albert_park": "australia", "shanghai": "china", "suzuka": "japan", "miami": "miami", "villeneuve": "canada",
    "monaco": "monaco", "catalunya": "barcelona-catalunya", "red_bull_ring": "austria", "silverstone": "great-britain",
    "spa": "belgium", "hungaroring": "hungary", "zandvoort": "netherlands", "monza": "italy", "madring": "spain",
    "baku": "azerbaijan", "sepang": "bahrain", "bahrain": "bahrain", "jeddah": "saudi-arabia", "marina_bay": "singapore",
    "americas": "united-states", "rodriguez": "mexico", "interlagos": "brazil", "vegas": "las-vegas", "losail": "qatar",
    "yas_marina": "united-arab-emirates",
}
MONTHS = {m: i + 1 for i, m in enumerate(["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST",
                                          "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"])}
DATELINE = re.compile(r"^([A-Z][A-Z .'\-]+), ([A-Z][A-Z .'\-]+) - ([A-Z]+) (\d{1,2}):\s*(.*)$", re.S)
ARTICLE_HINTS = ("victory", "wins", "win-", "takes", "pole", "qualifying", "sprint", "fp1", "fp2", "fp3", "lowdown",
                 "driver-of-the-day", "live-coverage", "report", "highlights", "podium", "grand-prix")


def rel_of(path):
    return "/media/" + path


def record(rel, kind, subject, source, season, page, extra=None):
    entry = {"file": rel_of(rel), "kind": kind, "subject": subject, "source": source, "sourcePage": page,
             "permission": PERMISSION, "bytes": (MEDIA / rel).stat().st_size, "season": season}
    entry.update(extra or {})
    sources.append(entry)


def norm(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


# ───────────────────────────────────────────────────────── race galleries
def dateline(text):
    m = DATELINE.match((text or "").strip())
    if not m or m.group(3) not in MONTHS:
        return None
    return {"city": m.group(1).title(), "country": m.group(2).title(),
            "day": datetime.date(SEASON, MONTHS[m.group(3)], int(m.group(4))), "text": m.group(5).strip()}


SUPPORT = re.compile(r"\b(formula 2|formula 3|f2|f3|f1 academy|porsche|supercup|trident|prema|campos racing|dams|"
                     r"art grand prix|hitech|mp motorsport|van amersfoort|rodin|aix racing|invicta)\b")


def belongs(rec, race):
    """True when the photo was provably taken at this race weekend (and is not a support-series photo)."""
    if SUPPORT.search(norm(rec["public_id"] + " " + rec["title"] + " " + rec["caption"])):
        return False
    race_day = datetime.date.fromisoformat(race["date"])
    for t in (rec["title"], rec["caption"]):
        d = dateline(t)
        if d:
            return 0 <= (race_day - d["day"]).days <= 4
    # No dateline: the trackside folder must name this Grand Prix.
    label = gal.caption_for(rec).split(" 2026")[0]
    return norm(label) == norm(race["raceName"]) or norm(label) in norm(race["raceName"])


def session_of(rec, race):
    folder = rec["path"].strip("/").split("/")
    if folder[0] == "trackside-images" and "___" in folder[2]:
        return gal.SESSIONS.get(norm(folder[2].split("___", 1)[1].replace("__", " ")), "")
    d = dateline(rec["title"]) or dateline(rec["caption"])
    if d:
        delta = (datetime.date.fromisoformat(race["date"]) - d["day"]).days
        return {0: "Race day", 1: "Saturday", 2: "Friday", 3: "Thursday"}.get(delta, "")
    return ""


def score(rec, race):
    text = norm(rec["title"] + " " + rec["caption"])
    s = 0
    d = dateline(rec["title"]) or dateline(rec["caption"])
    if d and d["day"] == datetime.date.fromisoformat(race["date"]):
        s += 4
    if re.search(r"\b(race winner|celebrates|podium|start|lights out|leads|leading|champagne)\b", text):
        s += 3
    if "driving" in text or "on track" in text:
        s += 2
    if re.search(r"\b(team principal|ceo|guest|celebrity|fans|atmosphere|portrait|press conference|walks|arrives)\b", text):
        s -= 1
    return s


def race_pages(slug):
    url = f"https://www.formula1.com/en/racing/{SEASON}/{slug}"
    html = gal.page(url)
    links = sorted(set(re.findall(r"/en/latest/article/[A-Za-z0-9\-]+\.[A-Za-z0-9]+", html)))
    skip = ("quiz-", "the-trophies-won", "8-unique-locations")
    keep = [l for l in links if not any(s in l for s in skip)]
    # Weekend reports first (they carry most of the race's photos), then everything else linked.
    keep.sort(key=lambda l: (not any(h in l.lower() for h in ARTICLE_HINTS), l))
    return url, html, ["https://www.formula1.com" + l for l in keep[:30]]


BODY_IMG = re.compile(
    r'"src":"https://media\.formula1\.com/image/upload/(t_[A-Za-z0-9]+)/[^"]*?/v\d+/'
    r'((?:trackside-images|fom-website)/2026/[^"]+?)\.(?:webp|jpg|jpeg|png)","alt":"((?:[^"\\]|\\.)*)"')
FOOTER = re.compile(r'ImageCard-module_footer[^"]*","children":"((?:[^"\\]|\\.)*)"')


def body_images(html, page_url):
    """Inline article images (`<img src=… alt="CITY, COUNTRY - MONTH DD: …">` + caption footer)."""
    text = gal.payload(html)
    out = []
    for m in BODY_IMG.finditer(text):
        pid = urllib.parse.unquote(m.group(2))
        foot = FOOTER.search(text, m.end(), m.end() + 600)
        out.append({
            "public_id": pid, "path": "/" + pid + ".jpg", "title": json.loads('"' + m.group(3) + '"'),
            "caption": json.loads('"' + foot.group(1) + '"') if foot else "", "transform": m.group(1),
            "gallery": False, "pages": [page_url],
        })
    return out


def caption(rec, race):
    session = session_of(rec, race)
    base = f"{race['raceName']} {SEASON}" + (f" · {session}" if session else "")
    editorial = (rec.get("caption") or "").strip()
    if editorial and not dateline(editorial) and len(editorial) <= 160:
        return base, editorial.rstrip(".")
    d = dateline(rec["title"]) or dateline(rec["caption"])
    if d and d["text"]:
        text = d["text"]
        text = re.sub(r"\s*\(Photo by .*$", "", text, flags=re.S).strip()
        text = re.split(r"(?<=[a-z0-9\)])\. ", text)[0].rstrip(".")
        if len(text) > 140:
            text = text[:137].rsplit(" ", 1)[0]
        # Getty titles arrive cut at ~100 characters: end on a whole phrase and mark the cut.
        if len(text) >= 60 and not text.endswith((".", "!", "?", ")")):
            text = re.sub(r"(\s+(and|of|the|on|in|at|during|with|for|to|a|an|\(\d+\)))+$", "", text) + "…"
        return base, text
    return base, ""


def download_race_photo(rec, round_no):
    pid = rec["public_id"]
    stem = re.sub(r"[^a-z0-9]+", "-", pid.split(f"/{SEASON}/")[-1].lower()).strip("-")[-60:]
    rel = f"races/{SEASON}-{round_no:02d}-{stem}.webp"
    if (MEDIA / rel).exists() and rel in done:
        return rel, f"{CDN}/{rec['transform']}/c_fill,w_1400/q_76/v1740000001/{urllib.parse.quote(pid)}.webp"
    steps = ((1400, 76), (1400, 70), (1400, 62), (1200, 62), (1000, 62))
    for w, q in steps:  # Cloudinary re-encodes from the original every time: no double lossy pass
        url = f"{CDN}/{rec['transform']}/c_fill,w_{w}/q_{q}/v1740000001/{urllib.parse.quote(pid)}.webp"
        status, data = http(url)
        if status != 200 or not data:
            return None, None
        if len(data) <= 220_000 or (w, q) == steps[-1]:
            (MEDIA / rel).parent.mkdir(parents=True, exist_ok=True)
            (MEDIA / rel).write_bytes(data)
            done.add(rel)
            return rel, url
    return None, None


def races(media):
    results = season_results(SEASON)
    out = {}
    for race in results:
        rnd = int(race["round"])
        slug = RACE_SLUGS.get(race["Circuit"]["circuitId"])
        if not slug:
            print(f"  round {rnd}: no race page slug for {race['Circuit']['circuitId']}")
            continue
        url, html, articles = race_pages(slug)
        pool = {}
        for page_url, text in [(url, html)] + [(a, gal.page(a)) for a in articles]:
            for rec in gal.images(text, page_url) + body_images(text, page_url):
                if gal.is_photo(rec) and belongs(rec, race):
                    pool.setdefault(rec["public_id"], {**rec, "page": page_url})
        # Best first, one photo per session before repeating one; race day first.
        ranked = sorted(pool.values(), key=lambda r: (-score(r, race), r["public_id"]))
        firsts, rest, seen = [], [], set()
        for rec in ranked:
            key = session_of(rec, race)
            (rest if key in seen else firsts).append(rec)
            seen.add(key)
        chosen = (firsts + rest)[:PER_RACE]
        items = []
        for rec in chosen:
            rel, src = download_race_photo(rec, rnd)
            if not rel:
                continue
            cap, desc = caption(rec, race)
            credit = gal.credit_for(rec)
            items.append({"src": rel_of(rel), "caption": cap + (f" — {desc}" if desc else ""), "credit": credit})
            record(rel, "race weekend photograph", f"{SEASON}-{rnd}", src, SEASON, rec["page"],
                   {"caption": cap, "credit": credit, "description": desc or rec["title"][:200]})
        print(f"  round {rnd:2d} {race['raceName']}: {len(pool)} candidates from {1 + len(articles)} pages -> {len(items)} photos")
        if items:
            out[f"{SEASON}-{rnd}"] = items
    media.setdefault("galleries", {})["races"] = out


# ───────────────────────────────────────────────────────── helmets
def surname_slugs(d):
    fam = unicodedata.normalize("NFKD", d["familyName"]).encode("ascii", "ignore").decode().lower()
    given = unicodedata.normalize("NFKD", d["givenName"]).encode("ascii", "ignore").decode().lower()
    out = [fam.replace(" ", ""), fam.replace(" ", "-"), fam.split()[-1], fam.replace(" ", "_"),
           f"{given}-{fam}".replace(" ", "-"), f"{given}{fam}".replace(" ", ""), given]
    return [s for s in dict.fromkeys(out) if s]


def helmets(media):
    found = {}  # driverId -> {year: (bytes, url)}
    for year in range(2019, SEASON + 1):
        try:
            ros = roster(year)
        except Exception as err:  # noqa: BLE001
            print(f"  {year}: roster unavailable ({err})")
            continue
        season = {}
        for did, entry in ros.items():
            if not entry["started"]:
                continue
            for slug in surname_slugs(entry["driver"]):
                url = f"{CDN}/c_fit,w_600/q_auto/content/dam/fom-website/manual/Helmets{year}/{urllib.parse.quote(slug)}.png"
                status, data = http(url, retries=2)
                if status == 200 and data and len(data) > 2000:
                    season[did] = (data, url)
                    break
        counts = {}
        for did, (data, _) in season.items():
            counts[hashlib.sha1(data).hexdigest()] = counts.get(hashlib.sha1(data).hexdigest(), 0) + 1
        kept = 0
        for did, (data, url) in season.items():
            h = hashlib.sha1(data).hexdigest()
            if counts[h] > 1:
                continue  # shared placeholder artwork
            if any(hashlib.sha1(b).hexdigest() == h for b, _ in found.get(did, {}).values()):
                continue  # identical to an earlier season: stale copy
            found.setdefault(did, {})[str(year)] = (data, url)
            kept += 1
        print(f"  helmets {year}: {len(season)} found, {kept} kept")
    out = {}
    for did, years in sorted(found.items()):
        for year, (data, url) in sorted(years.items()):
            rel = f"helmets/{did}-{year}.webp"
            if not ((MEDIA / rel).exists() and rel in done):
                im = Image.open(io.BytesIO(data)).convert("RGBA")
                bbox = im.getchannel("A").getbbox()
                if bbox:
                    im = im.crop(bbox)
                (MEDIA / rel).parent.mkdir(parents=True, exist_ok=True)
                im.save(MEDIA / rel, "WEBP", quality=82, method=6)
                done.add(rel)
            out.setdefault(did, {})[year] = rel_of(rel)
            record(rel, "helmet artwork", did, url, int(year), "https://www.formula1.com/")
    media["helmets"] = out
    print(f"  helmets: {sum(len(v) for v in out.values())} files for {len(out)} drivers")


def owned(entry, stages):
    f = entry["file"]
    return ("races" in stages and f.startswith("/media/races/")) or ("helmets" in stages and f.startswith("/media/helmets/"))


def main():
    stages = set(sys.argv[1:]) or {"races", "helmets"}
    manifest = ROOT / "src" / "data" / "media.json"
    media = json.loads(manifest.read_text(encoding="utf-8"))
    sources_path = MEDIA / "sources.json"
    old = json.loads(sources_path.read_text(encoding="utf-8"))
    if "races" in stages:
        races(media)
    if "helmets" in stages:
        helmets(media)
    keep = {s["file"]: s for s in old if not owned(s, stages)}
    for s in sources:
        keep[s["file"]] = s
    # Remove files of the refreshed stages that are no longer referenced.
    for stage in stages:
        folder = MEDIA / stage
        for path in folder.glob("*.webp") if folder.exists() else []:
            if rel_of(path.relative_to(MEDIA).as_posix()) not in keep:
                path.unlink()
                done.discard(path.relative_to(MEDIA).as_posix())
    sources_path.write_text(json.dumps(sorted(keep.values(), key=lambda s: s["file"]), indent=1, ensure_ascii=False), encoding="utf-8")
    manifest.write_text(json.dumps(media, indent=1, ensure_ascii=False), encoding="utf-8")
    DONE_FILE.write_text("\n".join(sorted(done)))
    print(f"{len(sources)} files recorded")


if __name__ == "__main__":
    main()
