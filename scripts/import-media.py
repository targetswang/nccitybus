#!/usr/bin/env python3
"""Import explicitly authorized media; source discovery is not evidence of publication rights.
Produces owned, content-addressed WebP files plus a NEW unpublished catalog candidate.
Does not modify the active DB release and never bypasses a source's authentication.
"""
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import argparse, hashlib, ipaddress, json, socket, io
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 12 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirect refused; verify the final source URL explicitly')

def validate_remote(url, allowed_hosts):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Only HTTPS URLs without credentials on port 443 are permitted')
    if parsed.hostname not in allowed_hosts:
        raise ValueError('Source host is not allowlisted')
    addresses = {r[4][0] for r in socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)}
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise ValueError('Only public source IP addresses are permitted')
    return parsed

def crop_image(raw, destination, focus=(0.5,0.5)):
    if len(raw) > MAX_BYTES: raise ValueError('Image exceeds size limit')
    with Image.open(io.BytesIO(raw)) as opened:
        if opened.format not in ('JPEG','PNG','WEBP'): raise ValueError('Unsupported image format')
        im=ImageOps.exif_transpose(opened).convert('RGB')
        if min(im.size)<300: raise ValueError('Image too small for a featured card')
        im=ImageOps.fit(im,(1200,675),Image.Resampling.LANCZOS,centering=focus)
        out=io.BytesIO();im.save(out,'WEBP',quality=84,method=6)
    content=out.getvalue();digest=hashlib.sha256(content).hexdigest();destination.mkdir(parents=True,exist_ok=True)
    (destination/(digest+'.webp')).write_bytes(content)
    return '/media/'+digest+'.webp',digest

def main():
    p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('--catalog',default=str(ROOT/'packages/content/catalog.reference.json'));p.add_argument('--out',required=True);p.add_argument('--version',required=True)
    args=p.parse_args();manifest=json.loads(Path(args.manifest).read_text());catalog=json.loads(Path(args.catalog).read_text());catalog['version']=args.version
    if args.version==json.loads(Path(args.catalog).read_text())['version']:raise ValueError('Use a new immutable release version')
    hostlist=manifest.get('allowedHosts',[]);evidence=[]
    for entry in manifest['items']:
        if entry.get('rightsConfirmed') is not True or not entry.get('rightsEvidence'):
            raise ValueError('Explicit redistribution rights and evidence required')
        poi=next((x for x in catalog['pois'] if x['id']==entry['poiId']),None)
        if poi is None:raise ValueError('Unknown POI')
        if not entry.get('placeMatchConfirmed'):raise ValueError('Confirm this image depicts the selected place, not another branch')
        validate_remote(entry['sourceUrl'],hostlist)
        # This is a trusted operator CLI, not a public image proxy; deploy behind egress restrictions.
        with build_opener(NoRedirect).open(Request(entry['sourceUrl'],headers={'User-Agent':'NanchongMediaImporter/2.0'}),timeout=15) as res:
            raw=res.read(MAX_BYTES+1)
        focus=entry.get('focus',[0.5,0.5])
        if len(focus)!=2 or not all(isinstance(n,(int,float)) and 0<=n<=1 for n in focus):raise ValueError('Invalid crop focus')
        url,digest=crop_image(raw,ROOT/'var/media',tuple(focus));poi['cover']=url;poi['imageLabel']=entry.get('caption','场地实景')
        poi['mediaApproval']={'sha256':digest,'sourceUrl':entry['sourceUrl'],'rightsEvidence':entry['rightsEvidence'],'placeMatchConfirmed':True}
        evidence.append({'poiId':poi['id'],'cover':url,'sha256':digest})
    catalog['publication']='reference' # A media import is not final editorial approval.
    Path(args.out).write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'candidate_created','items':evidence,'next':'review and publish a new content version explicitly'},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
