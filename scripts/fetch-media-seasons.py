"""Download official Formula 1 media for past seasons (2019-2025) and 2026 trackside galleries.

The site owner states permission to use official Formula 1 marks and photographs.
Every file is recorded with its source URL in public/media/sources.json.

  python scripts/fetch-media-seasons.py            # everything
  python scripts/fetch-media-seasons.py seasons    # only 2019-2025 season media
  python scripts/fetch-media-seasons.py galleries  # only 2026 galleries (+ 2026 left-side cars)

Rosters come from Jolpica results (every driver with a race result; team = constructor of their
latest race that season). Media is probed on media.formula1.com:
  2024-2025  modern transparent cut-outs  common/f1/{Y}/{team}/{f1id}/{Y}{team}{f1id}{front|right|numberwhitefrless}.webp
  2019-2023  studio portraits             content/dam/fom-website/drivers/{Y}Drivers/{surname}.jpg
             cars / logos                 content/dam/fom-website/teams/{Y}/{team}[-logo].png
A missing asset is a 404, so probing is reliable. Legacy car files that are byte-identical to an
earlier season's file are stale copies and are dropped (they would show the wrong car).
Responses (Jolpica, pages) are cached in $F1PULSE_CACHE (default: <tmp>/f1pulse-media-cache).
"""

import hashlib
import io
import json
import re
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from media_seasons_lib import CDN, MEDIA, ROOT, ascii_slug, http, roster, season_results
import media_gallery_lib as gal

PERMISSION = "Site owner states permission granted"
V = "v1740000001/common/f1"
DONE_FILE = ROOT / "scripts" / ".media-processed"
done = set(DONE_FILE.read_text().split()) if DONE_FILE.exists() else set()
sources = []

# ---------------------------------------------------------------- team slugs per season
MODERN_SLUGS = {  # constructorId -> candidate F1 slugs, most current first
    2024: {"red_bull": ["redbullracing"], "rb": ["rb", "racingbulls"], "sauber": ["kicksauber"], "haas": ["haas", "haasf1team"],
           "aston_martin": ["astonmartin"], "alpine": ["alpine"], "williams": ["williams"], "mclaren": ["mclaren"],
           "mercedes": ["mercedes"], "ferrari": ["ferrari"]},
    2025: {"red_bull": ["redbullracing"], "rb": ["racingbulls", "rb"], "sauber": ["kicksauber"], "haas": ["haasf1team", "haas"],
           "aston_martin": ["astonmartin"], "alpine": ["alpine"], "williams": ["williams"], "mclaren": ["mclaren"],
           "mercedes": ["mercedes"], "ferrari": ["ferrari"]},
}
LEGACY_SLUGS = {
    "mercedes": ["mercedes"], "ferrari": ["ferrari"], "red_bull": ["red-bull-racing"], "mclaren": ["mclaren"],
    "renault": ["renault"], "alpine": ["alpine"], "racing_point": ["racing-point"], "aston_martin": ["aston-martin"],
    "toro_rosso": ["toro-rosso"], "alphatauri": ["alphatauri"], "haas": ["haas-f1-team", "haas"], "williams": ["williams"],
    "alfa": ["alfa-romeo-racing", "alfa-romeo"],
}
LEGACY_SLUGS_BY_YEAR = {2022: {"alfa": ["alfa-romeo", "alfa-romeo-racing"]}, 2023: {"alfa": ["alfa-romeo", "alfa-romeo-racing"]}}


def rel_of(path):
    return "/media/" + path


def record(rel, kind, subject, source, season, page="https://www.formula1.com/", extra=None):
    target = MEDIA / rel
    entry = {"file": rel_of(rel), "kind": kind, "subject": subject, "source": source, "sourcePage": page,
             "permission": PERMISSION, "bytes": target.stat().st_size, "season": season}
    if extra:
        entry.update(extra)
    sources.append(entry)


