"""2026 trackside gallery harvesting for scripts/fetch-media-seasons.py.

Reads the official formula1.com driver, team and race pages, extracts the image records embedded
in their React Server Component payload (path, Getty caption, crop transformation) and assigns
each photo to the drivers/teams its caption names. Photos whose caption cannot be tied to the
subject are dropped (a wrong person or wrong kit is worse than no photo).
"""

import json
import re
import time
import unicodedata

from media_seasons_lib import CACHE, http

PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
IMAGE = re.compile(r'\{"title":"((?:[^"\\]|\\.)*)","path":"(/(?:trackside-images|fom-website)/2026/[^"]+)"([^{}]*)\}')
FIELD = lambda name: re.compile(r'"' + name + r'":"((?:[^"\\]|\\.)*)"')

_last = [0.0]


def page(url):
    """Cached, polite (>= 1 s apart) formula1.com page fetch."""
    key = CACHE / ("page_" + re.sub(r"[^a-z0-9]+", "_", url.lower()) + ".html")
    if key.exists():
        return key.read_text(encoding="utf-8")
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    status, body = http(url, retries=3)
    _last[0] = time.time()
    if status != 200:
        print("  page", status, url)
        return ""
    text = body.decode("utf-8", "replace")
    key.write_text(text, encoding="utf-8")
    return text


def payload(html):
    out = []
    for chunk in PUSH.findall(html):
        try:
            out.append(json.loads(chunk))
        except ValueError:
            continue
    return "".join(out)


def images(html, page_url):
    """Image records on a page: {public_id, path, title, caption, transform, gallery}."""
    text = payload(html)
    found = {}
    for m in IMAGE.finditer(text):
        title, path, rest = m.group(1), m.group(2), m.group(3)
        caption = FIELD("caption").search(rest)
        transform = FIELD("raw_transformation").search(rest)
        public_id = FIELD("public_id").search(rest)
        if not public_id:
            continue
        pid = public_id.group(1)
        # Gallery atoms ("image_gallery_atom") carry the subject's name as caption.
        window = text[max(0, m.start() - 4000): m.start()]
        gallery = '"images":[' in window and window.rfind('"images":[') > window.rfind('"article":{')
        rec = found.setdefault(pid, {
            "public_id": pid,
            "path": path,
            "title": json.loads('"' + title + '"'),
            "caption": json.loads('"' + caption.group(1) + '"') if caption else "",
            "transform": (transform.group(1).split("/")[0] if transform and transform.group(1).startswith("t_") else "t_16by9Centre"),
            "gallery": gallery,
            "pages": [],
        })
        rec["gallery"] = rec["gallery"] or gallery
        if page_url not in rec["pages"]:
            rec["pages"].append(page_url)
    return list(found.values())


def norm(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def is_photo(rec):
    """Only real photographs: the trackside feed or Getty files (no article graphics/logos)."""
    path = rec["path"]
    if path.lower().endswith((".svg", ".gif")):
        return False
    return path.startswith("/trackside-images/2026/") or "/GettyImages-" in path


GP_NAMES = {
    "australia": "Australian Grand Prix", "china": "Chinese Grand Prix", "japan": "Japanese Grand Prix",
    "bahrain": "Bahrain Grand Prix", "saudi arabia": "Saudi Arabian Grand Prix", "miami": "Miami Grand Prix",
    "canada": "Canadian Grand Prix", "monaco": "Monaco Grand Prix", "spain": "Spanish Grand Prix",
    "barcelona": "Barcelona-Catalunya Grand Prix", "barcelona catalunya": "Barcelona-Catalunya Grand Prix",
    "austria": "Austrian Grand Prix", "great britain": "British Grand Prix", "britain": "British Grand Prix",
    "belgium": "Belgian Grand Prix", "hungary": "Hungarian Grand Prix", "netherlands": "Dutch Grand Prix",
    "the netherlands": "Dutch Grand Prix", "italy": "Italian Grand Prix", "azerbaijan": "Azerbaijan Grand Prix",
    "singapore": "Singapore Grand Prix", "united states": "United States Grand Prix", "usa": "United States Grand Prix",
    "mexico": "Mexico City Grand Prix", "brazil": "São Paulo Grand Prix", "sao paulo": "São Paulo Grand Prix",
    "las vegas": "Las Vegas Grand Prix", "qatar": "Qatar Grand Prix", "abu dhabi": "Abu Dhabi Grand Prix",
    "madrid": "Spanish Grand Prix", "emilia romagna": "Emilia-Romagna Grand Prix",
}
SESSIONS = {"practice": "Practice", "qualifying": "Qualifying", "sprint qualifying": "Sprint Qualifying",
            "sprint": "Sprint", "previews": "Previews", "practice sprint qualifying": "Practice & Sprint Qualifying",
            "practice qualifying": "Practice & Qualifying", "sprint and qualifying": "Sprint & Qualifying"}


def caption_for(rec):
    parts = rec["path"].strip("/").split("/")
    folder = parts[2] if len(parts) > 3 else ""
    if parts[0] == "trackside-images":
        bits = folder.split("___")
        event = bits[0].replace("_", " ").strip()
        session = norm(bits[1].replace("__", " ")) if len(bits) > 1 else ""
        m = re.match(r"(?i)(?:F1|Formula 1) Grand Prix of (.+)", event)
        if m:
            name = GP_NAMES.get(norm(m.group(1)), f"Grand Prix of {m.group(1).title()}")
        elif re.match(r"(?i)Formula 1 Testing in (.+)", event):
            where = re.match(r"(?i)Formula 1 Testing in (.+)", event).group(1)
            name = f"Pre-season testing, {where}"
        else:
            name = event
        label = f"{name} 2026"
        if session:
            label += " · " + SESSIONS.get(session, session.title().replace(" ", " "))
        return label
    name = GP_NAMES.get(norm(folder))
    return f"{name} 2026" if name else "2026 season"


def credit_for(rec):
    getty = "/GettyImages-" in rec["path"] or re.match(r"^[A-Z .'-]+, [A-Z .'-]+ - [A-Z]+ \d+:", rec["title"] or "")
    return "Getty Images / Formula 1" if getty else "Formula 1"
