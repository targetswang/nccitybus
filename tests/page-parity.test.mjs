import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {native,setup} from './native-harness.mjs';
import {displayTime,mapScene,serviceDisabled} from '../packages/client-core/index.mjs';
const event=id=>({currentTarget:{dataset:{id}}});

test('published services without legacy availability are usable; capacity/time/cancellation are recomputed',async t=>{
 const c=await setup(t),catalog=await c.repo.catalog();
 catalog.version='availability-fixture';catalog.benefits=[{id:'benefit',name:'权益',rules:'规则',capacity:1}];catalog.events=[{id:'cancel',title:'已取消活动',registration:'free',operationalStatus:'cancelled',cancellationReason:'天气原因'},{id:'future',title:'未来活动',registration:'free',startsAt:new Date(Date.now()+86400000).toISOString()},{id:'ended',title:'结束活动',registration:'free',endsAt:'2020-01-01T00:00:00Z'}];
 await c.repo.publishCatalog(catalog);const first=await c.request('/content');assert.equal(first.benefits[0].availability,'active');assert.equal(serviceDisabled(first.benefits[0]),false);assert.deepEqual(first.events.map(e=>e.availability),['cancelled','upcoming','expired']);
 const rights=await native('pages/rights/index',c.wx,{'../../services/api':c.api,'../../services/session':c.session});rights.onLoad({});await rights.onShow();assert.equal(rights.data.benefits[0].availability,'active');await rights.claim(event('benefit'));assert.equal(rights.data.error,'');assert.equal(rights.data.profile.grants[0].expiry,'长期有效');
 const after=await c.request('/content');assert.equal(after.version,first.version);assert.equal(after.benefits[0].availability,'full');assert.equal(serviceDisabled(after.benefits[0]),true);
 const source=(await fs.readFile('apps/h5/src/pages/ServicePages.mjs','utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const h=(type,props,...children)=>({type,props:props||{},children});const sandbox={h,React:{useState:v=>[v,()=>{}]},serviceDisabled,dt:displayTime};vm.createContext(sandbox);vm.runInContext(source+';globalThis.EventsPage=EventsPage;',sandbox);
 const tree=sandbox.EventsPage({catalog:after,visitor:{session:c.user,profile:null,busy:false}});const nodes=[];const walk=n=>{if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.children);}};walk(tree);assert.ok(nodes.filter(n=>n.type==='button'&&n.children.includes('免费报名')).every(n=>n.props.disabled));assert.ok(JSON.stringify(tree).includes('天气原因'));
});

test('native feedback blocks double clicks; API replays retries and rejects reusing key for different text',async t=>{
 const c=await setup(t);let resolve;let calls=0;const deps={'../../services/api':{...c.api,meAction:async(...args)=>{calls++;await new Promise(r=>resolve=r);return c.api.meAction(...args);}},'../../services/session':c.session};
 const page=await native('pages/support/index',c.wx,deps);page.data.description='防止重复提交测试';const first=page.submit();assert.equal(page.data.busy,true);await page.submit();assert.equal(calls,1);resolve();await first;assert.equal(page.data.busy,false);assert.equal((await c.session.readProfile()).tickets.length,1);
 const payload={action:'ticket',category:'活动',description:'安全重试测试',idempotencyKey:'retry-key-123456789',_session:c.user.token};
 const [a,b]=await Promise.all([1,2].map(()=>c.request('/me/action',{method:'POST',data:payload})));assert.equal(a.record.id,b.record.id);assert.equal((await c.session.readProfile()).tickets.length,2);
 await assert.rejects(c.request('/me/action',{method:'POST',data:{...payload,description:'不同内容不能复用'}}),{code:'IDEMPOTENCY_CONFLICT'});
});

test('native network retry retains same idempotency key until an acknowledged response',async()=>{
 const requests=[];let fail=true;
 const api=await native('services/api',{request:o=>{requests.push(o.data);if(fail)o.fail({errMsg:'lost response'});else o.success({statusCode:200,data:{saved:true}});}},{'./config':{CONFIG:{apiBaseUrl:'https://fixture.invalid'}}});
 await assert.rejects(api.meAction('token','ticket',{description:'重试'}));fail=false;await api.meAction('token','ticket',{description:'重试'});assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);await api.meAction('token','ticket',{description:'重试'});assert.notEqual(requests[1].idempotencyKey,requests[2].idempotencyKey);
});

test('root page recreation restores filters, shared mode and scroll without retaining private profile',async()=>{
 const scrolls=[];const wx={nextTick:f=>f(),pageScrollTo:p=>scrolls.push(p.scrollTop)};const {retainPage}=await native('services/page-state',wx);
 const make=()=>{const page=retainPage({data:{mode:'walks',category:'全部',nodeId:'all',profile:{secret:'not retained'}},onShow(){}},'explore',['mode','category','nodeId'],0);page.setData=p=>Object.assign(page.data,p);return page;};
 const first=make();await first.onShow();first.setData({mode:'places',category:'吃什么',nodeId:'1227'});first.onPageScroll({scrollTop:640});first.onUnload();const next=make();next.data.profile=null;await next.onShow();assert.equal(next.data.category,'吃什么');assert.equal(next.data.nodeId,'1227');assert.equal(next.data.mode,'places');assert.equal(next.data.profile,null);assert.deepEqual(scrolls,[640]);
});

test('map marker and list enter the same detail; polling does not reset chosen viewport',async()=>{
 const urls=[];const page=await native('pages/live/index',{navigateTo:o=>urls.push(o.url)},{'../../services/content':{},'../../services/api':{},'../../services/transit':{}});
 page.data.catalog={pois:[{id:'poi-one',name:'地点',category:'看什么',mapPoint:{lat:30.7,lng:106.1,crs:'GCJ02'}}]};page.data.layer='sights';page.build('sights');page.setData({mapLat:31,mapLng:107,mapPositioned:true});page.build('sights');assert.equal(page.data.mapLat,31);
 page.markerTap({detail:{markerId:page.data.markers[0].id}});page.openItem(event('poi-one'));assert.deepEqual(urls,['/pages/poi/index?id=poi-one','/pages/poi/index?id=poi-one']);
 const template=await fs.readFile('apps/weapp-native/pages/live/index.wxml','utf8');assert.match(template,/bindmarkertap="markerTap"/);
});

test('published cover, missing favorites and formatted messages reach native pages',async t=>{
 const c=await setup(t),catalog=await c.request('/content');catalog.pois[0].cover='https://example.invalid/cover.webp';catalog.walks[0].coverPoiId=catalog.pois[0].id;
 const detail=await native('pages/walk/index',c.wx,{'../../services/content':{loadContent:async()=>catalog},'../../services/navigation':{}});detail.onLoad({id:catalog.walks[0].id});await detail.onShow();assert.equal(detail.data.cover,catalog.pois[0].cover);assert.equal(detail.data.pois[catalog.pois[0].id].cover,catalog.pois[0].cover);
 const favorites=await native('pages/favorites/index',c.wx,{'../../services/content':{loadContent:async()=>catalog},'../../services/storage':{getFavorites:()=>['removed-id']},'../../services/session':{readSession:()=>null}});await favorites.onShow();assert.equal(favorites.data.missing,1);
 const created=await c.adminCall('/admin/messages',{userId:c.user.user.id,title:'消息测试',body:'消息正文'});const messages=await native('pages/messages/index',c.wx,{'../../services/api':c.api,'../../services/session':c.session});await messages.onShow();assert.equal(messages.data.profile.messages[0].time,displayTime(created.createdAt));await messages.read(event(created.id));assert.equal(messages.data.profile.messages[0].read,true);
});
