"""Read-only preservation evidence. No authentication, admin mutation or supplier bypass."""
import hashlib, json, pathlib, urllib.request, urllib.error, urllib.parse, concurrent.futures, time
ROOT = pathlib.Path('public-baseline-evidence'); ROOT.mkdir(exist_ok=True)
ENDPOINTS = {
    'h5-content': 'https://app-3hu1sz.v2.appdeploy.ai/api/v1/content',
    'legacy-source': 'https://app-3hu1sz.v2.appdeploy.ai/api/v1/legacy-source',
    'admin-content': 'https://app-sz13s5.v2.appdeploy.ai/api/v1/content',
    'admin-health': 'https://app-sz13s5.v2.appdeploy.ai/api/v1/health'
}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
OPENER = urllib.request.build_opener(NoRedirect)
def read(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent':'Nanchong-Content-Preservation/1.0','Accept':'application/json,image/*'})
    try:
        with OPENER.open(request, timeout=20) as response:
            data = response.read(limit + 1)
            if len(data) > limit: return {'status':'too_large','url':url},None
            return {'status':response.status,'url':url,'contentType':response.headers.get('Content-Type'),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)},data
    except urllib.error.HTTPError as error:
        return {'status':error.code,'url':url,'error':'HTTP response; no retry and no access bypass'},None
    except Exception as error:
        return {'status':'failed','url':url,'error':str(error)[:200]},None
report={}; catalog=None
for name,url in ENDPOINTS.items():
    info,data=read(url,1500000); report[name]=info
    if data:
        (ROOT/(name+'.json')).write_bytes(data)
        try:
            value=json.loads(data)
            if name=='legacy-source':catalog=value
        except ValueError:info['parse']='invalid_json'
(ROOT/'requests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
ALLOWED={'imgcdn.scol.com.cn','img.mala.cn','pavo.elongstatic.com','image.kkday.com','qcloud.dpfile.com','dimg04.c-ctrip.com','youimg1.c-ctrip.com','p9.itc.cn','cdn.geo.zxaigc.com','cdn-cloudflare.meidianbang.cn','k.sinaimg.cn','images.deliveryhero.io','www.cscec.com','assets.hyatt.com'}
images=[]
if isinstance(catalog,dict):
    for poi in catalog.get('pois',[]):
        url=(poi.get('inheritedImage') or {}).get('originalUrl') or (poi.get('mediaCandidate') or {}).get('originalUrl')
        parsed=urllib.parse.urlsplit(url or '')
        if parsed.scheme!='https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password:
            images.append({'id':poi.get('id'),'name':poi.get('name'),'status':'no_allowlisted_original','rightsVerified':False});continue
        info,data=read(url,4000000)
        info.update(id=poi.get('id'),name=poi.get('name'),imageLabel=poi.get('imageLabel'),rightsVerified=False,exactMatchVerified=False)
        if data and (info.get('contentType') or '').split(';')[0].startswith('image/'):
            folder=ROOT/'media-quarantine';folder.mkdir(exist_ok=True)
            path=folder/(info['sha256']+'.bin');path.write_bytes(data);info['artifactPath']=str(path.relative_to(ROOT))
        images.append(info)
(ROOT/'media-read-results.json').write_text(json.dumps(images,ensure_ascii=False,indent=2))
print(json.dumps({'readOnly':True,'endpoints':report,'images':len(images),'downloaded':sum('artifactPath' in x for x in images),'rightsVerified':False},ensure_ascii=False))
