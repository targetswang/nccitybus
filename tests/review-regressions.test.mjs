import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { database, referenceCatalog, testConfig } from './helpers.mjs';
import { openDatabase, migrate } from '../packages/storage/database.mjs';
import { Repository } from '../packages/storage/repository.mjs';
import { UnifiedAuthService } from '../packages/core/auth-unified.mjs';
import { AdminService } from '../packages/core/admin-service.mjs';
import { ContentService } from '../packages/core/content-service.mjs';
import { createApi } from '../apps/api/server.mjs';

// CI can rerun this exact suite against its dedicated disposable PostgreSQL DB.
async function setup(t) {
  let ctx;
  if (process.env.REVIEW_POSTGRES_URL) {
    assert.equal(process.env.POSTGRES_ACCEPTANCE_CONFIRM,'I_UNDERSTAND_THIS_DATABASE_IS_FOR_TESTING');
    const config={...testConfig(),dbDriver:'postgres',databaseUrl:process.env.REVIEW_POSTGRES_URL};
    const db=await openDatabase(config);await migrate(db);
    // Only the explicit dedicated acceptance database is allowed here.
    await db.exec('TRUNCATE content_active, content_releases, tourism_routes, users, content_edit_history CASCADE');
    ctx={db,repo:new Repository(db),config};
  } else ctx=await database();
  t.after(()=>ctx.db.close());return ctx;
}
async function login(auth,phone,audience='user',now=Date.now()) {
  const challenge=await auth.requestChallenge(phone,audience,now);
  return auth.verifyChallenge({...challenge,code:'246810'},now+1);
}
async function serverFor(t,ctx){const server=createApi({config:ctx.config,repository:ctx.repo});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return async(path,data,token)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()};};}

test('R1: failed OTP attempts commit, parallel failures stop at five, consumed codes cannot replay',async t=>{
  const {db,config}=await setup(t);const auth=new UnifiedAuthService(db,config);
  const c=await auth.requestChallenge('13900005001','user',1000);
  const failures=await Promise.allSettled(Array.from({length:8},()=>auth.verifyChallenge({...c,code:'000000'},1100)));
  assert.ok(failures.every(x=>x.status==='rejected'));
  assert.equal(Number((await db.query('SELECT attempts FROM auth_challenges WHERE id=$1',[c.challengeId]))[0].attempts),5);
  await assert.rejects(auth.verifyChallenge({...c,code:'246810'},1200),{code:'OTP_EXPIRED'});
  const next=await auth.requestChallenge('13900005001','user',62000);
  await auth.verifyChallenge({...next,code:'246810'},62100);
  await assert.rejects(auth.verifyChallenge({...next,code:'246810'},62200),{code:'OTP_EXPIRED'});
});

test('R2: downgrade and disable apply to existing admin tokens; bootstrap cannot reactivate staff',async t=>{
  const {db,config}=await setup(t);const phone='13900005002';config.initialAdminPhoneHash=createHash('sha256').update('phone:'+phone).digest('hex');
  const auth=new UnifiedAuthService(db,config),admin=new AdminService(db,null),s=await login(auth,phone,'admin',1000);
  await admin.setStaff({userId:s.user.id,role:'viewer'});
  assert.deepEqual((await auth.session(s.token,'admin',1200)).permissions,['content.read']);
  await admin.setStaff({userId:s.user.id,role:'viewer',enabled:false});
  await assert.rejects(auth.session(s.token,'admin',1300),{code:'STAFF_DISABLED'});
  await assert.rejects(login(auth,phone,'admin',62000),{code:'ADMIN_NOT_ALLOWED'});
});

