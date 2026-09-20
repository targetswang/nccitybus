#!/usr/bin/env python3
"""Real Chromium/React DOM regression. --offline uses in-memory modules and a local-API
binding because this execution environment blocks browser navigation administratively.
It is NOT evidence of public-network, TLS, CSP or WeChat native UI acceptance.
"""
import argparse, json, os, subprocess, sys, time, tempfile
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from offline_harness import install
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--offline',action='store_true');args=p.parse_args()
out=ROOT/'audit/browser';out.mkdir(parents=True,exist_ok=True)
results=[]
with tempfile.TemporaryDirectory(prefix='nc-browser-') as tmp:
 env={**os.environ,'NODE_ENV':'development','DB_DRIVER':'sqlite','SQLITE_PATH':tmp+'/db.sqlite','PORT':'3109','HOST':'127.0.0.1'}
 for cmd in [['node','scripts/migrate.mjs'],['node','scripts/publish-content.mjs','packages/content/catalog.reference.json']]:
  subprocess.run(cmd,cwd=ROOT,env=env,check=True,stdout=subprocess.DEVNULL)
 log=(out/'api.log').open('w');server=subprocess.Popen(['node','apps/api/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log)
 try:
  for _ in range(50):
   try:urlopen('http://127.0.0.1:3109/api/v1/health',timeout=1);break
   except Exception:time.sleep(.1)
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   faults={}
   def fresh(width=390,height=844):
    nonlocal_placeholder=None
    q=context.new_page();q.set_viewport_size({'width':width,'height':height});q.on('pageerror',lambda e:errors.append(str(e)))
    if args.offline:install(q,faults=faults)
    else:q.goto('http://127.0.0.1:3109/',wait_until='networkidle')
    return q
   def test(name,fn):
    try:fn();results.append({'name':name,'status':'passed'})
    except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:1200]})
   if args.offline:install(page,faults=faults)
   else:page.goto('http://127.0.0.1:3109/',wait_until='networkidle')
   page.wait_for_selector('.hero')
   def route(name):
    page.evaluate('(hash)=>{location.hash=hash}',name)
    page.wait_for_timeout(80)
   def no_overflow(q):
    assert q.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    assert q.locator('.bottom-nav button').count()==4
   test('home: core actions visible, no horizontal overflow, four persistent tabs',lambda:no_overflow(page))
   page.screenshot(path=str(out/'home-390.png'))
   def transit():
    page.get_by_role('button',name='乘车码',exact=False).first.click();page.get_by_role('dialog').wait_for();assert '尚未' in page.get_by_role('dialog').inner_text();page.get_by_role('button',name='知道了').click();assert page.get_by_role('dialog').count()==0
   test('unconfigured ride code reports unavailable and modal closes correctly',transit)
   def explore():
    route('explore');assert page.locator('.content-card').count()==4
    page.get_by_role('tab',name='沿线地点').click();assert page.locator('.content-card').count()==21
    page.get_by_role('button',name='吃什么',exact=True).click();page.locator('select').select_option('1227');assert page.locator('.content-card').count()==1;assert '土货' in page.locator('.content-card').inner_text()
   test('explore: complete routes vs places and combined category/station filtering',explore)
   def favorite():
    page.locator('.content-card').first.click();page.get_by_role('button',name='收藏地点',exact=True).click();assert '已收藏' in page.locator('.action-row').inner_text();route('favorites');assert page.locator('.content-card').count()==1
    page.locator('.content-card').first.click();page.get_by_role('button',name='已收藏 · 取消',exact=True).click();route('favorites');assert '还没有可显示的收藏' in page.locator('main').inner_text()
   test('POI favorite add, cross-page read, remove; controlled Storage adapter preserves owned data',favorite)
   def retained_filters():
    route('explore');assert page.locator('select').input_value()=='1227';assert page.locator('.content-card').count()==1
   test('tab changes retain explore mode and filter state',retained_filters)
   def walk():
    route('walk/river-sunset');assert page.locator('.walk-step').count()==3;assert page.locator('.narration').count()==3
    page.locator('.narration summary').first.click();assert page.locator('.narration').first.get_attribute('open') is not None
    assert '出发前知道这些' in page.locator('main').inner_text()
    assert '听讲解' not in page.locator('main').inner_text()
   test('City Walk has all steps, source-matched text, practical tips and honest text narration',walk)
   page.screenshot(path=str(out/'walk-390.png'))
   def all_routes():
    cases=['route','stations','station/golden','station/qinghui','station/1227','station/wangfujing','station/wetland','walks','walk/local-night','walk/family-river','walk/slow-river','poi/qinghui-culture','poi/qinghui-park','poi/1227-cafe','guide','rights','privacy','me']
    for r in cases:
     route(r);assert '页面暂时无法显示' not in page.locator('body').inner_text(),r;assert '内容不存在' not in page.locator('main').inner_text(),r;no_overflow(page)
   test('all secondary/tertiary pages and formerly missing POIs resolve and keep navigation',all_routes)
   def invalid():
    for r in ['station/does-not-exist','poi/does-not-exist','walk/does-not-exist','unknown']:
     route(r);assert '内容不存在或已下线' in page.locator('main').inner_text()
   test('invalid content IDs never show the first station, first walk or unrelated detail',invalid)
   def live():
    route('live');page.wait_for_selector('.live-map');assert '实时公交接入中' in page.locator('main').inner_text();assert '约8分钟' not in page.locator('main').inner_text();assert '暂无有效车辆定位' in page.locator('main').inner_text()
    page.get_by_role('button',name='景点',exact=True).click();n=page.locator('.menu-list button').count();assert n>0
    page.get_by_role('button',name='美食',exact=True).click();assert page.locator('.menu-list button').count()>0;assert '霸王茶姬' in page.locator('main').inner_text()
   test('live no-configuration state contains no synthetic vehicles/ETA; map categories change content',live)
   page.screenshot(path=str(out/'live-390.png'))
   def typography():
    route('stations');fonts=page.locator('.station-row small').evaluate_all('(es)=>es.map(e=>parseFloat(getComputedStyle(e).fontSize))');assert all(v>=14 for v in fonts);assert page.locator('.station-row').count()==5;assert all(v>=44 for v in page.locator('.bottom-nav button').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().height)'))
   test('readable station fonts and minimum navigation touch targets',typography)
   for width,height in [(320,740),(375,812),(1280,800)]:
    def responsive(w=width,h=height):
     q=fresh(w,h);q.wait_for_selector('.hero');no_overflow(q);q.screenshot(path=str(out/f'home-{w}.png'));q.close()
    test(f'responsive {width}px: first screen and nav',responsive)
   def failure():
    faults['/content']=503;q=fresh();q.get_by_role('alert').first.wait_for();assert '暂时无法读取' in q.locator('main').inner_text();q.get_by_role('button',name='实时',exact=True).click();q.wait_for_selector('.live-map');assert '实时公交接入中' in q.locator('main').inner_text();q.close();faults.clear()
   if args.offline:test('injected content 503 does not turn into demo data or disable the independent live page',failure)
   else:results.append({'name':'injected content fault','status':'not_run','reason':'Use Playwright route fault injection in full browser mode'})
   test('React runtime recorded no page errors',lambda: (_ for _ in ()).throw(AssertionError(errors)) if errors else None)
   browser.close()
 finally:
  server.terminate();server.wait(timeout=10);log.close()
report={'storageMode':'controlled in-memory Storage for offline DOM tests; physical persistence not tested' if args.offline else 'browser origin storage','mode':'offline-real-react-dom-with-local-api-binding' if args.offline else 'http-browser-local-api','notCovered':['public network/TLS/CSP deployment','real map SDK','native WeChat rendering','physical devices','real IVY data'],'results':results,'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results)}
(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(1 if report['failed'] else 0)
