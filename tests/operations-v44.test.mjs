import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { database, referenceCatalog } from './helpers.mjs';
import { ContentService } from '../packages/core/content-service.mjs';
import { OperationsService } from '../packages/core/operations-service.mjs';
import { AssistantService } from '../packages/core/assistant-service.mjs';
import { IntegrationVerificationService } from '../packages/core/integration-verification.mjs';
import { UnifiedAuthService } from '../packages/core/auth-unified.mjs';
import { createApi } from '../apps/api/server.mjs';

const hash64='a'.repeat(64)+'.webp';

test('media must be rights-confirmed, place-matched and locally owned before it can become a POI cover',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());const content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});const ops=new OperationsService(db,content,config);
  const media=(await ops.listMedia()).items[0];assert.ok(media);
  await db.query('UPDATE media_assets SET storage_path=$1,mime_type=$2,width=$3,height=$4 WHERE id=$5',[hash64,'image/webp',1200,675,media.id]);
  await assert.rejects(()=>ops.assignMedia(media.id,{poiId:'golden-park'},'admin'),e=>e.code==='MEDIA_RIGHTS_UNVERIFIED');
  await ops.reviewMedia(media.id,{rightsStatus:'confirmed',matchStatus:'confirmed',rightsEvidence:'客户已取得该图使用授权，验收单R-001',matchEvidence:'运营人员核对为黄金江岸实景',note:'QA'},'admin');
  const before=(await repo.catalog()).pois.find(x=>x.id==='golden-park').cover;await ops.assignMedia(media.id,{poiId:'golden-park',imageLabel:'黄金江岸实景'},'admin');assert.equal((await repo.catalog()).pois.find(x=>x.id==='golden-park').cover,before);
  await content.publish({actorUserId:'admin'});assert.equal((await repo.catalog()).pois.find(x=>x.id==='golden-park').cover,'/media/'+hash64);
  const audit=await ops.mediaAudit(media.id);assert.deepEqual(audit.items.map(x=>x.action),['assign_cover','review']);
});

test('AMap discovery enters a candidate pool and requires human approval before import/publish',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());const content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});config.amapKey='amap-test-key';
  const transport=async url=>{const u=new URL(url);assert.equal(u.hostname,'restapi.amap.com');assert.equal(u.pathname,'/v5/place/around');assert.equal(u.searchParams.get('key'),'amap-test-key');return Response.json({status:'1',info:'OK',pois:[{id:'B001',name:'测试江畔咖啡',type:'餐饮服务;咖啡厅',address:'南充市高坪区测试路1号',location:'106.123456,30.765432',distance:'388',photos:[{url:'https://example.com/photo.jpg'}]}]});};
  const ops=new OperationsService(db,content,config,transport);const d=await ops.discover({nodeId:'golden',longitude:106.10,latitude:30.75,keywords:'咖啡',radius:3000},'operator');assert.equal(d.upserted,1);assert.equal(d.autoPublished,false);
  let c=(await ops.listCandidates()).items[0];assert.equal(c.status,'pending_review');await assert.rejects(()=>ops.importCandidate(c.id,{},'operator'),e=>e.code==='CANDIDATE_NOT_APPROVED');
  await ops.reviewCandidate(c.id,{decision:'approve',mappedCategory:'喝什么',descriptionDraft:'嘉陵江边的咖啡候选点，需运营发布后才展示。',reviewNote:'已核对名称和位置'},'operator');const imported=await ops.importCandidate(c.id,{subcategory:'咖啡'},'operator');assert.equal(imported.published,false);assert.equal((await repo.catalog()).pois.some(x=>x.id===imported.poiId),false);
  await content.publish({actorUserId:'publisher'});const p=(await repo.catalog()).pois.find(x=>x.id===imported.poiId);assert.equal(p.name,'测试江畔咖啡');assert.equal(p.category,'喝什么');assert.deepEqual(p.mapPoint,{lng:106.123456,lat:30.765432,crs:'GCJ02'});
});

