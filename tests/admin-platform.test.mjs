import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { database, referenceCatalog } from './helpers.mjs';
import { ContentService } from '../packages/core/content-service.mjs';
import { UnifiedAuthService } from '../packages/core/auth-unified.mjs';
import { UserService } from '../packages/core/user-service.mjs';
import { AdminService } from '../packages/core/admin-service.mjs';
import { createApi } from '../apps/api/server.mjs';
import { parseRoute, ownerForPage } from '../packages/client-core/index.mjs';
const phoneHash=p=>createHash('sha256').update('phone:'+p).digest('hex');

test('H5 shared route model includes unified account, member, event, message and support pages',()=>{
  for(const page of ['login','member','events','event','benefit','messages','support'])assert.equal(parseRoute('#'+page).page,page);
  for(const page of ['login','member','events','event','benefit','messages','support'])assert.equal(ownerForPage(page),'me');
});

test('admin service exposes user profile, replies ticket into inbox, and manages RBAC without leaking internal note',async t=>{
  const {db,repo,config}=await database();t.after(()=>db.close());await new ContentService(db,repo).importCatalog(await referenceCatalog(),{publish:true});config.testLoginCode='246810';
  const auth=new UnifiedAuthService(db,config),users=new UserService(db),admin=new AdminService(db,users);
  const c=await auth.requestChallenge('13900002001','user',1000),s=await auth.verifyChallenge({...c,code:'246810'},1100);const catalog=await repo.catalog();
  const ticket=await users.action(s.user.id,'ticket',{category:'地点与图片',description:'QA后台回复联调'},catalog,1200);
  const list=await admin.listTickets();assert.equal(list.items.length,1);assert.equal(list.items[0].description,'QA后台回复联调');
  const out=await admin.updateTicket(ticket.record.id,{status:'resolved',publicReply:'已核对并处理',internalNote:'内部备注不对用户显示'},'admin',1300);assert.ok(out.messageId);
  const p=await users.profile(s.user.id);assert.equal(p.tickets[0].reply,'已核对并处理');assert.equal(p.messages[0].body,'已核对并处理');assert.ok(!JSON.stringify(p).includes('内部备注不对用户显示'));
  await admin.setStaff({userId:s.user.id,role:'customer_service',enabled:true},1400);assert.equal((await admin.listStaff()).items[0].role,'customer_service');
});

test('HTTP admin console assets and user-service lifecycle share one real database',async t=>{
  const {db,repo,config}=await database();config.testLoginCode='246810';const adminPhone='13900002002';config.initialAdminPhoneHash=phoneHash(adminPhone);config.adminToken='';config.publicBaseUrl='http://127.0.0.1';await new ContentService(db,repo).importCatalog(await referenceCatalog(),{publish:true});
  const server=createApi({config,repository:repo});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});const origin=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,options={})=>{const r=await fetch(origin+path,options),txt=await r.text();return{status:r.status,headers:r.headers,data:txt&&r.headers.get('content-type')?.includes('json')?JSON.parse(txt):txt};};
  const challenge=await call('/api/v1/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:adminPhone,audience:'admin'})});const login=await call('/api/v1/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...challenge.data,code:'246810',clientType:'admin'})});const adminHeaders={Authorization:'Bearer '+login.data.token};
  assert.equal((await call('/admin/')).status,200);assert.match((await call('/admin/')).data,/运营工作台/);
  let c=await call('/api/v1/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13900002003',audience:'user'})});let user=await call('/api/v1/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c.data,code:'246810'})});
  let action=await call('/api/v1/me/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_session:user.data.token,action:'ticket',category:'活动',description:'QA API工单'})});assert.equal(action.status,200);
  const tickets=await call('/api/v1/admin/tickets',{headers:adminHeaders});assert.equal(tickets.data.items.length,1);
  const replied=await call('/api/v1/admin/tickets/'+tickets.data.items[0].id,{method:'POST',headers:{...adminHeaders,'Content-Type':'application/json'},body:JSON.stringify({status:'resolved',publicReply:'API回复完成',internalNote:'仅后台可见'})});assert.equal(replied.status,200);
  const profile=await call('/api/v1/me/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_session:user.data.token})});assert.equal(profile.data.tickets[0].reply,'API回复完成');assert.equal(profile.data.messages[0].title,'客服回复');assert.ok(!JSON.stringify(profile.data).includes('仅后台可见'));
});

test('admin route config: GET/POST /admin/content/route edits line-level copy behind optimistic lock',async t=>{
  const {db,repo,config}=await database();config.testLoginCode='246810';const adminPhone='13900002004';config.initialAdminPhoneHash=phoneHash(adminPhone);config.adminToken='';config.publicBaseUrl='http://127.0.0.1';
  await new ContentService(db,repo).importCatalog(await referenceCatalog(),{publish:true});
  const server=createApi({config,repository:repo});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});const origin=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,options={})=>{const r=await fetch(origin+path,options),txt=await r.text();return{status:r.status,data:txt&&r.headers.get('content-type')?.includes('json')?JSON.parse(txt):txt};};
  const challenge=await call('/api/v1/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:adminPhone,audience:'admin'})});
  const login=await call('/api/v1/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...challenge.data,code:'246810',clientType:'admin'})});
  const h={Authorization:'Bearer '+login.data.token,'Content-Type':'application/json'};

  // GET returns route singleton with line-level copy
  const got=await call('/api/v1/admin/content/route',{headers:h});
  assert.equal(got.status,200);assert.ok(got.data.data.name);assert.ok('notice' in got.data.data);assert.ok('privacy' in got.data.data);assert.ok('guides' in got.data.data);
  const revision=got.data.revision;

  // POST saves patch; draft catalog reflects line-owned fields before publish
  const saved=await call('/api/v1/admin/content/route',{method:'POST',headers:h,body:JSON.stringify({expectedRevision:revision,data:{description:'线路描述由后台更新',privacy:got.data.data.privacy,guides:got.data.data.guides}})});
  assert.equal(saved.status,200);assert.equal(saved.data.data.description,'线路描述由后台更新');
  const draft=await call('/api/v1/admin/content/preview',{headers:h});assert.equal(draft.data.description,'线路描述由后台更新');
  // H5 not affected until explicit publish
  const stale=await call('/api/v1/content');assert.notEqual(stale.data.description,'线路描述由后台更新');

  // Stale revision → 409; history recorded
  const conflict=await call('/api/v1/admin/content/route',{method:'POST',headers:h,body:JSON.stringify({expectedRevision:revision,data:{notice:'冲突写入'}})});
  assert.equal(conflict.status,409);
  const history=await db.query("SELECT * FROM content_edit_history WHERE kind='route'");assert.equal(history.length,1);
});