test('R3: production publication requires exact reviewed draft; failures retain the readable approved release',async t=>{
  const ctx=await setup(t),content=new ContentService(ctx.db,ctx.repo);await content.importCatalog(await referenceCatalog(),{publish:true});
  const s=await login(new UnifiedAuthService(ctx.db,ctx.config),'13900005003');
  await new AdminService(ctx.db,null).setStaff({userId:s.user.id,role:'publisher'});
  const admin=await login(new UnifiedAuthService(ctx.db,ctx.config),'13900005003','admin',Date.now()+61000);
  const call=await serverFor(t,ctx);ctx.config.production=true;
  assert.equal((await call('/admin/content/publish',{},admin.token)).status,409);
  const preview=(await call('/admin/content/preview',undefined,admin.token)).data;
  const publish=await call('/admin/content/publish',{approved:true,approval:{evidence:'QA-only explicit review of fixture'},expectedDraftVersion:preview.version},admin.token);
  assert.equal(publish.status,200);assert.equal(publish.data.catalog.approval.reviewedBy,s.user.id);
  assert.equal((await call('/content')).status,200);
  const version=publish.data.version;
  assert.equal((await call('/admin/content/publish',{},admin.token)).status,409);
  await assert.rejects(content.publish({actorUserId:s.user.id}),{code:'CONTENT_NOT_APPROVED'});
  const poi=await content.get('pois','qinghui-pavilion');await content.save('pois',poi.id,{description:'Changed since review'},{expectedRevision:poi.revision});
  assert.equal((await call('/admin/content/publish',{approved:true,approval:{evidence:'stale review'},expectedDraftVersion:preview.version},admin.token)).status,409);
  const fresh=await content.buildCatalog();
  await assert.rejects(content.publish({actorUserId:s.user.id,approved:true,expectedDraftVersion:fresh.version}),{code:'APPROVAL_REQUIRED'});
  const p=await content.get('pois',poi.id);await content.save('pois',p.id,{cover:'https://unapproved.invalid/photo.jpg'},{expectedRevision:p.revision});
  await assert.rejects(content.publish({actorUserId:s.user.id,approved:true,approval:{evidence:'media must still fail'},expectedDraftVersion:(await content.buildCatalog()).version}),{code:'UNOWNED_MEDIA'});
  assert.equal((await ctx.repo.catalog()).version,version);assert.equal((await call('/content')).status,200);
  const bad=await content.get('pois',poi.id);await content.save('pois',bad.id,{cover:null},{expectedRevision:bad.revision});
  const second=await content.publish({actorUserId:s.user.id,approved:true,approval:{evidence:'new exact review'},expectedDraftVersion:(await content.buildCatalog()).version});
  assert.notEqual(second.version,version);await ctx.repo.rollbackCatalog(version);assert.equal((await call('/content')).data.version,version);
});

test('R4: offline persists across edits and publication; dangling references preserve prior release',async t=>{
  const {db,repo}=await setup(t),content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog(),{publish:true});
  const original=(await repo.catalog()).version,catalog=await content.buildCatalog();
  const used=new Set(catalog.walks.flatMap(w=>[w.coverPoiId,...w.steps.map(s=>s.poiId)]));const poi=catalog.pois.find(p=>!used.has(p.id));assert.ok(poi);
  let row=await content.get('pois',poi.id);await content.save('pois',poi.id,{status:'offline'},{expectedRevision:row.revision});row=await content.get('pois',poi.id);
  assert.equal(row.status,'offline');await content.save('pois',poi.id,{description:'Edited while offline'},{expectedRevision:row.revision});assert.equal((await content.get('pois',poi.id)).status,'offline');
  const pub=await content.publish();assert.ok(!pub.catalog.pois.some(p=>p.id===poi.id));
  const referenced=catalog.walks[0].coverPoiId;row=await content.get('pois',referenced);await content.save('pois',referenced,{status:'offline'},{expectedRevision:row.revision});
  await assert.rejects(content.publish(),{code:'DANGLING_REFERENCE'});assert.equal((await repo.catalog()).version,pub.version);assert.notEqual(pub.version,original);
  row=await content.get('pois',poi.id);await assert.rejects(content.save('pois',poi.id,{status:'typo'},{expectedRevision:row.revision}),{code:'INVALID_STATUS'});
});