test('live integration verification records only redacted outcomes for AI, WeChat and two-step SMS delivery',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());const content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});config.aiProvider='deepseek';config.aiModel='deepseek-chat';config.aiApiKey='ai-secret-must-not-persist';config.wechatAppId='wx1234567890abcdef';config.wechatAppSecret='wechat-secret-must-not-persist';config.smsProvider='internal-gateway';config.smsSendUrl='https://sms.example.test/send';config.smsProviderToken='sms-secret-must-not-persist';config.smsProviderConfigured=true;
  let smsCode='';const transport=async (url,options={})=>{const u=new URL(String(url));if(u.hostname==='api.deepseek.com')return Response.json({choices:[{message:{role:'assistant',content:'OK'}}]});if(u.hostname==='api.weixin.qq.com'&&u.pathname==='/cgi-bin/token')return Response.json({access_token:'wechat-access-token-must-not-persist',expires_in:7200});if(u.hostname==='sms.example.test'){const body=JSON.parse(options.body);smsCode=body.parameters.code;assert.equal(options.headers.Authorization,'Bearer sms-secret-must-not-persist');return Response.json({success:true});}throw new Error('unexpected '+url);};
  const assistant=new AssistantService(db,content,config,transport),svc=new IntegrationVerificationService(db,config,assistant,transport);assert.equal((await svc.verifyAi('admin')).status,'passed');assert.equal((await svc.verifyWechat('admin')).status,'passed');const start=await svc.smsStart('13900003001','admin');assert.equal(start.deliveryConfirmed,false);assert.equal(/\d{6}/.test(smsCode),true);assert.equal((await svc.smsConfirm(start.challengeId,smsCode,'admin')).status,'passed');
  const history=await svc.history();const serialized=JSON.stringify(history);for(const secret of ['ai-secret-must-not-persist','wechat-secret-must-not-persist','wechat-access-token-must-not-persist','sms-secret-must-not-persist',smsCode])assert.equal(serialized.includes(secret),false);assert.ok(history.items.some(x=>x.integration==='sms-delivery'&&x.status==='passed'));
});

test('production phone OTP uses configured SMS gateway and never returns or stores plaintext OTP',async t=>{
  const {db,config}=await database();t.after(()=>db.close());config.production=true;config.smsProvider='internal-gateway';config.smsSendUrl='https://sms.example.test/send';config.smsProviderToken='provider-secret';config.smsProviderConfigured=true;let code='';
  const transport=async (url,options={})=>{assert.equal(String(url),'https://sms.example.test/send');const payload=JSON.parse(options.body);code=payload.parameters.code;return Response.json({status:'sent'});};const auth=new UnifiedAuthService(db,config,transport);const challenge=await auth.requestChallenge('13900003002','user',1000);assert.equal(challenge.mode,'sms');assert.equal('debugCode' in challenge,false);assert.match(code,/^\d{6}$/);const rows=await db.query('SELECT code_hash FROM auth_challenges WHERE id=$1',[challenge.challengeId]);assert.equal(JSON.stringify(rows).includes(code),false);const session=await auth.verifyChallenge({...challenge,code},1100);assert.equal(session.user.audience,'user');
});


test('HTTP admin routes expose media review and POI discovery without bypassing draft publication',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());const content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});config.adminToken='v44-admin-token-that-is-long-enough-123';config.amapKey='amap-test';
  const transport=async url=>{const u=new URL(String(url));if(u.hostname==='restapi.amap.com')return Response.json({status:'1',info:'OK',pois:[{id:'BHTTP',name:'HTTP候选店',type:'餐饮服务',address:'测试地址',location:'106.120001,30.760001',distance:'520'}]});throw new Error('unexpected '+url);};
  const server=createApi({config,repository:repo,transport});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={Authorization:'Bearer '+config.adminToken,'Content-Type':'application/json'};const call=async(p,o={})=>{const r=await fetch(base+p,o),txt=await r.text();return{status:r.status,data:txt?JSON.parse(txt):null};};
  assert.equal((await call('/admin/media',{headers})).status,200);const run=await call('/admin/discovery/run',{method:'POST',headers,body:JSON.stringify({nodeId:'golden',longitude:106.1,latitude:30.75,keywords:'餐饮'})});assert.equal(run.status,200);const list=await call('/admin/discovery/candidates',{headers});assert.equal(list.data.items[0].status,'pending_review');const id=list.data.items[0].id;assert.equal((await call(`/admin/discovery/candidates/${id}/review`,{method:'POST',headers,body:JSON.stringify({decision:'approve',mappedCategory:'吃什么',descriptionDraft:'HTTP审核草稿',reviewNote:'人工确认'})})).status,200);const imported=await call(`/admin/discovery/candidates/${id}/import`,{method:'POST',headers,body:'{}'});assert.equal(imported.status,200);assert.equal((await repo.catalog()).pois.some(x=>x.id===imported.data.poiId),false);
});