def store(url, rel, check=None):
    """Download url to public/media/rel unless already final. Returns True when the file exists."""
    target = MEDIA / rel
    if target.exists() and rel in done:
        return True
    status, data = http(url)
    if status != 200 or not data:
        return False
    if check and not check(data):
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    done.add(rel)
    return True


def head_metrics(alpha):
    """(top row, head width, head centre x) of a transparent cut-out, measured from the alpha mask:
    the widest row above the neck is the head; framing (full-length, 3/4, bust) does not matter."""
    w, h = alpha.size
    mask = alpha.point(lambda v: 255 if v > 40 else 0)
    rows = []
    for y in range(h):
        box = mask.crop((0, y, w, y + 1)).getbbox()
        rows.append((box[2] - box[0], (box[0] + box[2]) / 2) if box else (0, 0))
    y0 = next(i for i, r in enumerate(rows) if r[0])
    widths = [r[0] for r in rows[y0:]]
    smooth = [sum(widths[max(0, i - 2): i + 3]) / len(widths[max(0, i - 2): i + 3]) for i in range(len(widths))]
    peak, peak_y, neck = 0, 0, None
    for i, v in enumerate(smooth):
        if neck is None and v > peak:
            peak, peak_y = v, i
        if neck is None and peak > 20 and v < 0.85 * peak:
            neck = i
        if neck is not None and v > 1.5 * peak:
            break
    centres = sorted(c for _, c in rows[y0 + max(0, peak_y - 10): y0 + peak_y + 10] if c)
    return y0, peak, centres[len(centres) // 2]


def head_from_cutout(src_rel, dst_rel):
    """256x256 headshot from a transparent cut-out; crop = 1.6 x head width (matches the 2026 heads)."""
    if (MEDIA / dst_rel).exists() and dst_rel in done:
        return True
    im = Image.open(MEDIA / src_rel).convert("RGBA")
    if not im.split()[3].getbbox():
        return False
    y0, head_w, hx = head_metrics(im.split()[3])
    size = int(head_w * 1.6)
    top = y0 - int(size * 0.06)
    head = im.crop((int(hx - size / 2), top, int(hx + size / 2), top + size)).resize((256, 256), Image.LANCZOS)
    (MEDIA / dst_rel).parent.mkdir(parents=True, exist_ok=True)
    head.save(MEDIA / dst_rel, "WEBP", quality=86, method=6)
    done.add(dst_rel)
    return True


# Legacy studio portraits are 1920x1920 with the face in the top-centre. Fractions of the side.
LEGACY_HEAD = {"x": 0.5, "top": 0.015, "size": 0.36}
LEGACY_HEAD_BY_YEAR = {"2023": {"top": 0.0, "size": 0.40}}  # 2023 portraits sit higher in the frame
LEGACY_HEAD_OVERRIDES = {}  # "year/driverId": {"x":..., "top":..., "size":...} after visual review


def legacy_photo(url, photo_rel, head_rel, key):
    """Store a framed studio portrait (760 px) and a 256 px head crop, each encoded once from the JPEG."""
    have = all((MEDIA / r).exists() and r in done for r in (photo_rel, head_rel))
    if have:
        return True
    status, data = http(url)
    if status != 200:
        return False
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    (MEDIA / photo_rel).parent.mkdir(parents=True, exist_ok=True)
    im.resize((760, round(h * 760 / w)), Image.LANCZOS).save(MEDIA / photo_rel, "WEBP", quality=80, method=6)
    p = {**LEGACY_HEAD, **LEGACY_HEAD_BY_YEAR.get(key.split("/")[0], {}), **LEGACY_HEAD_OVERRIDES.get(key, {})}
    s = p["size"] * w
    cx, top = p["x"] * w, p["top"] * h
    im.crop((int(cx - s / 2), int(top), int(cx + s / 2), int(top + s))).resize((256, 256), Image.LANCZOS).save(
        MEDIA / head_rel, "WEBP", quality=86, method=6)
    done.update({photo_rel, head_rel})
    return True


def f1id_candidates(given, family):
    g, f = ascii_slug(given), ascii_slug(family)
    out = [g[:3] + f[:3] + "01", f[:3] + g[:3] + "01", g[:3] + f[:3] + "02"]
    if " " in family:
        out.append(g[:3] + ascii_slug(family.split()[-1])[:3] + "01")
    return list(dict.fromkeys(out))


def legacy_surnames(given, family):
    import unicodedata
    a = unicodedata.normalize("NFKD", family).encode("ascii", "ignore").decode().lower()
    return list(dict.fromkeys([a.replace(" ", ""), a.replace(" ", "-"), a.split()[-1], ascii_slug(given)]))


def exists(url):
    status, _ = http(url, retries=2)
    return status == 200


# ---------------------------------------------------------------- seasons
def modern_season(year, ros, manifest):
    base = f"{CDN}/{{t}}/{V}/{year}"
    teams_out, drivers_out = {}, {}
    used = {d["team"] for d in ros.values()}
    for cid in sorted(used):
        for slug in MODERN_SLUGS[year].get(cid, []):
            probe = f"{CDN}/c_fit,w_64/q_auto/{V}/{year}/{slug}/{year}{slug}logo.webp"
            if not exists(probe):
                continue
            entry = {}
            jobs = [("logo", "c_fit,w_320/q_auto", "logo", "logo", "team logo"),
                    ("logoWhite", "c_fit,w_320/q_auto", "logowhite", "logo-white", "team logo (white)"),
                    ("car", "c_fit,w_1400/q_auto", "carright", "car", f"{year} car"),
                    ("carFront", "c_fit,w_900/q_auto", "carfront", "car-front", f"{year} car (front)"),
                    ("carLeft", "c_fit,w_1400/q_auto", "carleft", "car-left", f"{year} car (left side)")]
            for key, t, name, suffix, kind in jobs:
                url = f"{CDN}/{t}/{V}/{year}/{slug}/{year}{slug}{name}.webp"
                rel = f"seasons/{year}/teams/{cid}-{suffix}.webp"
                if store(url, rel):
                    entry[key] = rel_of(rel)
                    record(rel, kind, cid, url, year)
            if "logo" in entry:
                teams_out[cid] = entry
                break
    for did, d in sorted(ros.items()):
        cid = d["team"]  # constructor of the driver's latest race this season: only that kit is used
        entry = {"team": cid, "front": None, "card": None, "number": None}
        hit = None
        for slug in MODERN_SLUGS[year].get(cid, []):
            for f1 in f1id_candidates(d["driver"]["givenName"], d["driver"]["familyName"]):
                for kind in ("right", "front"):
                    if exists(f"{CDN}/c_fit,w_64/q_auto/{V}/{year}/{slug}/{f1}/{year}{slug}{f1}{kind}.webp"):
                        hit = (slug, f1)
                        break
                if hit:
                    break
            if hit:
                break
        if not hit:
            print(f"  {year} {did}: no modern cut-out in {cid} kit")
            drivers_out[did] = entry
            continue
        slug, f1 = hit
        folder = f"{V}/{year}/{slug}/{f1}/{year}{slug}{f1}"
        front_rel = f"seasons/{year}/drivers/{did}-front.webp"
        if store(f"{CDN}/c_fit,w_760/q_82/{folder}front.webp", front_rel):
            record(front_rel, "driver portrait", did, f"{CDN}/c_fit,w_760/q_82/{folder}front.webp", year)
            full_length = Image.open(MEDIA / front_rel).size
            if full_length[1] / full_length[0] >= 1.4:  # full or 3/4 length; busts only feed the head crop
                entry["front"] = rel_of(front_rel)
            head_rel = f"seasons/{year}/drivers/{did}-head.webp"
            if head_from_cutout(front_rel, head_rel):
                entry["head"] = rel_of(head_rel)
                record(head_rel, "headshot crop", did, "derived from " + rel_of(front_rel), year)
        for key, t, name, suffix, kind in (("card", "c_fit,w_520/q_auto", "right", "card", "driver portrait (card)"),
                                           ("number", "c_fit,w_520/q_auto", "numberwhitefrless", "number", "driver number artwork")):
            url = f"{CDN}/{t}/{folder}{name}.webp"
            rel = f"seasons/{year}/drivers/{did}-{suffix}.webp"
            if store(url, rel):
                entry[key] = rel_of(rel)
                record(rel, kind, did, url, year)
        drivers_out[did] = entry
    manifest[str(year)] = {"drivers": drivers_out, "teams": teams_out}


def legacy_season(year, ros, manifest, car_hashes):
    teams_out, drivers_out = {}, {}
    slugs = {**LEGACY_SLUGS, **LEGACY_SLUGS_BY_YEAR.get(year, {})}
    for cid in sorted({d["team"] for d in ros.values()}):
        for slug in slugs.get(cid, []):
            src_logo = f"{CDN}/c_limit,w_320/f_webp/q_auto/content/dam/fom-website/teams/{year}/{slug}-logo.png"
            src_car = f"{CDN}/c_limit,w_1400/f_webp/q_auto/content/dam/fom-website/teams/{year}/{slug}.png"
            if not exists(src_logo):
                continue
            entry = {}
            rel = f"seasons/{year}/teams/{cid}-logo.webp"
            if store(src_logo, rel):
                entry["logo"] = rel_of(rel)
                record(rel, "team logo", cid, src_logo, year)
            # Stale-copy guard: identical bytes to an earlier season's car = wrong car.
            status, raw = http(f"{CDN}/content/dam/fom-website/teams/{year}/{slug}.png")
            digest = hashlib.md5(raw).hexdigest() if status == 200 else None
            if digest and digest in car_hashes and car_hashes[digest] != year:
                print(f"  {year} {cid}: car file identical to {car_hashes[digest]} - dropped")
            elif digest:
                car_hashes.setdefault(digest, year)
                rel = f"seasons/{year}/teams/{cid}-car.webp"
                if store(src_car, rel):
                    entry["car"] = rel_of(rel)
                    record(rel, f"{year} car", cid, src_car, year)
            teams_out[cid] = entry
            break
    for did, d in sorted(ros.items()):
        entry = {"team": d["team"], "front": None, "card": None, "number": None}
        for surname in legacy_surnames(d["driver"]["givenName"], d["driver"]["familyName"]):
            url = f"{CDN}/content/dam/fom-website/drivers/{year}Drivers/{surname}.jpg"
            if not exists(f"{CDN}/c_fit,w_64/q_auto/content/dam/fom-website/drivers/{year}Drivers/{surname}.jpg"):
                continue
            photo_rel = f"seasons/{year}/drivers/{did}-photo.webp"
            head_rel = f"seasons/{year}/drivers/{did}-head.webp"
            if legacy_photo(url, photo_rel, head_rel, f"{year}/{did}"):
                entry["photo"], entry["head"] = rel_of(photo_rel), rel_of(head_rel)
                record(photo_rel, "driver portrait (studio)", did, url, year)
                record(head_rel, "headshot crop", did, "derived from " + url, year)
            break
        if "head" not in entry:
            print(f"  {year} {did}: no official {year} portrait")
        drivers_out[did] = entry
    manifest[str(year)] = {"drivers": drivers_out, "teams": teams_out}


def seasons(media):
    out = {}
    car_hashes = {}
    for year in range(2019, 2026):  # chronological so the stale-car guard keeps the first season
        print("season", year)
        ros = roster(year)
        if year >= 2024:
            modern_season(year, ros, out)
        else:
            legacy_season(year, ros, out, car_hashes)
    media["seasons"] = {y: out[y] for y in sorted(out, reverse=True)}


# ---------------------------------------------------------------- 2026 galleries
TEAM_WORDS = {
    "mercedes": ["mercedes"], "ferrari": ["ferrari"], "mclaren": ["mclaren"],
    "red_bull": ["oracle red bull", "red bull racing"], "rb": ["racing bulls", "visa cash app"],
    "alpine": ["alpine"], "haas": ["haas"], "audi": ["audi"], "williams": ["williams"],
    "aston_martin": ["aston martin"], "cadillac": ["cadillac"],
}
TEAM_PAGES = {"alpine": "alpine", "aston_martin": "aston-martin", "audi": "audi", "cadillac": "cadillac", "ferrari": "ferrari",
              "haas": "haas", "mclaren": "mclaren", "mercedes": "mercedes", "rb": "racing-bulls", "red_bull": "red-bull-racing",
              "williams": "williams"}
RACE_PAGES = ["australia", "china", "japan", "bahrain", "saudi-arabia", "miami", "canada", "monaco", "barcelona-catalunya",
              "austria", "great-britain", "belgium", "hungary", "netherlands", "italy", "spain", "azerbaijan", "singapore"]
NAME_ALIASES = {"antonelli": ["kimi antonelli", "andrea kimi antonelli"], "arvid_lindblad": ["arvid lindblad"]}
PER_SUBJECT = 6


def driver_names(did, d):
    return NAME_ALIASES.get(did, [gal.norm(d["givenName"] + " " + d["familyName"])])


def team_mentions(text):
    return {cid for cid, words in TEAM_WORDS.items() if any(w in text for w in words)}


MONTHS = {m: i + 1 for i, m in enumerate(["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST",
                                          "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"])}
RACES_2026 = []


def event_round(rec, races):
    """Championship round a photo was taken at: 0 = pre-season testing, None = unknown."""
    import datetime
    folder = gal.norm(rec["public_id"].split("/")[-2])
    if "testing" in folder:
        return 0
    for text in rec.get("texts") or [rec.get("title", "")]:
        m = re.search(r"- ([A-Z]+) (\d{1,2}):", text)
        if m and m.group(1) in MONTHS:
            day = datetime.date(2026, MONTHS[m.group(1)], int(m.group(2)))
            for race in races:
                delta = (datetime.date.fromisoformat(race["date"]) - day).days
                if 0 <= delta <= 4:
                    return int(race["round"])
    name = gal.norm(gal.caption_for(rec).split(" 2026")[0])
    for race in races:
        if gal.norm(race["raceName"]) == name:
            return int(race["round"])
    return None


def caption_2026(rec):
    rnd = event_round(rec, RACES_2026)
    label = gal.caption_for(rec)
    if rnd:
        race = next(r for r in RACES_2026 if int(r["round"]) == rnd)
        session = label.split(" · ", 1)[1] if " · " in label else ""
        label = f"{race['raceName']} 2026" + (f" · {session}" if session else "")
    return label


def galleries(media):
    ros = roster(2026)
    multi = {did for did, d in ros.items() if len(d["teams"]) > 1}
    pages = []
    listing = gal.page("https://www.formula1.com/en/drivers")
    driver_slugs = sorted(set(re.findall(r"/en/drivers/([a-z-]+)", listing)) - {"hall-of-fame"})
    pages += [f"https://www.formula1.com/en/drivers/{s}" for s in driver_slugs]
    pages += [f"https://www.formula1.com/en/teams/{s}" for s in TEAM_PAGES.values()]
    pages += [f"https://www.formula1.com/en/racing/2026/{s}" for s in RACE_PAGES]
    pool = {}
    for url in pages:
        html = gal.page(url)
        for rec in gal.images(html, url):
            if not gal.is_photo(rec):
                continue
            have = pool.setdefault(rec["public_id"], {**rec, "texts": set(), "gallery_pages": set()})
            have["texts"].update(t for t in (rec["title"], rec["caption"]) if t)
            if rec["gallery"]:
                have["gallery_pages"].add(url)
            for p in rec["pages"]:
                if p not in have["pages"]:
                    have["pages"].append(p)
    print(f"  {len(pool)} candidate 2026 photos from {len(pages)} pages")

    races = season_results(2026)
    RACES_2026[:] = races
    # Only photos provably from a 2026 event: a recognised round/testing and a 2026-era Getty asset id
    # (folders such as "Lifestyle/ADHOC" also hold older photos, i.e. last year's cars).
    def plausible(rec):
        digits = re.findall(r"(\d{9,})", rec["public_id"].split("/")[-1])
        return event_round(rec, races) is not None and (not digits or int(digits[-1]) >= 2_255_000_000)
    dropped = [pid for pid, rec in pool.items() if not plausible(rec)]
    for pid in dropped:
        del pool[pid]
    print(f"  dropped {len(dropped)} photos without a verifiable 2026 event")
    team_at = {}  # (driverId, round) -> constructorId
    for race in races:
        for row in race["Results"]:
            team_at[(row["Driver"]["driverId"], int(race["round"]))] = row["Constructor"]["constructorId"]

    def team_in_photo(did, rec):
        """Constructor the driver raced for at the photo's event (None when the event is unknown)."""
        rnd = event_round(rec, races)
        if rnd is None:
            return None
        rounds = sorted(r for (d, r) in team_at if d == did)
        after = [r for r in rounds if r >= max(rnd, 1)]
        return team_at.get((did, after[0])) if after else None

    def score(rec, names, gallery_bonus):
        n = gal.norm(" | ".join(sorted(rec["texts"], key=len, reverse=True)))
        s = gallery_bonus if rec["gallery_pages"] else 0
        if "driving" in n:
            s += 3
        if any(0 <= n.find(name) < 60 for name in names):
            s += 2
        return (s, int(re.sub(r"\D", "", rec["public_id"].split("/")[-1]) or 0))

    def diverse(recs, key):
        """Best first, preferring one photo per event (folder) before repeating an event."""
        recs = sorted(recs, key=key, reverse=True)
        first, rest, seen = [], [], set()
        for rec in recs:
            folder = rec["public_id"].split("/")[-2]
            (rest if folder in seen else first).append(rec)
            seen.add(folder)
        return (first + rest)[:PER_SUBJECT]

    picks_d, picks_t = {}, {}
    for did, d in ros.items():
        names = driver_names(did, d["driver"])
        latest = d["team"]
        chosen = []
        for rec in pool.values():
            texts = [gal.norm(t) for t in rec["texts"]]
            if not any(name in t for t in texts for name in names):
                continue
            joined = " ".join(texts)
            mentioned = team_mentions(joined)
            if did in multi:
                # Kit rule: only photos from events where the driver raced for their latest team, and never
                # a caption that ties them to another team.
                if team_in_photo(did, rec) != latest:
                    continue
                if any(re.search(re.escape(name) + r"[^|]{0,60}?(" + "|".join(map(re.escape, TEAM_WORDS[c])) + ")", t)
                       for t in texts for name in names for c in mentioned - {latest}):
                    continue
            elif mentioned - {latest} and latest not in mentioned and not rec["gallery_pages"]:
                continue  # another team named, not theirs: the photo is about someone else
            chosen.append(rec)
        if chosen:
            picks_d[did] = diverse(chosen, lambda r: score(r, names, 4))
    for cid, words in TEAM_WORDS.items():
        team_page = f"https://www.formula1.com/en/teams/{TEAM_PAGES[cid]}"
        members = [did for did, d in ros.items() if d["team"] == cid and did not in multi]
        names = [n for did in members for n in driver_names(did, ros[did]["driver"])]
        chosen = []
        for rec in pool.values():
            joined = " ".join(gal.norm(t) for t in rec["texts"])
            mentioned = team_mentions(joined)
            if team_page in rec["gallery_pages"] or mentioned == {cid} or (not mentioned and any(n in joined for n in names)):
                chosen.append(rec)
        if chosen:
            picks_t[cid] = diverse(chosen, lambda r: score(r, names or words, 2))

    out = {"drivers": {}, "teams": {}}
    for bucket, picks in (("drivers", picks_d), ("teams", picks_t)):
        for subject, recs in sorted(picks.items()):
            items = []
            for rec in recs:
                item = download_gallery(rec, subject)
                if item:
                    items.append(item)
            if items:
                out[bucket][subject] = items
    media["galleries"] = out


_gallery_recorded = set()


def download_gallery(rec, subject):
    pid = rec["public_id"]
    stem = re.sub(r"[^a-z0-9]+", "-", pid.split("/2026/")[-1].lower()).strip("-")
    rel = f"gallery/2026-{stem}.webp"
    url = None
    if not ((MEDIA / rel).exists() and rel in done):
        steps = ((1400, 76), (1400, 70), (1400, 62), (1200, 62), (1000, 62))
        for w, q in steps:  # Cloudinary re-encodes from the original each time: never a double lossy pass
            url = f"{CDN}/{rec['transform']}/c_fill,w_{w}/q_{q}/v1740000001/{urllib.parse.quote(pid)}.webp"
            status, data = http(url)
            if status != 200:
                return None
            if len(data) <= 220_000 or (w, q) == steps[-1]:
                (MEDIA / rel).parent.mkdir(parents=True, exist_ok=True)
                (MEDIA / rel).write_bytes(data)
                done.add(rel)
                break
    else:
        url = next((s["source"] for s in OLD_SOURCES if s["file"] == rel_of(rel)), None) or \
            f"{CDN}/{rec['transform']}/c_fill,w_1400/q_76/v1740000001/{urllib.parse.quote(pid)}.webp"
    caption = caption_2026(rec)
    credit = "Getty Images / Formula 1" if any(gal.credit_for({**rec, "title": t}) != "Formula 1" for t in rec["texts"] | {""}) else "Formula 1"
    if rel not in _gallery_recorded:
        _gallery_recorded.add(rel)
        desc = max(rec["texts"], key=len) if rec["texts"] else ""
        record(rel, "trackside photograph", subject, url, 2026, page=rec["pages"][0],
               extra={"caption": caption, "credit": credit, "description": desc})
    return {"src": rel_of(rel), "caption": caption, "credit": credit}


def car_left_2026(media):
    for cid, team in media["teams"].items():
        slug = team.get("slug")
        if not slug:
            continue
        url = f"{CDN}/c_fit,w_1400/q_auto/{V}/2026/{slug}/2026{slug}carleft.webp"
        rel = f"teams/{slug}-car-left.webp"
        if store(url, rel):
            team["carLeft"] = rel_of(rel)
            record(rel, "2026 car (left side)", cid, url, 2026)
        else:
            team.pop("carLeft", None)


# ---------------------------------------------------------------- main
OLD_SOURCES = []


def owned(entry, stages):
    f = entry["file"]
    if "seasons" in stages and f.startswith("/media/seasons/"):
        return True
    if "galleries" in stages and (f.startswith("/media/gallery/") or f.endswith("-car-left.webp") and f.startswith("/media/teams/")):
        return True
    return False


def main():
    stages = set(sys.argv[1:]) or {"seasons", "galleries"}
    manifest_path = ROOT / "src" / "data" / "media.json"
    media = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources_path = MEDIA / "sources.json"
    OLD_SOURCES.extend(json.loads(sources_path.read_text(encoding="utf-8")))
    if "seasons" in stages:
        seasons(media)
    if "galleries" in stages:
        car_left_2026(media)
        galleries(media)
    keep = [s for s in OLD_SOURCES if not owned(s, stages)]
    merged = {s["file"]: s for s in keep}
    for s in sources:
        merged[s["file"]] = s
    sources_path.write_text(json.dumps(sorted(merged.values(), key=lambda s: s["file"]), indent=1, ensure_ascii=False), encoding="utf-8")
    manifest_path.write_text(json.dumps(media, indent=1, ensure_ascii=False), encoding="utf-8")
    DONE_FILE.write_text("\n".join(sorted(done)))
    print(f"{len(sources)} files recorded")


if __name__ == "__main__":
    main()
