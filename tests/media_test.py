#!/usr/bin/env python3
"""Local synthetic-image tests. Not merchant photo verification or remote download acceptance."""
from pathlib import Path
import importlib.util, tempfile, io, json
from PIL import Image
spec=importlib.util.spec_from_file_location('media_importer',Path(__file__).resolve().parents[1]/'scripts/import-media.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
def run(name, fn):
    try: fn();results.append({'name':name,'status':'passed'})
    except Exception as e:results.append({'name':name,'status':'failed','reason':str(e)})
def raw(size,fmt='PNG'):
    image=Image.new('RGB',size)
    # Deliberately synthetic, with disjoint halves to detect crop focus.
    image.paste((20,100,60),(0,0,size[0]//2,size[1]));image.paste((240,180,60),(size[0]//2,0,size[0],size[1]))
    b=io.BytesIO();image.save(b,fmt);return b.getvalue()
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp)
    def dimensions():
        url,digest=m.crop_image(raw((2400,1200)),d)
        with Image.open(d/(digest+'.webp')) as im:
            assert im.size==(1200,675);assert im.format=='WEBP';assert not im.getexif()
        assert url=='/media/'+digest+'.webp'
    def focus():
        a=m.crop_image(raw((3000,500)),d,(0,0.5))[1];b=m.crop_image(raw((3000,500)),d,(1,0.5))[1];assert a!=b
    def reject(data):
        try:m.crop_image(data,d)
        except ValueError:return
        raise AssertionError('invalid asset was accepted')
    def remote_reject():
        for url,hosts in [('http://example.com/a.jpg',['example.com']),('https://other.example/a.jpg',['allowed.example']),('https://u:p@example.com/a.jpg',['example.com'])]:
            try:m.validate_remote(url,hosts)
            except ValueError:continue
            raise AssertionError('unsafe URL was accepted')
    run('1200x675 WebP, owned hash path and EXIF removal',dimensions)
    run('focus-controlled crop produces different real pixels',focus)
    run('small source rejected',lambda:reject(raw((100,100))))
    run('unsupported GIF rejected',lambda:reject(raw((800,800),'GIF')))
    run('plaintext, credentials and unapproved source hosts rejected',remote_reject)
report={'kind':'synthetic local image pipeline test','passed':sum(x['status']=='passed' for x in results),'failed':sum(x['status']=='failed' for x in results),'results':results,'not_tested':['remote site access','photo-to-place match','redistribution rights']}
out=Path(__file__).resolve().parents[1]/'audit/media-tests.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(bool(report['failed']))
