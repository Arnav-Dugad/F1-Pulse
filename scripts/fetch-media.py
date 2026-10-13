"""Download official 2026 Formula 1 media used by F1 Pulse.

The site owner states permission to use these marks and photographs.
Every file is recorded with its source URL in public/media/sources.json.
Run: python scripts/fetch-media.py
"""

import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "media"
CDN = "https://media.formula1.com/image/upload"
V = "v1740000001/common/f1/2026"

TEAMS = {
    # jolpica id: (f1 slug, colour, accessible colour, [(f1 driver id, jolpica id)])
    "mercedes": ("mercedes", "#27F4D2", "#067E6A", [("georus01", "russell"), ("andant01", "antonelli")]),
    "ferrari": ("ferrari", "#E8002D", "#5C0012", [("chalec01", "leclerc"), ("lewham01", "hamilton")]),
    "mclaren": ("mclaren", "#FF8000", "#804000", [("lannor01", "norris"), ("oscpia01", "piastri")]),
    "red_bull": ("redbullracing", "#3671C6", "#142948", [("maxver01", "max_verstappen"), ("isahad01", "hadjar")]),
    "rb": ("racingbulls", "#6692FF", "#0038C2", [("lialaw01", "lawson"), ("arvlin01", "arvid_lindblad"), ("yuktsu01", "tsunoda")]),
    "alpine": ("alpine", "#00A1E8", "#004E70", [("piegas01", "gasly"), ("fracol01", "colapinto")]),
    "haas": ("haasf1team", "#DEE1E2", "#667175", [("estoco01", "ocon"), ("olibea01", "bearman")]),
    "audi": ("audi", "#FF2D00", "#751500", [("nichul01", "hulkenberg"), ("gabbor01", "bortoleto")]),
    "williams": ("williams", "#1868DB", "#082145", [("carsai01", "sainz"), ("alealb01", "albon")]),
    "aston_martin": ("astonmartin", "#229971", "#0F4331", [("feralo01", "alonso"), ("lanstr01", "stroll")]),
    "cadillac": ("cadillac", "#AAAAAD", "#58585B", [("serper01", "perez"), ("valbot01", "bottas")]),
}

# jolpica circuit id -> (F1 track asset name, Racehub header image name)
CIRCUITS = {
    "albert_park": ("melbourne", "Australia"),
    "shanghai": ("shanghai", "China"),
    "suzuka": ("suzuka", "Japan"),
    "miami": ("miami", "Miami"),
    "villeneuve": ("montreal", "Canada"),
    "monaco": ("montecarlo", "Monaco"),
    "catalunya": ("catalunya", "Spain"),
    "red_bull_ring": ("spielberg", "Austria"),
    "silverstone": ("silverstone", "Great Britain"),
    "spa": ("spafrancorchamps", "Belgium"),
    "hungaroring": ("hungaroring", "Hungary"),
    "zandvoort": ("zandvoort", "Netherlands"),
    "monza": ("monza", "Italy"),
    "madring": ("madring", None),
    "baku": ("baku", "Azerbaijan"),
    "sepang": ("kualalumpur", "Malaysia"),
    "marina_bay": ("singapore", "Singapore"),
    "americas": ("austin", "USA"),
    "rodriguez": ("mexicocity", "Mexico"),
    "interlagos": ("interlagos", "Brazil"),
    "vegas": ("lasvegas", "Las Vegas"),
    "losail": ("lusail", "Qatar"),
    "yas_marina": ("yasmarinacircuit", "Abu Dhabi"),
    "bahrain": ("sakhir", "Bahrain"),
    "jeddah": ("jeddah", "Saudi Arabia"),
    "imola": ("imola", "Emilia Romagna"),
}

sources = []


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 F1Pulse media sync"})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def save(url, rel, kind, subject):
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = fetch(url)
    except Exception as error:  # noqa: BLE001 - report and continue
        print("MISSING", rel, error, file=sys.stderr)
        return None
    target.write_bytes(data)
    sources.append({
        "file": "/media/" + rel,
        "kind": kind,
        "subject": subject,
        "source": url,
        "sourcePage": "https://www.formula1.com/",
        "permission": "Site owner states permission granted",
        "bytes": len(data),
        "season": 2026,
    })
    return "/media/" + rel


def track_paths(svg):
    """Return the drawable outline paths from an F1 track SVG."""
    view = re.search(r'viewBox="([^"]+)"', svg)
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    return {"viewBox": view.group(1) if view else "0 0 100 100", "paths": paths}


