from pathlib import Path
from playwright.sync_api import sync_playwright
import re,json,base64
from urllib.request import Request,urlopen
from urllib.error import HTTPError
R=Path(__file__).resolve().parents[2]/'dist/h5'
def install(page, base="http://127.0.0.1:3109", faults=None, storage=True):
 faults=faults if faults is not None else {}
 def api(req):
  u=req['url']; path=u.split('/api/v1',1)[1]
  if path.split('?')[0] in faults:return {'status':faults[path.split('?')[0]],'body':json.dumps({'error':{'code':'TEST_INJECTED_FAILURE','message':'测试注入：服务暂不可用'}}),'headers':{'content-type':'application/json'}}
  try:r=urlopen(Request(base+'/api/v1'+path,data=req.get('body','').encode() if req.get('body') else None,headers=req.get('headers') or {},method=req.get('method','GET')),timeout=12)
  except HTTPError as e:r=e
  return {'status':r.status,'body':r.read().decode(),'headers':dict(r.headers)}
 page.expose_function('__localApi',api)
 mods={}
 for p in R.rglob('*.mjs'):
  txt=p.read_text()
  def repl(m):
   rel=m.group(2)
   if not rel.startswith('.'):return m.group(0)
   resolved=(p.parent/rel).resolve().relative_to(R.resolve()).as_posix()
   return m.group(1)+"'nc:"+resolved+"'"
  txt=re.sub(r"((?:from\s*|import\s*))['\"]([^'\"]+)['\"]",repl,txt)
  mods['nc:'+p.relative_to(R).as_posix()]='data:text/javascript;base64,'+base64.b64encode(txt.encode()).decode()
 css=(R/'tokens.css').read_text()+(R/'src/styles.css').read_text()
 storage_js="""const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>Array.from(store.keys())[i],get length(){return store.size;}}});""" if storage else ''
 html='<html><head><meta charset="utf-8"><title>Offline UI regression</title><style>'+css+'</style><script type="importmap">'+json.dumps({'imports':mods})+'</script></head><body><div id="root"></div><script>'+storage_js+'window.fetch=async function(url,options={}) {const r=await window.__localApi({url:String(url),method:options.method||"GET",body:options.body,headers:options.headers}); if(options.signal&&options.signal.aborted) throw new DOMException("Aborted","AbortError");return new Response(r.body,{status:r.status,headers:r.headers});};</script><script type="module">import "nc:src/main.mjs";</script></body></html>'
 page.set_content(html,wait_until='load')
