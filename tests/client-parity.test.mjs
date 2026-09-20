import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {database,referenceCatalog,routeFixture,NOW} from './helpers.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
import {createApi} from '../apps/api/server.mjs';
import * as core from '../packages/client-core/index.mjs';
async function native(file,wx,deps={}){
 const exports={};let page;
 vm.runInNewContext(await fs.readFile('dist/weapp-native/'+file+'.js','utf8'),{exports,wx,Page:p=>page=p,require:n=>{if(n.endsWith('client-core'))return core;if(n in deps)return deps[n];throw Error(n);},Date,Error,console,setInterval,clearInterval});
 if(page){page.data=structuredClone(page.data);page.setData=patch=>Object.assign(page.data,patch);}
 return page||exports;
}
async function setup(t){
 const ctx=await database();const content=new ContentService(ctx.db,ctx.repo);await content.importCatalog(await referenceCatalog(),{publish:true});
 ctx.config.initialAdminPhoneHash=createHash('sha256').update('phone:13900007001').digest('hex');
 const server=createApi({config:ctx.config,repository:ctx.repo});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await ctx.db.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const fetchLocal=(url,options)=>fetch(origin+new URL(url,'https://fixture.invalid').pathname+new URL(url,'https://fixture.invalid').search,options);
 const h5code=(await fs.readFile('apps/h5/src/services/api.mjs','utf8')).replace(/^export /gm,'');
 const sandbox={fetch:fetchLocal,AbortSignal};vm.createContext(sandbox);vm.runInContext(h5code+';globalThis.request=request;',sandbox);const request=sandbox.request;
 const storage=new Map();const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),showModal:o=>o.success?.({confirm:true}),request:o=>fetchLocal(o.url,{method:o.method,headers:o.header,body:o.method==='POST'?JSON.stringify(o.data):undefined}).then(async r=>o.success({statusCode:r.status,data:await r.json()})).catch(e=>o.fail({errMsg:e.message}))};
 const api=await native('services/api',wx,{'./config':{CONFIG:{apiBaseUrl:'https://fixture.invalid'}}});
 const session=await native('services/session',wx,{'./api':api});
 const login=async(phone,audience='user')=>{const c=await request('/auth/challenge',{method:'POST',data:{phone,audience}});return request('/auth/verify',{method:'POST',data:{...c,code:'246810'}});};
 const admin=await login('13900007001','admin'),user=await login('13900007002');session.saveSession(user);
 const adminCall=(path,data)=>request(path,{method:data?'POST':'GET',data,token:admin.token});
 return {...ctx,content,api,session,request,wx,user,adminCall};
}
const event=id=>({currentTarget:{dataset:{id}}});

test('admin draft isolation and publication reach actual H5/native adapters and native home with identical version',async t=>{
 const c=await setup(t);const loader=await native('services/content',c.wx,{'./api':c.api});const deps={'../../services/content':loader,'../../services/api':c.api,'../../services/transit':{openTransitCode(){}}};
 const page=await native('pages/home/index',c.wx,deps);await page.onShow();const old=page.data.catalog.version;
 const home=await c.adminCall('/admin/content/home');await c.adminCall('/admin/content/home',{data:{heroTitle:'运营发布的新首页',featuredWalkIds:[page.data.catalog.walks[2].id],maxBanners:1},expectedRevision:home.revision});
 await page.onShow();assert.equal(page.data.catalog.version,old);assert.equal((await c.request('/content')).version,old);
 const draft=await c.adminCall('/admin/content/preview');await c.adminCall('/admin/content/publish',{approved:true,approval:{evidence:'Automated fixture review only'},expectedDraftVersion:draft.version});
 await page.onShow();const h5=await c.request('/content');assert.notEqual(h5.version,old);assert.equal(page.data.catalog.version,h5.version);assert.equal(JSON.stringify(page.data.home),JSON.stringify(core.homeContent(h5)));assert.equal(page.data.home.heroTitle,'运营发布的新首页');assert.equal(page.data.walks.length,1);
 const {default:HomePage}=await import('../dist/h5/src/pages/HomePage.mjs');
 const tree=HomePage({catalog:h5,mode:'walks',setMode(){},capabilities:{}});
 const nodes=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}}visit(tree);
 assert.equal(nodes.find(n=>n.type==='h1').props.children,page.data.home.heroTitle);
 assert.deepEqual(nodes.filter(n=>n.props?.walk).map(n=>n.props.walk.id),page.data.walks.map(w=>w.id));
});

