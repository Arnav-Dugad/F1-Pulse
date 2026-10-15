"""Shared helpers for scripts/fetch-media-seasons.py (HTTP, Jolpica rosters, image processing).

The site owner states permission to use official Formula 1 marks and photographs.
"""

import io
import json
import os
import pathlib
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA = ROOT / "public" / "media"
CDN = "https://media.formula1.com/image/upload"
UA = "Mozilla/5.0 (F1Pulse media sync; contact site owner)"
CACHE = pathlib.Path(os.environ.get("F1PULSE_CACHE", pathlib.Path(tempfile.gettempdir()) / "f1pulse-media-cache"))
CACHE.mkdir(parents=True, exist_ok=True)


def http(url, method="GET", timeout=40, retries=4):
    """Return (status, bytes). 404 is returned, not raised; 429/5xx are retried with backoff."""
    delay = 2.0
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, (response.read() if method == "GET" else b"")
        except urllib.error.HTTPError as error:
            if error.code in (404, 400, 410):
                return error.code, b""
            if attempt == retries:
                return error.code, b""
            wait = float(error.headers.get("Retry-After") or delay)
            print(f"  HTTP {error.code} {url} - retry in {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
            delay *= 2
        except Exception as error:  # noqa: BLE001 - network hiccup
            if attempt == retries:
                print(f"  FAILED {url}: {error}", file=sys.stderr)
                return 0, b""
            time.sleep(delay)
            delay *= 2
    return 0, b""


_last_jolpica = [0.0]


def jolpica(path):
    """Cached, rate-limited Jolpica GET (>= 800 ms between live requests)."""
    key = CACHE / ("jolpica_" + path.replace("/", "_").replace("?", "_").replace("&", "_").replace("=", "-"))
    if key.exists():
        return json.loads(key.read_text(encoding="utf-8"))
    wait = 0.8 - (time.time() - _last_jolpica[0])
    if wait > 0:
        time.sleep(wait)
    status, body = http("https://api.jolpi.ca/ergast/f1/" + path, retries=6)
    _last_jolpica[0] = time.time()
    if status != 200:
        raise RuntimeError(f"Jolpica {path} -> {status}")
    key.write_bytes(body)
    return json.loads(body)


def season_results(year):
    races = []
    offset = 0
    while True:
        data = jolpica(f"{year}/results.json?limit=100&offset={offset}")["MRData"]
        races += data["RaceTable"]["Races"]
        offset += 100
        if offset >= int(data["total"]):
            break
    merged = {}
    for race in races:  # pages split races; merge by round
        merged.setdefault(int(race["round"]), {**race, "Results": []})["Results"] += race["Results"]
    return [merged[r] for r in sorted(merged)]


NON_START = {"Did not start", "Withdrew", "Did not qualify", "Did not prequalify", "Excluded"}


def roster(year):
    """driverId -> {driver, team (latest race), teams (all, in order), started (bool), last_round}."""
    out = {}
    for race in season_results(year):
        rnd = int(race["round"])
        for row in race["Results"]:
            d = row["Driver"]
            cid = row["Constructor"]["constructorId"]
            entry = out.setdefault(d["driverId"], {"driver": d, "teams": [], "started": False, "team": cid, "last_round": 0})
            if cid not in entry["teams"]:
                entry["teams"].append(cid)
            if rnd >= entry["last_round"]:
                entry["team"], entry["last_round"] = cid, rnd
            if row.get("status") not in NON_START:
                entry["started"] = True
    return out


def ascii_slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(ch for ch in text.lower() if ch.isalnum())


def save_webp(img, path, quality, lossless_alpha=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)
    return path.stat().st_size


def open_image(data):
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    img.load()
    return img
