"""Chromium interactions over actual local HTTP API; no WeChat/device claims."""
import json, os, subprocess, tempfile, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'audit/local/browser';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with tempfile.TemporaryDirectory(prefix='nc-page-parity-') as tmp:
 env={**os.environ,'NODE_ENV':'development','DB_DRIVER':'sqlite','SQLITE_PATH':tmp+'/db.sqlite','PORT':'3112','HOST':'127.0.0.1','PUBLIC_BASE_URL':'http://127.0.0.1:3112','TEST_LOGIN_CODE':'246810','BROWSER_ACCEPTANCE':'1'}
 session=json.loads(subprocess.check_output(['node','tests/browser/seed.mjs'],cwd=ROOT,env=env,text=True))
 log=(OUT/'api.log').open('w');server=subprocess.Popen(['node','apps/api/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log)
 try:
  for _ in range(100):
   try:urlopen('http://127.0.0.1:3112/api/v1/health',timeout=1);break
   except Exception:time.sleep(.1)
  with sync_playwright() as pw:
   browser=pw.chromium.launch(headless=True)
   for width in [390,1440]:
    context=browser.new_context(viewport={'width':width,'height':900})
    context.add_init_script("sessionStorage.setItem('nc.visitor.session.v1',"+json.dumps(json.dumps(session))+");")
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    def check(name,fn):
     try:fn();results.append({'width':width,'name':name,'status':'passed'})
     except Exception as e:results.append({'width':width,'name':name,'status':'failed','error':str(e)[:1500]})
    def route(name):page.goto('http://127.0.0.1:3112/#'+name,wait_until='networkidle')
    def home():
     route('home');expect(page.locator('.hero')).to_be_visible()
     for label in ['全部环线站点','乘车指南','数据与隐私']:expect(page.get_by_role('button',name=label).first).to_be_visible()
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     expect(page.locator('.horizontal-cards img').first).to_be_visible()
     assert page.locator('.horizontal-cards img').first.evaluate('(img)=>img.complete&&img.naturalWidth>0')
    check('home shortcuts, published card image and viewport',home)
    def walk():
     page.locator('.horizontal-cards .content-card').first.click();expect(page.locator('.walk-detail')).to_be_visible()
     expect(page.locator('.walk-detail > .picture img')).to_be_visible();assert page.locator('.walk-step img').count()>0
    check('walk cover and step images',walk)
    def filters():
     route('explore');page.get_by_role('tab',name='沿线地点').click();page.get_by_role('button',name='吃什么',exact=True).click();page.locator('select').select_option('1227');expect(page.locator('.content-card')).to_have_count(1)
     page.locator('.bottom-nav button').last.click();page.locator('.bottom-nav button').nth(2).click();expect(page.locator('select')).to_have_value('1227');expect(page.locator('.content-card')).to_have_count(1)
    check('root navigation retains combined filters',filters)
    def event():
     route('event/browser-event');expect(page.get_by_text('天气原因',exact=True)).to_be_visible();expect(page.get_by_role('button',name='免费报名',exact=True)).to_be_disabled()
    check('cancelled event shows reason and blocks registration',event)
    def rights():
     route('rights');button=page.get_by_role('button',name='确认规则并领取');expect(button).to_be_visible()
     if width==390:expect(button).to_be_enabled();button.click()
     expect(page.get_by_text('浏览器验收权益',exact=True)).to_have_count(2)
     expect(page.get_by_text('有效至 长期有效',exact=False)).to_be_visible()
     page.get_by_role('button',name='刷新内容',exact=True).click();expect(button).to_be_disabled()
    check('claim action and refreshed capacity status',rights)
    def support():
     route('support');page.locator('textarea').fill('浏览器反馈验收 '+str(width));page.get_by_role('button',name='提交',exact=True).click();expect(page.locator('.service-record').filter(has_text='浏览器反馈验收 '+str(width))).to_have_count(1)
    check('feedback creates one visible service record',support)
    page.screenshot(path=str(OUT/f'support-{width}.png'),full_page=True)
    check('no browser JavaScript errors',lambda: (_ for _ in ()).throw(AssertionError(errors)) if errors else None)
    context.close()
   browser.close()
 finally:
  server.terminate();server.wait(timeout=10);log.close()
report={'kind':'Chromium actual HTTP page parity','passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'results':results,'limitations':['Not WeChat official compiler or iOS/Android device acceptance']}
(OUT/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if report['failed'] else 0)