test('native membership/event handlers and H5 actions share state; native feedback receives admin reply',async t=>{
 const c=await setup(t),catalog=await c.repo.catalog();catalog.version='parity-fixture';catalog.membershipPlans=[{id:'free',name:'免费会员',terms:'规则',joinMode:'free'}];catalog.events=[{id:'event',title:'城市活动',registration:'free',rules:'规则'}];await c.repo.publishCatalog(catalog);
 const deps={'../../services/api':c.api,'../../services/session':c.session};
 const member=await native('pages/member/index',c.wx,deps);await member.onShow();await member.join(event('free'));assert.equal(member.data.error,'');
 const profile=()=>c.request('/me/query',{method:'POST',data:{_session:c.user.token}});
 let p=await profile();assert.equal(p.memberships[0].status,'active');await member.leave(event(p.memberships[0].id));assert.equal((await profile()).memberships[0].status,'withdrawn');
 const events=await native('pages/events/index',c.wx,deps);events.onLoad({id:'event'});await events.onShow();await events.register(event('event'));assert.equal(events.data.error,'');p=await profile();assert.equal(p.registrations[0].status,'registered');await events.cancel(event(p.registrations[0].id));assert.equal((await profile()).registrations[0].status,'cancelled');
 await c.request('/me/action',{method:'POST',data:{_session:c.user.token,action:'register',id:'event',accepted:true}});await events.onShow();assert.equal(events.data.profile.registrations[0].status,'registered');
 events.onLoad({id:'missing'});await events.onShow();assert.equal(events.data.events.length,0);assert.match(events.data.error,/不存在/);
 const support=await native('pages/support/index',c.wx,deps);support.cat({detail:{value:'3'}});support.desc({detail:{value:'请核验活动信息'}});await support.submit();assert.equal(support.data.error,'');const tickets=await c.adminCall('/admin/tickets');assert.equal(tickets.items[0].category,'活动');await c.adminCall('/admin/tickets/'+tickets.items[0].id,{status:'resolved',publicReply:'已核验',internalNote:'后台专用'});
 await support.onShow();assert.equal(support.data.profile.tickets[0].reply,'已核验');assert.equal((await profile()).messages[0].body,'已核验');assert.ok(!JSON.stringify(await profile()).includes('后台专用'));
});

test('formal native map uses official stops, same expiry rules and clears its polling lifecycle',async()=>{
 const wx={showToast(){},navigateTo(){}};const page=await native('pages/live/index',wx,{'../../services/content':{loadContent:async()=>({})},'../../services/api':{},'../../services/transit':{}});
 page.data.catalog={nodes:[{id:'fake',name:'不能作为公交坐标',mapPoint:{lat:30,lng:106,crs:'GCJ02'}}]};page.data.snapshot={route:routeFixture(6)};page.build('stations');assert.equal(page.data.markers.length,6);assert.equal(JSON.stringify(page.data.items),JSON.stringify(core.mapScene('stations',page.data.snapshot,page.data.catalog).items));
 page.data.snapshot={integration:{state:'connected'},thresholds:{staleMs:300},vehicles:[{id:'v',label:'v',locatedAt:NOW,mapPoint:{lat:30,lng:106,crs:'GCJ02'},freshness:'fresh'}]};page.build('vehicles');assert.equal(page.data.markers.length,0);assert.equal(page.data.items.length,1);
 page.visible=true;page.timer=setInterval(()=>{},1000);page.onHide();assert.equal(page.visible,false);
});
