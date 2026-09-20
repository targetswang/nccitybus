import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { database, referenceCatalog, testConfig } from './helpers.mjs';
import { UnifiedAuthService } from '../packages/core/auth-unified.mjs';
import { ContentService } from '../packages/core/content-service.mjs';
import { UserService } from '../packages/core/user-service.mjs';
import { createApi } from '../apps/api/server.mjs';
const phoneHash = p => createHash('sha256').update('phone:'+p).digest('hex');

test('migrations install unified auth, RBAC, content and AI operations tables', async t => {
  const { db } = await database(); t.after(()=>db.close());
  for (const table of ['users','user_identities','user_sessions','auth_challenges','staff_roles','user_favorites','tourism_routes','tourism_nodes','media_assets','pois','city_walks','city_walk_steps','home_config','membership_plans','benefits','events','support_tickets','inbox_messages','analytics_events','ai_tasks','ai_proposals','poi_discovery_candidates','media_audit_log','integration_verifications','sms_delivery_challenges']) {
    const rows=await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=$1",[table]);assert.equal(rows[0]?.name,table);
  }
  const migrations=await db.query('SELECT version FROM schema_migrations ORDER BY version');assert.deepEqual(migrations.map(x=>x.version),['001','002','003','004','005','006']);
});

test('phone challenge creates one user, separates user/admin audiences and checks admin authorization server-side', async t => {
  const { db, config } = await database(); t.after(()=>db.close());
  const adminPhone='13900001001'; config.testLoginCode='246810';config.initialAdminPhoneHash=phoneHash(adminPhone);
  const auth=new UnifiedAuthService(db,config);
  const c=await auth.requestChallenge(adminPhone,'user',1000);assert.equal(c.mode,'test');
  const visitor=await auth.verifyChallenge({...c,code:'246810',clientType:'h5'},1100);assert.equal(visitor.user.audience,'user');assert.equal(visitor.user.role,'user');
  const ca=await auth.requestChallenge(adminPhone,'admin',62000);const admin=await auth.verifyChallenge({...ca,code:'246810',clientType:'admin'},62100);assert.equal(admin.user.role,'admin');assert.ok(admin.user.permissions.includes('*'));
  assert.equal((await db.query('SELECT id FROM users')).length,1);assert.equal((await db.query('SELECT user_id FROM staff_roles')).length,1);
  await assert.rejects(()=>auth.session(visitor.token,'admin',2000),e=>e.code==='WRONG_AUDIENCE');
  const bad=await auth.requestChallenge('13900001002','admin',123000);await assert.rejects(()=>auth.verifyChallenge({...bad,code:'246810'},123100),e=>e.code==='ADMIN_NOT_ALLOWED');
});

test('test OTP is single-use, rate-limited and production fails closed without an SMS provider', async t => {
  const { db, config }=await database();t.after(()=>db.close());config.testLoginCode='246810';const auth=new UnifiedAuthService(db,config);
  const c=await auth.requestChallenge('13900001003','user',1000);await assert.rejects(()=>auth.requestChallenge('13900001003','user',2000),e=>e.code==='OTP_RATE_LIMIT');
  await assert.rejects(()=>auth.verifyChallenge({...c,code:'000000'},3000),e=>e.code==='OTP_INVALID');await auth.verifyChallenge({...c,code:'246810'},4000);await assert.rejects(()=>auth.verifyChallenge({...c,code:'246810'},5000),e=>e.code==='OTP_EXPIRED');
  config.production=true;config.smsProviderConfigured=false;await assert.rejects(()=>auth.requestChallenge('13900001004','user',70000),e=>e.code==='SMS_NOT_CONFIGURED');
});

test('wechat phone login verifies both WeChat credentials server-side and links to one phone user', async t => {
  const { db, config }=await database();t.after(()=>db.close());config.wechatAppId='wx-test';config.wechatAppSecret='secret';
  const transport=async (url, options={})=>{
    const u=new URL(url);
    if(u.pathname==='/sns/jscode2session') return Response.json({openid:'openid-one',unionid:'union-one'});
    if(u.pathname==='/cgi-bin/token') return Response.json({access_token:'access-one',expires_in:7200});
    if(u.pathname==='/wxa/business/getuserphonenumber') { assert.equal(JSON.parse(options.body).code,'phone-code');return Response.json({phone_info:{purePhoneNumber:'13900001005'}}); }
    throw new Error('unexpected '+url);
  };
  const auth=new UnifiedAuthService(db,config,transport);const r=await auth.wechatPhoneLogin('phone-code','login-code',1000);assert.equal(r.user.audience,'user');assert.equal(r.user.phoneMasked,'139****1005');
  const identities=await db.query('SELECT kind FROM user_identities WHERE user_id=$1 ORDER BY kind',[r.user.id]);assert.deepEqual(identities.map(x=>x.kind),['phone','wechat_openid','wechat_unionid']);
});

