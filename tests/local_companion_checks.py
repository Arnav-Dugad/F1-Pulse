import importlib.util
import json
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
spec = importlib.util.spec_from_file_location('companion', Path(__file__).parents[1] / 'downloads/f1-pulse-local.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert m.local_models({'models':[{'name':'test-local'},{'name':'test-cloud'},{'name':'remote','remote_host':'x'}]}) == ['test-local']
payload=m.validate_chat({'model':'test-local','question':'Explain 🏎','context':{'season':2026}},['test-local'])
assert payload['stream'] is False and payload['messages'][0]['role'] == 'system'
for data in [{'model':'unknown','question':'x'}, {'model':'test-local','question':''}, {'model':'test-local','question':'x','context':'x'*30001}]:
    try: m.validate_chat(data,['test-local'])
    except ValueError: pass
    else: raise AssertionError('Invalid payload accepted')
try: m.ollama('/arbitrary')
except ValueError: pass
else: raise AssertionError('Arbitrary endpoint accepted')
# Exercise the HTTP boundary with a fake local model. No Ollama install or cloud calls.
server=ThreadingHTTPServer(('127.0.0.1',0),m.Handler)
m.PORT=server.server_port; m.ORIGIN=f'http://127.0.0.1:{m.PORT}'
m.ollama=lambda path,payload=None: {'models':[{'name':'test-local'}]} if path=='/api/tags' else {'message':{'content':'Fixture answer'}}
thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
def request(path,headers=None,data=None):
    req=urllib.request.Request(m.ORIGIN+path,headers=headers or {},data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req) as r: return r.status,r.read(),r.headers
    except urllib.error.HTTPError as e: return e.code,e.read(),e.headers
try:
    status,body,headers=request('/')
    assert status==200 and m.TOKEN.encode() in body and headers['X-Frame-Options']=='DENY'
    assert request('/',{'Host':'attacker.example'})[0]==403
    assert request('/api/models')[0]==403
    assert request('/api/models',{'X-F1-Pulse-Token':m.TOKEN,'Origin':'https://attacker.example'})[0]==403
    auth={'X-F1-Pulse-Token':m.TOKEN,'Origin':m.ORIGIN,'Content-Type':'application/json'}
    assert request('/api/models',auth)[0]==200
    status,body,_=request('/api/chat',auth,{'model':'test-local','question':'Explain','context':{'season':2026}})
    assert status==200 and json.loads(body)['answer']=='Fixture answer'
    assert request('/api/chat',auth,{'model':'test-cloud','question':'x'})[0]==400
finally:
    server.shutdown(); server.server_close(); thread.join()
print('Local companion checks passed')
