import test from 'node:test';
import assert from 'node:assert/strict';
import {database,referenceCatalog,testConfig} from './helpers.mjs';
import {openDatabase,migrate} from '../packages/storage/database.mjs';
import {Repository} from '../packages/storage/repository.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
async function setup(t){
 let ctx;
 if(process.env.REVIEW_POSTGRES_URL){
  assert.equal(process.env.POSTGRES_ACCEPTANCE_CONFIRM,'I_UNDERSTAND_THIS_DATABASE_IS_FOR_TESTING');
  const config={...testConfig(),dbDriver:'postgres',databaseUrl:process.env.REVIEW_POSTGRES_URL},db=await openDatabase(config);await migrate(db);
  await db.exec('TRUNCATE content_active, content_releases, tourism_routes, media_assets, home_config, banners, announcements, membership_plans, benefits, events, content_edit_history CASCADE');
  ctx={db,repo:new Repository(db)};
 }else ctx=await database();
 t.after(()=>ctx.db.close());return {...ctx,service:new ContentService(ctx.db,ctx.repo)};
}
async function fixture(){
 const c=await referenceCatalog();c.version='legacy-full';c.home={title:c.title,heroTitle:'保留的线上首页标题',maxBanners:2,customSetting:'keep'};c.guides=[{id:'guide-x',title:'乘车规则',body:'原始说明'}];c.privacy='保留的隐私说明';
 c.events=[{id:'event-z',title:'线上活动Z',registration:'free',capacity:10},{id:'event-a',title:'线上活动A',registration:'free'}];
 c.membershipPlans=[{id:'plan',name:'线上会员',terms:'条款'}];c.benefits=[{id:'benefit',name:'线上权益',membershipPlanId:'plan',rules:'规则'}];c.announcements=[{id:'notice',title:'线上公告',body:'完整公告内容'}];
 const hash='a'.repeat(64);c.banners=[{id:'banner-z',title:'线上入口Z',placement:'home',targetType:'event',targetId:'event-z',coverMediaId:'original-media-id',cover:'/media/'+hash+'.webp',mediaApproval:{sha256:hash,rightsEvidence:'保留的原始授权依据',placeMatchConfirmed:true,matchEvidence:'核对记录'}},{id:'banner-a',title:'线上入口A',placement:'home',targetType:'event',targetId:'event-a'}];
 return c;
}
async function legacySnapshot(db,c){
 // Deliberately model the old production state: snapshot exists with no normalized writes.
 await db.query('INSERT INTO content_releases(version,payload,created_at) VALUES($1,$2,$3)',[c.version,JSON.stringify(c),Date.now()]);
 await db.query('INSERT INTO content_active(singleton,version) VALUES(1,$1) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version',[c.version]);
}
test('legacy snapshot hydrates all business collections, IDs, covers, home, steps and ordering without publishing',async t=>{
 const {db,repo,service}=await setup(t),c=await fixture();await legacySnapshot(db,c);
 const before=await service.comparison();assert.equal(before.draftVersion,null);assert.equal(before.counts.pois.published,21);assert.equal(before.counts.pois.draft,0);
 const result=await service.reconcilePublished({expectedVersion:c.version});assert.equal(result.inserted.events,2);assert.equal(result.inserted.banners,2);
 assert.deepEqual(await repo.catalog(),c);assert.deepEqual((await service.get('walks',c.walks[0].id)).data.steps,c.walks[0].steps);
 assert.deepEqual((await service.home()).data,c.home);
 const banner=await service.get('banners','banner-z');assert.equal(banner.data.coverMediaId,'original-media-id');assert.equal(banner.data.cover,c.banners[0].cover);
 const media=(await db.query('SELECT * FROM media_assets WHERE id=$1',['original-media-id']))[0];assert.equal(media.storage_path,'a'.repeat(64)+'.webp');assert.equal(media.rights_status,'confirmed');
 assert.equal((await service.comparison()).hasChanges,false);
 const history=await db.query('SELECT id FROM content_edit_history');
 assert.deepEqual((await service.reconcilePublished()).inserted,{});assert.deepEqual(await db.query('SELECT id FROM content_edit_history'),history);
});
test('reconciliation preserves edited drafts, offline states, revisions, steps and rejected media',async t=>{
 const {db,repo,service}=await setup(t),c=await fixture();await service.importCatalog(c);
 const poi=await service.get('pois',c.pois[0].id);await service.save('pois',poi.id,{description:'人工未发布草稿',status:'offline'},{expectedRevision:poi.revision});
 const walk=await service.get('walks',c.walks[0].id);const steps=walk.data.steps.map(x=>({...x,title:'草稿步骤'}));await service.save('walks',walk.id,{steps},{expectedRevision:walk.revision});
 await db.query("UPDATE media_assets SET rights_status='rejected' WHERE id=$1",['original-media-id']);
 const saved=await service.get('pois',poi.id);await legacySnapshot(db,c);
 await assert.rejects(service.reconcilePublished({expectedVersion:'stale'}),{code:'REVISION_CONFLICT'});
 await service.reconcilePublished({expectedVersion:c.version});assert.deepEqual(await service.get('pois',poi.id),saved);assert.deepEqual((await service.get('walks',walk.id)).data.steps,steps);
 assert.equal((await db.query('SELECT rights_status FROM media_assets WHERE id=$1',['original-media-id']))[0].rights_status,'rejected');assert.deepEqual(await repo.catalog(),c);
 const report=await service.comparison();assert.ok(report.differences.some(x=>x.id===poi.id&&x.status==='offline'));assert.ok(report.differences.some(x=>x.id===walk.id&&x.fields.some(f=>f.field==='steps')));
 await assert.rejects(service.importCatalog(c,{publish:true}),{code:'IMPORT_DRAFT_ONLY'});
});
test('all repository publication paths hydrate atomically; invalid imports do not leave partial tables or a release',async t=>{
 const {db,repo,service}=await setup(t),c=await fixture();const bad=structuredClone(c);bad.events.push({id:'invalid/id',title:'bad'});
 await assert.rejects(repo.publishCatalog(bad),{code:'INVALID_ID'});assert.equal(await repo.catalog(),null);assert.equal((await service.counts()).nodes,0);
 await repo.publishCatalog(c);assert.equal((await service.list('events')).length,2);assert.equal((await service.comparison()).hasChanges,false);
 await assert.rejects(repo.publishCatalog({...c,title:'same version cannot change'}),{code:'IMMUTABLE_VERSION'});
 const event=await service.get('events','event-a');await service.save('events',event.id,{description:'待发布修改'},{expectedRevision:event.revision});
 assert.ok((await service.comparison()).differences.some(x=>x.id==='event-a'&&x.fields.some(f=>f.field==='description')));
 const draft=await service.buildCatalog();await service.publish({actorUserId:'test-reviewer',approved:true,expectedDraftVersion:draft.version,approval:{evidence:'测试审核'}});
 assert.equal((await service.comparison()).hasChanges,false);
 await repo.rollbackCatalog(c.version);assert.ok((await service.comparison()).hasChanges);assert.equal((await service.get('events','event-a')).data.description,'待发布修改');
});
