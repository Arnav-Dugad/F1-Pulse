"""Polite Wikimedia (Wikipedia / Commons) client for scripts/fetch-wikimedia.py.

* Descriptive User-Agent (Wikimedia policy), one request at a time.
* API requests >= 1 s apart; image downloads <= 2 per second.
* 429 / 503 back off exponentially (honouring Retry-After).
* Every API response and every downloaded file is cached on disk, so an interrupted run resumes
  without repeating a request. Cache: $F1PULSE_WIKI_CACHE (default <tmp>/f1pulse-wikimedia-cache).
"""

import hashlib
import html
import json
import os
import pathlib
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "F1Pulse/3.2 (https://f1-pulse.arnavrival12.workers.dev; arnavrival12@gmail.com)"
ENWIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
WIKIDATA = "https://www.wikidata.org/w/api.php"
CACHE = pathlib.Path(os.environ.get("F1PULSE_WIKI_CACHE", pathlib.Path(tempfile.gettempdir()) / "f1pulse-wikimedia-cache"))
(CACHE / "api").mkdir(parents=True, exist_ok=True)
(CACHE / "files").mkdir(parents=True, exist_ok=True)

_last = {"api": 0.0, "file": 0.0}
GAP = {"api": 1.0, "file": 0.5}
stats = {"api": 0, "file": 0, "api_cached": 0, "file_cached": 0}


def _get(url, kind, timeout=60, retries=6):
    delay = 5.0
    for attempt in range(retries + 1):
        wait = GAP[kind] - (time.time() - _last[kind])
        if wait > 0:
            time.sleep(wait)
        _last[kind] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Api-User-Agent": UA, "Accept-Encoding": "identity"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                stats[kind] += 1
                return res.status, res.read()
        except urllib.error.HTTPError as err:
            if err.code in (400, 403, 404, 410) or attempt == retries:
                return err.code, b""
            pause = float(err.headers.get("Retry-After") or delay)
            print(f"  HTTP {err.code} {url[:120]} - waiting {pause:.0f}s", file=sys.stderr)
            time.sleep(pause)
            delay = min(delay * 2, 300)
        except Exception as err:  # noqa: BLE001 - network hiccup
            if attempt == retries:
                print(f"  FAILED {url[:120]}: {err}", file=sys.stderr)
                return 0, b""
            time.sleep(delay)
            delay = min(delay * 2, 300)
    return 0, b""


def api(endpoint, params, max_pages=40):
    """Cached MediaWiki API GET (format=json, formatversion=2). Follows `continue` and merges pages."""
    base = {"action": "query", "format": "json", "formatversion": "2", "maxlag": "5"}
    params = {**base, **params}
    merged = None
    cont = {}
    for _ in range(max_pages):
        query = urllib.parse.urlencode({**params, **cont})
        url = f"{endpoint}?{query}"
        key = CACHE / "api" / (hashlib.sha1(url.encode()).hexdigest() + ".json")
        if key.exists():
            data = json.loads(key.read_text("utf-8"))
            stats["api_cached"] += 1
        else:
            for tries in range(6):
                status, body = _get(url, "api")
                if status != 200:
                    raise RuntimeError(f"API {status}: {url[:160]}")
                data = json.loads(body)
                if data.get("error", {}).get("code") == "maxlag":
                    time.sleep(5 * (tries + 1))
                    continue
                break
            if "error" in data:
                raise RuntimeError(f"API error {data['error']}: {url[:160]}")
            key.write_text(json.dumps(data), "utf-8")
        merged = _merge(merged, data)
        if "continue" not in data:
            break
        cont = data["continue"]
    return merged or {}


def _merge(a, b):
    if a is None:
        return b
    qa, qb = a.setdefault("query", {}), b.get("query", {})
    for k in ("normalized", "redirects"):
        if k in qb:
            qa.setdefault(k, []).extend(qb[k])
    pages = {p.get("title"): p for p in qa.get("pages", [])}
    for p in qb.get("pages", []):
        have = pages.get(p.get("title"))
        if not have:
            pages[p.get("title")] = p
            continue
        for k, v in p.items():
            if isinstance(v, list) and isinstance(have.get(k), list):
                have[k] = have[k] + v
            elif k not in have:
                have[k] = v
    qa["pages"] = list(pages.values())
    return a


def download(url):
    """Cached image download (bytes or None)."""
    key = CACHE / "files" / hashlib.sha1(url.split("?")[0].encode()).hexdigest()
    if key.exists():
        stats["file_cached"] += 1
        return key.read_bytes()
    status, body = _get(url, "file", timeout=90)
    if status != 200 or not body:
        return None
    key.write_bytes(body)
    return body


def chunks(seq, n=50):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def title_from_url(url):
    """'http://en.wikipedia.org/wiki/Nino_Farina' -> 'Nino Farina' (None for non-English wikis)."""
    if not url:
        return None
    m = re.match(r"https?://en\.(?:m\.)?wikipedia\.org/wiki/(.+)$", url.strip())
    if not m:
        return None
    return urllib.parse.unquote(m.group(1).split("#")[0]).replace("_", " ")


TAG = re.compile(r"<[^>]+>")


def strip_html(value):
    if not value:
        return ""
    text = TAG.sub("", str(value))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


FREE = re.compile(
    r"^(cc0|cc[- ]?zero|public domain|pd\b|pd[- ]|cc[- ]by(?:[- ]sa)?(?:[- ]\d(?:\.\d)?)?|cc[- ]by[- ]sa|"
    r"gfdl|gnu free documentation|attribution|copyrighted free use|free art licen[cs]e|fal\b|no restrictions|"
    r"mit|bsd|ogl|open government licen[cs]e)",
    re.I,
)
NONFREE = re.compile(r"(non[- ]?free|fair use|all rights reserved|\bnc\b|non[- ]?commercial|\bnd\b|no[- ]?deriv)", re.I)


def license_ok(meta):
    """True for free licences (CC0, PD, CC BY, CC BY-SA, GFDL and equivalents)."""
    name = strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
    if str((meta.get("NonFree") or {}).get("value", "")).lower() in ("true", "1", "yes"):
        return False
    if not name or NONFREE.search(name):
        return False
    return bool(FREE.match(name))


def meta_value(meta, key):
    return strip_html((meta.get(key) or {}).get("value", ""))


YEAR = re.compile(r"(?<!\d)(19[0-9]{2}|20[0-2][0-9])(?!\d)")


def photo_year(meta, title, min_year=1900):
    """Year the photo was taken: a year in the file name, else DateTimeOriginal (descriptions name the
    subject's year — a museum car's season — not the photo's).
    Years before `min_year` (e.g. before the driver could have raced) are skipped. None if unknown."""
    for text in (title or "", meta_value(meta, "DateTimeOriginal")):
        for m in YEAR.finditer(text):
            if min_year <= int(m.group(1)) <= 2026:
                return m.group(1)
    return None