test('R5: node revision persists and rejects a concurrent stale editor',async t=>{
  const {db,repo}=await setup(t),content=new ContentService(db,repo);await content.importCatalog(await referenceCatalog());
  const row=(await content.list('nodes'))[0];const results=await Promise.allSettled(['A','B'].map(name=>content.save('nodes',row.id,{name},{expectedRevision:row.revision})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
  assert.equal((await content.get('nodes',row.id)).revision,row.revision+1);
  await migrate(db);assert.equal((await content.get('nodes',row.id)).revision,row.revision+1);
});

test('R5: migration 005 upgrades populated 004 database without rewriting old migration',async t=>{
  if(process.env.REVIEW_POSTGRES_URL)return t.skip('Dedicated migration upgrade exercised separately on SQLite');
  const db=await openDatabase(testConfig());t.after(()=>db.close());
  await db.exec(await fs.readFile('packages/storage/schema.sql','utf8'));
  await db.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)',['001',Date.now()]);
  for(const [v,f] of [['002','002_unified_platform.sql'],['003','003_ai_operations.sql'],['004','004_operations_media_discovery.sql']]){await db.exec(await fs.readFile('packages/storage/migrations/'+f,'utf8'));await db.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)',[v,Date.now()]);}
  await db.query('INSERT INTO tourism_routes(id,name,description,status,sort_order,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',['r','original','','active',0,'{}',1]);
  await db.query('INSERT INTO tourism_nodes(id,route_id,name,persona,sequence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',['n','r','preserved','',1,'{}',1]);
  await migrate(db);const n=(await db.query('SELECT name,revision FROM tourism_nodes WHERE id=$1',['n']))[0];assert.equal(n.name,'preserved');assert.equal(Number(n.revision),1);
});

test('R7: session tokens travel only via Authorization header; body _session channel is closed',async t=>{
  const ctx=await setup(t);await new ContentService(ctx.db,ctx.repo).importCatalog(await referenceCatalog(),{publish:true});
  const s=await login(new UnifiedAuthService(ctx.db,ctx.config),'13900005004');
  const call=await serverFor(t,ctx);
  assert.equal((await call('/me/query',{},s.token)).status,200);
  assert.equal((await call('/me/query',{_session:s.token})).status,401);
  assert.equal((await call('/me/action',{_session:s.token,action:'favorite',operation:'add',id:'golden-park'})).status,401);
  assert.equal((await call('/me/action',{action:'favorite',operation:'add',id:'golden-park'},s.token)).status,200);
  const auth=new UnifiedAuthService(ctx.db,ctx.config);
  assert.ok(await auth.session(s.token),'session stays valid without a header');
  assert.equal((await call('/auth/logout',{_session:s.token})).status,200);
  assert.ok(await auth.session(s.token),'logout without Authorization must not revoke');
  assert.equal((await call('/auth/logout',{},s.token)).status,200);
  await assert.rejects(auth.session(s.token),{code:'UNAUTHORIZED'});
});

test('R8: rate-limit windows are shared through the database and purged by housekeeping',async t=>{
  const {db,repo}=await setup(t),now=Date.now(),windowStart=Math.floor(now/60000)*60000;
  assert.equal(await repo.flushRateWindow('203.0.113.9',windowStart,1),1);
  assert.equal(await repo.flushRateWindow('203.0.113.9',windowStart,2),3);
  assert.equal(await repo.flushRateWindow('203.0.113.8',windowStart,1),1);
  await repo.housekeeping(now);
  assert.equal(await repo.rateWindowTotal?.('203.0.113.9',windowStart) ?? Number((await db.query('SELECT count FROM rate_limit_windows WHERE ip=$1',['203.0.113.9']))[0]?.count ?? 0),3);
  await repo.housekeeping(now+600000);
  assert.equal((await db.query('SELECT count FROM rate_limit_windows')).length,0);
});

test('R9: analytics events expire after the retention window',async t=>{
  const {db,repo}=await setup(t),now=Date.now();
  await db.query('INSERT INTO analytics_events(id,user_id,event,client,page,object_type,object_id,channel_code,content_version,properties_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',['keep',null,'banner_view','h5','','','','','','{}',now]);
  await db.query('INSERT INTO analytics_events(id,user_id,event,client,page,object_type,object_id,channel_code,content_version,properties_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',['drop',null,'banner_view','h5','','','','','','{}',now-91*86400000]);
  await repo.housekeeping(now);
  const ids=(await db.query('SELECT id FROM analytics_events')).map(r=>r.id);
  assert.deepEqual(ids,['keep']);
});