def main():
    jobs = []
    manifest = {"teams": {}, "drivers": {}, "circuits": {}}
    for team_id, (slug, colour, accessible, roster) in TEAMS.items():
        base = f"{CDN}/{{}}/q_auto/{V}/{slug}"
        manifest["teams"][team_id] = {
            "slug": slug,
            "colour": colour,
            "accessible": accessible,
            "logo": f"/media/teams/{slug}-logo.webp",
            "logoWhite": f"/media/teams/{slug}-logo-white.webp",
            "car": f"/media/teams/{slug}-car.webp",
            "carFront": f"/media/teams/{slug}-car-front.webp",
            "drivers": [d for _, d in roster],
        }
        jobs += [
            (base.format("c_fit,w_320") + f"/2026{slug}logo.webp", f"teams/{slug}-logo.webp", "team logo", team_id),
            (base.format("c_fit,w_320") + f"/2026{slug}logowhite.webp", f"teams/{slug}-logo-white.webp", "team logo (white)", team_id),
            (base.format("c_fit,w_1600") + f"/2026{slug}carright.webp", f"teams/{slug}-car.webp", "2026 car", team_id),
            (base.format("c_fit,w_900") + f"/2026{slug}carfront.webp", f"teams/{slug}-car-front.webp", "2026 car (front)", team_id),
        ]
        for f1_id, driver_id in roster:
            manifest["drivers"][driver_id] = {
                "team": team_id,
                "front": f"/media/drivers/{f1_id}-front.webp",
                "card": f"/media/drivers/{f1_id}-card.webp",
                "number": f"/media/drivers/{f1_id}-number.webp",
            }
            jobs += [
                (base.format("c_fit,w_760") + f"/{f1_id}/2026{slug}{f1_id}front.webp", f"drivers/{f1_id}-front.webp", "driver portrait", driver_id),
                (base.format("c_fit,w_520") + f"/{f1_id}/2026{slug}{f1_id}right.webp", f"drivers/{f1_id}-card.webp", "driver portrait (card)", driver_id),
                (base.format("c_fit,w_520") + f"/{f1_id}/2026{slug}{f1_id}numberwhitefrless.webp", f"drivers/{f1_id}-number.webp", "driver number artwork", driver_id),
            ]
    for circuit_id, (track, hero) in CIRCUITS.items():
        entry = {}
        jobs.append((f"{CDN}/c_fit,w_1400/q_auto/{V}/track/2026track{track}detailed.webp", f"circuits/{circuit_id}-map.webp", "detailed circuit map", circuit_id))
        entry["map"] = f"/media/circuits/{circuit_id}-map.webp"
        if hero:
            name = urllib.parse.quote(hero)
            jobs.append((f"{CDN}/c_fill,w_1800/q_auto/v1740000001/content/dam/fom-website/2018-redesign-assets/Racehub%20header%20images%2016x9/{name}.webp", f"circuits/{circuit_id}-hero.webp", "race hub photograph", circuit_id))
            entry["hero"] = f"/media/circuits/{circuit_id}-hero.webp"
        manifest["circuits"][circuit_id] = entry
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda job: save(*job), jobs))
    missing = {job[1] for job, result in zip(jobs, results) if result is None}
    for driver in manifest["drivers"].values():
        for key in ("front", "card", "number"):
            if driver[key].removeprefix("/media/") in missing:
                driver[key] = None
    for circuit_id, entry in manifest["circuits"].items():
        for key in list(entry):
            if entry[key].removeprefix("/media/") in missing:
                del entry[key]
    # Inline-able track outlines (drawn and animated in the browser).
    outlines = {}
    for circuit_id, (track, _) in CIRCUITS.items():
        url = f"{CDN}/{V}/track/2026track{track}whiteoutline.svg"
        try:
            svg = fetch(url).decode("utf-8")
        except Exception as error:  # noqa: BLE001
            print("MISSING outline", circuit_id, error, file=sys.stderr)
            continue
        outlines[circuit_id] = track_paths(svg)
        sources.append({"file": f"/data/tracks.json#{circuit_id}", "kind": "circuit outline", "subject": circuit_id, "source": url, "sourcePage": "https://www.formula1.com/en/racing/2026", "permission": "Site owner states permission granted", "bytes": len(svg), "season": 2026})
    # A Madrid race photograph from the official race page.
    madrid = save(f"{CDN}/t_16by9Centre/c_fill,w_1800/q_auto/v1740000001/trackside-images/2026/F1_Grand_Prix_of_Spain/2295070886.webp", "circuits/madring-hero.webp", "race photograph", "madring")
    if madrid:
        manifest["circuits"]["madring"]["hero"] = madrid
    # Brand marks
    save(f"{CDN}/v1677237319/etc/designs/fom-website/images/f1_logo.svg", "brand/f1-logo.svg", "Formula 1 logo", "formula1")
    save(f"{CDN}/v1698682266/nwp-navigation/f1-tv-logo.svg", "brand/f1-tv.svg", "F1 TV logo", "f1tv")
    data = ROOT / "src" / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "media.json").write_text(json.dumps(manifest, indent=1))
    # Two decimals is ample precision for a 121x85 viewBox; served lazily from /data.
    rounded = {k: {**v, "paths": [re.sub(r"(\d+\.\d{2})\d+", r"\1", p) for p in v["paths"]]} for k, v in outlines.items()}
    (ROOT / "public" / "data" / "tracks.json").write_text(json.dumps(rounded, separators=(",", ":")))
    (OUT / "sources.json").write_text(json.dumps(sorted(sources, key=lambda s: s["file"]), indent=1))
    print(f"{len(sources)} files, {len(missing)} missing: {sorted(missing)}")


if __name__ == "__main__":
    main()