test('HTTP live-verification endpoints are admin-only and persist redacted pass records',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());await new ContentService(db,repo).importCatalog(await referenceCatalog(),{publish:true});config.adminToken='v44-admin-token-that-is-long-enough-456';config.aiProvider='deepseek';config.aiModel='deepseek-chat';config.aiApiKey='http-ai-secret';config.wechatAppId='wx1234567890abcdef';config.wechatAppSecret='http-wechat-secret';config.smsProvider='internal-gateway';config.smsSendUrl='https://sms.example.test/send';config.smsProviderToken='http-sms-secret';config.smsProviderConfigured=true;let code='';
  const transport=async (url,options={})=>{const u=new URL(String(url));if(u.hostname==='api.deepseek.com')return Response.json({choices:[{message:{role:'assistant',content:'OK'}}]});if(u.hostname==='api.weixin.qq.com')return Response.json({access_token:'http-access-secret',expires_in:7200});if(u.hostname==='sms.example.test'){code=JSON.parse(options.body).parameters.code;return Response.json({success:true});}throw new Error('unexpected '+url);};
  const server=createApi({config,repository:repo,transport});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/api/v1`,headers={Authorization:'Bearer '+config.adminToken,'Content-Type':'application/json'};const call=async(p,o={})=>{const r=await fetch(base+p,o),txt=await r.text();return{status:r.status,data:txt?JSON.parse(txt):null};};
  assert.equal((await call('/admin/integrations/verify/ai',{method:'POST',headers,body:'{}'})).status,200);assert.equal((await call('/admin/integrations/verify/wechat',{method:'POST',headers,body:'{}'})).status,200);const start=await call('/admin/integrations/verify/sms/start',{method:'POST',headers,body:JSON.stringify({phone:'13900003003'})});assert.equal(start.status,200);assert.equal((await call('/admin/integrations/verify/sms/confirm',{method:'POST',headers,body:JSON.stringify({challengeId:start.data.challengeId,code})})).status,200);const history=await call('/admin/integration-verifications',{headers});assert.equal(history.status,200);const raw=JSON.stringify(history.data);for(const secret of ['http-ai-secret','http-wechat-secret','http-access-secret','http-sms-secret',code])assert.equal(raw.includes(secret),false);assert.equal((await call('/admin/integration-verifications')).status,401);
});

test('portable admin source contains visual media, candidate review and live integration controls',async()=>{
  const source=await fs.readFile('apps/admin/src/admin.mjs','utf8');for(const marker of ['媒体素材','POI采集','data-media-review','data-candidate-review','verify-ai','verify-wechat','verify-sms','发送并收码验证'])assert.ok(source.includes(marker),marker);for(const secretName of ['AI_API_KEY','WECHAT_APP_SECRET','SMS_PROVIDER_TOKEN'])assert.equal(source.includes(secretName),false);
});

test('physical-device acceptance gate requires both iOS and Android evidence and accepts a complete synthetic evidence record',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nc-device-gate-'));const file=path.join(dir,'device.json'),base={appid:'wx1234567890abcdef',version:'4.4.0-rc.1',verifiedAt:'2026-09-20T08:00:00Z',devices:{ios:{status:'passed',deviceModel:'iPhone QA',osVersion:'26.6',wechatVersion:'test',checks:{launch:true,wechatLogin:true,phoneAuthorization:true,contentRead:true,favoriteRoundTrip:true,supportRoundTrip:true,navigation:true,networkRetry:true},evidence:['ios-shot.png']},android:{status:'blocked',deviceModel:'Android QA',osVersion:'16',wechatVersion:'test',checks:{launch:true,wechatLogin:true,phoneAuthorization:true,contentRead:true,favoriteRoundTrip:true,supportRoundTrip:true,navigation:true,networkRetry:true},evidence:['android-shot.png']}}};await fs.writeFile(file,JSON.stringify(base));let r=spawnSync(process.execPath,['scripts/device-acceptance-check.mjs'],{env:{...process.env,WECHAT_DEVICE_ACCEPTANCE_FILE:file},encoding:'utf8'});assert.equal(r.status,2);base.devices.android.status='passed';await fs.writeFile(file,JSON.stringify(base));r=spawnSync(process.execPath,['scripts/device-acceptance-check.mjs'],{env:{...process.env,WECHAT_DEVICE_ACCEPTANCE_FILE:file},encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/"status": "passed"/);await fs.rm(dir,{recursive:true,force:true});
});
