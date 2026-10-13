"""Fetch a dated, real launch fallback. This is never presented as live data."""
import urllib.request,json,time,pathlib
paths=['current.json','current/driverStandings.json','current/constructorStandings.json','current/last/results.json','current/drivers.json','current/constructors.json']
responses={}
for path in paths:
 with urllib.request.urlopen('https://api.jolpi.ca/ergast/f1/'+path+'?limit=100',timeout=35) as response:
  responses[path]=json.load(response)
 print(path,'verified',flush=True)
 time.sleep(.4)
from datetime import datetime,timezone
pathlib.Path('public/data/launch-snapshot.json').write_text(json.dumps({'fetchedAt':datetime.now(timezone.utc).isoformat(),'responses':responses},separators=(',',':')))