test('reference catalog migrates losslessly into normalized tables and rebuilds 1/5/21/4/9 content model', async t => {
  const {db,repo}=await database();t.after(()=>db.close());const source=await referenceCatalog();const service=new ContentService(db,repo);
  const result=await service.importCatalog(source,{publish:true});assert.deepEqual(result.counts,{routes:1,nodes:5,pois:21,media:9,walks:4,steps:9});
  const rebuilt=await service.buildCatalog();assert.equal(rebuilt.nodes.length,5);assert.equal(rebuilt.pois.length,21);assert.equal(rebuilt.walks.length,4);assert.equal(rebuilt.walks.reduce((n,w)=>n+w.steps.length,0),9);
  for(const id of ['golden-park','qinghui-pavilion','1227-chagee']){
    const before=source.pois.find(x=>x.id===id),after=rebuilt.pois.find(x=>x.id===id);for(const f of ['id','nodeId','name','category','subcategory','address','description','narration'])assert.deepEqual(after[f],before[f]);
  }
  const active=await repo.catalog();assert.equal(active.version,source.version);assert.equal(active.pois.length,21);
});

test('normalized content edit is optimistic, auditable and only reaches clients after explicit publish', async t => {
  const {db,repo}=await database();t.after(()=>db.close());const service=new ContentService(db,repo);await service.importCatalog(await referenceCatalog(),{publish:true});
  const row=await service.get('pois','qinghui-pavilion');const original=(await repo.catalog()).pois.find(x=>x.id==='qinghui-pavilion').description;
  const saved=await service.save('pois','qinghui-pavilion',{description:'QA统一后端联调描述'},{expectedRevision:row.revision,actorUserId:'admin'});assert.equal(saved.revision,row.revision+1);
  assert.equal((await repo.catalog()).pois.find(x=>x.id==='qinghui-pavilion').description,original);
  await assert.rejects(()=>service.save('pois','qinghui-pavilion',{description:'stale'},{expectedRevision:row.revision}),e=>e.code==='REVISION_CONFLICT');
  const pub=await service.publish({actorUserId:'admin'});assert.equal((await repo.catalog()).pois.find(x=>x.id==='qinghui-pavilion').description,'QA统一后端联调描述');assert.equal((await db.query("SELECT COUNT(*) AS count FROM content_edit_history WHERE kind='pois'"))[0].count,1);assert.equal(pub.catalog.publication,'reference');
});

test('user favorites use the same published catalog and persist through unified user tables', async t => {
  const {db,repo,config}=await database();t.after(()=>db.close());const service=new ContentService(db,repo);await service.importCatalog(await referenceCatalog(),{publish:true});config.testLoginCode='246810';const auth=new UnifiedAuthService(db,config),users=new UserService(db);
  const c=await auth.requestChallenge('13900001006','user',1000),session=await auth.verifyChallenge({...c,code:'246810'},1100);const catalog=await repo.catalog();await users.action(session.user.id,'favorite',{operation:'add',id:'qinghui-pavilion'},catalog,1200);assert.deepEqual((await users.profile(session.user.id)).favorites,['qinghui-pavilion']);
});

test('HTTP API exposes phone login, unified me endpoint and normalized admin content using one database', async t => {
  const {db,repo,config}=await database();config.testLoginCode='246810';const adminPhone='13900001007';config.initialAdminPhoneHash=phoneHash(adminPhone);config.adminToken='';config.publicBaseUrl='https://nanchong.test';
  const content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});
  const server=createApi({config,repository:repo,transport:async url=>Response.json({openid:'unused'})});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  const call=async(path,options={})=>{const r=await fetch(base+path,options),text=await r.text();return {status:r.status,data:text?JSON.parse(text):null};};
  let c=await call('/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:adminPhone,audience:'admin'})});assert.equal(c.status,200);let login=await call('/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c.data,code:'246810',clientType:'admin'})});assert.equal(login.data.user.role,'admin');
  const auth={Authorization:'Bearer '+login.data.token};const counts=await call('/admin/content/counts',{headers:auth});assert.equal(counts.data.pois,21);const poi=await call('/admin/content/pois/qinghui-pavilion',{headers:auth});assert.equal(poi.data.data.name,'南门坝生态公园-清晖阁');
  c=await call('/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13900001008',audience:'user'})});login=await call('/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c.data,code:'246810'})});const authHeaders={'Content-Type':'application/json',Authorization:'Bearer '+login.data.token};const body=JSON.stringify({action:'favorite',operation:'add',id:'golden-park'});assert.equal((await call('/me/action',{method:'POST',headers:authHeaders,body})).status,200);const profile=await call('/me/query',{method:'POST',headers:authHeaders,body:'{}'});assert.deepEqual(profile.data.favorites,['golden-park']);
});

