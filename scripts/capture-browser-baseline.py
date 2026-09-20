"""Public read-only browser evidence. No login and no mutation of application data."""
import pathlib, json, urllib.request, urllib.parse, re, hashlib
from playwright.sync_api import sync_playwright
OUT=pathlib.Path('browser-baseline');OUT.mkdir(exist_ok=True)
report=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for app in ['app-3hu1sz','app-sz13s5']:
        folder=OUT/app;folder.mkdir(exist_ok=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        network=[]; errors=[]
        def response(r):
            try:
                ct=r.headers.get('content-type','')
                if 'json' in ct:
                    data=r.json()
                    # Persist responses only; request headers, tokens and bodies are never exported.
                    name='response-'+str(len(network))+'.json'
                    (folder/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
                    network.append({'status':r.status,'origin':urllib.parse.urlsplit(r.url).netloc,'path':urllib.parse.urlsplit(r.url).path,'file':name})
            except Exception:pass
        page.on('response',response);page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            page.goto('https://'+app+'.v2.appdeploy.ai/',wait_until='networkidle',timeout=60000)
            page.screenshot(path=str(folder/'initial.png'),full_page=True)
            (folder/'visible-text.txt').write_text(page.locator('body').inner_text())
            scripts=page.eval_on_selector_all('script[src]','els=>els.map(e=>e.src)')
            for url in scripts:
                if urllib.parse.urlsplit(url).netloc != app+'.v2.appdeploy.ai' or '/assets/' not in url:continue
                r=page.request.get(url)
                data=r.body();name=pathlib.PurePosixPath(urllib.parse.urlsplit(url).path).name
                (folder/name).write_bytes(data)
                candidate=url+'.map'
                m=page.request.get(candidate)
                try:
                    sm=m.json()
                    if not isinstance(sm.get('sourcesContent'),list):continue
                    (folder/(name+'.map')).write_text(json.dumps(sm))
                    for i,(src,content) in enumerate(zip(sm.get('sources',[]),sm['sourcesContent'])):
                        if content is None or 'node_modules' in src:continue
                        safe=src.replace('../','').lstrip('/')
                        target=folder/'source-map-export'/safe;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
                except Exception:pass
            if app=='app-3hu1sz':
                page.goto('https://'+app+'.v2.appdeploy.ai/?baseline=1789775010896#home',wait_until='networkidle',timeout=60000)
                page.screenshot(path=str(folder/'baseline.png'),full_page=True)
        except Exception as e: errors.append(str(e))
        (folder/'network.json').write_text(json.dumps(network,ensure_ascii=False,indent=2))
        (folder/'errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2))
        report.append({'app':app,'responses':len(network),'errors':errors});page.close()
    browser.close()
(OUT/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
