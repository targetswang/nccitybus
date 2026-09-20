"""Real admin UI through H5 registration; generated image is a test fixture only."""
import hashlib, json, os, subprocess, tempfile, time
from pathlib import Path
from urllib.request import urlopen
from PIL import Image
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'audit/local/browser'; OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3113'
with tempfile.TemporaryDirectory(prefix='nc-admin-') as tmp:
 env={**os.environ,'NODE_ENV':'development','DB_DRIVER':'sqlite','SQLITE_PATH':tmp+'/db.sqlite','PORT':'3113','HOST':'127.0.0.1','PUBLIC_BASE_URL':BASE,'TEST_LOGIN_CODE':'246810','BROWSER_ACCEPTANCE':'1','INITIAL_ADMIN_PHONE_HASH':hashlib.sha256(b'phone:13900008001').hexdigest()}
 subprocess.run(['node','tests/browser/seed-admin.mjs'],cwd=ROOT,env=env,check=True)
 fixture=Path(tmp)/'fixture.png';Image.new('RGB',(80,80),'green').save(fixture)
 with (OUT/'admin-api.log').open('w') as log:
  server=subprocess.Popen(['node','apps/api/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log)
  try:
   for _ in range(100):
    try:urlopen(BASE+'/api/v1/health',timeout=1);break
    except Exception:time.sleep(.1)
   with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept('自动化验收测试审核依据' if d.type=='prompt' else None))
    page.goto(BASE+'/admin/');page.locator('[name=phone]').fill('13900008001');page.get_by_role('button',name='获取验证码').click()
    expect(page.locator('#code-hint')).to_contain_text('246810');page.locator('[name=code]').fill('246810');page.get_by_role('button',name='进入后台').click()
    expect(page.locator('#publish')).to_be_visible()
    page.locator('[data-nav=content]').first.click();page.locator('[data-sub=media]').click()
    page.locator('#upload-form input').set_input_files(str(fixture));page.get_by_role('button',name='上传到素材库').click()
    card=page.locator('.media-card').filter(has=page.locator('[data-media-review^="upload-"]'));expect(card).to_have_count(1)
    card.get_by_role('button',name='审核',exact=True).click();form=page.locator('#media-review-form')
    form.locator('[name=rightsStatus]').select_option('confirmed');form.locator('[name=matchStatus]').select_option('confirmed')
    form.locator('[name=rightsEvidence]').fill('自动生成的验收测试图片');form.locator('[name=matchEvidence]').fill('验收图片匹配测试内容');form.locator('button[type=submit],button.primary').first.click()
    expect(page.locator('#media-review-form')).to_have_count(0)
    page.locator('[data-nav=activities]').click();page.locator('[data-sub=events]').click();page.locator('#content-create').click()
    form=page.locator('#operational-form');form.locator('[name=title]').fill('浏览器新建活动');form.locator('[name=rules]').fill('仅用于自动验收');form.locator('[name=coverMediaId]').select_option(index=1);form.get_by_role('button',name='保存草稿').click()
    expect(page.locator('#operational-form')).to_have_count(0);expect(page.get_by_text('浏览器新建活动',exact=True)).to_be_visible()
    page.locator('[data-nav=content]').first.click();page.locator('[data-sub=banners]').click();page.locator('#content-create').click()
    form=page.locator('#operational-form');form.locator('[name=title]').fill('浏览器活动入口');form.locator('[name=targetType]').select_option('event');form.locator('[name=targetId]').select_option(label='浏览器新建活动');form.locator('[name=coverMediaId]').select_option(index=1);form.get_by_role('button',name='保存草稿').click()
    expect(page.locator('#operational-form')).to_have_count(0);page.locator('[data-publish]').click()
    # Wait for the version to become visible to public clients before starting a new visitor.
    for _ in range(50):
     if page.request.get(BASE+'/api/v1/content').json().get('events'):break
     time.sleep(.1)
    visitor=browser.new_context();v=visitor.new_page();v.on('dialog',lambda d:d.accept());v.goto(BASE+'/#home')
    v.get_by_role('button').filter(has_text='浏览器活动入口').click();expect(v.get_by_role('heading',name='浏览器新建活动')).to_be_visible()
    # The visitor follows the normal phone login screen, then the same published event.
    event_hash=v.evaluate('location.hash');v.goto(BASE+'/#login')
    v.locator('input[inputmode=tel]').fill('13900008002');v.get_by_role('button',name='获取验证码').click();expect(v.get_by_text('测试验证码：')).to_be_visible()
    v.locator('input[inputmode=numeric]').fill('246810');v.locator('input[type=checkbox]').check();v.get_by_role('button',name='登录 / 注册',exact=True).click()
    expect(v.get_by_role('heading',name='手机号登录 / 注册')).to_have_count(0);v.goto(BASE+'/'+event_hash);v.get_by_role('button',name='免费报名',exact=True).click();expect(v.get_by_text('活动报名已保存')).to_be_visible()
    page.locator('[data-nav=activities]').click();page.locator('[data-sub=registrations]').click();expect(page.get_by_text('139****8002')).to_be_visible();page.screenshot(path=str(OUT/'admin-registrations.png'),full_page=True)
    assert not errors, errors
    (OUT/'admin-operations.json').write_text(json.dumps({'status':'passed','checks':['admin OTP login','image upload and review','event and Banner creation','explicit publication','H5 Banner navigation','visitor OTP and registration','admin masked registration list']},ensure_ascii=False,indent=2))
    browser.close()
  finally:server.terminate();server.wait(timeout=10)
