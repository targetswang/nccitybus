import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {signature,encrypt,decodeEnvelope,verifySignature,decrypt,signedEnvelope} from '../packages/ivy/crypto.mjs';
import {IvyClient} from '../packages/ivy/http-client.mjs';import {synchronizeRoute} from '../packages/ivy/sync.mjs';import {normalizeEvent} from '../packages/ivy/events.mjs';import {AmapConverter} from '../packages/ivy/coordinates.mjs';import {createMessageHandler} from '../packages/ivy/mqtt-runner.mjs';
import {database,routeFixture,eventFixture,testConfig,IVY,NOW,mapping} from './helpers.mjs';

test('HTTP client performs actual signed encrypted POST against isolated test server',async()=>{
 let bodySeen;
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;bodySeen=raw;const u=new URL(req.url,'http://test');try{const body=JSON.parse(raw);verifySignature(IVY,u.searchParams.get('timestamp'),u.searchParams.get('nonce'),body.encrypt,u.searchParams.get('signature'));assert.deepEqual(JSON.parse(decrypt(IVY,body.encrypt)),{identifierType:'code',identifiers:['TEST-LINE']});const e=signedEnvelope(IVY,JSON.stringify([{id:'900000000000000001',code:'TEST-LINE'}]));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'0',timestamp:e.timestamp,nonce:e.nonce,signature:e.signature,result:{encrypt:e.encrypt}}));}catch{res.writeHead(401);res.end('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const client=new IvyClient({...IVY,host:`http://127.0.0.1:${server.address().port}`,timeoutMs:2000});assert.equal((await client.call('line',{identifierType:'code',identifiers:['TEST-LINE']}))[0].id,'900000000000000001');assert.ok(bodySeen.includes('encrypt'));}finally{await new Promise(r=>server.close(r));}
});
test('business rejection, malformed response and signature mismatch do not return seed data',async()=>{
 const conf={...IVY,host:'https://example.invalid'};
 await assert.rejects(new IvyClient(conf,async()=>new Response('{"code":"403","msg":"denied"}')).call('line',{}),{code:'IVY_REJECTED'});
 await assert.rejects(new IvyClient(conf,async()=>new Response('not json')).call('line',{}),{code:'IVY_BAD_JSON'});
 const env=signedEnvelope(IVY,'[]');await assert.rejects(new IvyClient(conf,async()=>Response.json({code:'0',...env,signature:'0'.repeat(40),result:{encrypt:env.encrypt}})).call('line',{}),{code:'BAD_SIGNATURE'});
});
test('cursor pagination collects completely; repeated cursor aborts',async()=>{
 const c=new IvyClient(IVY);let n=0;c.call=async()=>++n===1?{list:[1],hasMore:true,nextCursor:'A'}:{list:[2],hasMore:false};assert.deepEqual(await c.pages('lines'),[1,2]);
 c.call=async()=>({list:[1],hasMore:true,nextCursor:'A'});await assert.rejects(c.pages('lines'),{code:'IVY_BAD_CURSOR'});
});
test('line/branch/stop synchronization only publishes complete data; failure preserves last version',async()=>{
 const {repo,db}=await database();try{
  const base=routeFixture();const version=await repo.publishRoute(base),b=base.branches[0];
  const line={id:base.externalId,code:base.lineCode,name:'供应商线路',type:1,branches:[{id:'999999999999999999',code:'101',stationsOfUp:b.stops.map(s=>({id:s.id,sn:s.sequence})),trackOfUp:b.track}]};
  const full=b.stops.map(s=>({id:s.id,code:s.code,name:s.name,lat:s.rawPoint.lat,lng:s.rawPoint.lng}));
  const converter={convert:async p=>p.map(()=>null)};
  await assert.rejects(synchronizeRoute({call:async n=>n==='lineDetail'?[line]:full.slice(0,3)},converter,repo,'test-operator',mapping),{code:'INCOMPLETE_ROUTE'});
  assert.equal((await repo.route(base.id)).version,version);
  const next=await synchronizeRoute({call:async n=>n==='lineDetail'?[line]:full},converter,repo,'test-operator',mapping);
  assert.equal(next.route.branches[0].stops.length,5);assert.deepEqual(next.route.branches[0].mapTrack,[]);assert.equal(next.route.externalId,'900000000000000001');
  line.id=900000000000000001;await assert.rejects(synchronizeRoute({call:async()=>[line]},converter,repo,'test-operator',mapping),{code:'INVALID_PAYLOAD'});
 }finally{await db.close();}
});
test('missing conversion key retains raw WGS84 and returns no invented GCJ02 coordinates',async()=>{
 const raw={lat:30.7,lng:106.1,crs:'WGS84'};assert.deepEqual(await new AmapConverter('').convert([raw]),[null]);assert.equal(raw.crs,'WGS84');
 const converter=new AmapConverter('test-only',async()=>Response.json({status:'1',locations:'106.12,30.72'}));assert.deepEqual(await converter.convert([raw]),[{lat:30.72,lng:106.12,crs:'GCJ02'}]);
 await assert.rejects(new AmapConverter('test-only',async()=>Response.json({status:'1',locations:'106.12,30.72'})).convert([raw,raw]),{code:'MAP_CONVERSION_FAILED'});
});
function wirePayload(type='vehicle_location',patch={}){return signedEnvelope(IVY,JSON.stringify({type,timestamp:NOW,data:{code:'TEST-VEHICLE',lineCode:'TEST-LINE',branchCode:101,direction:'upward',time:NOW-10000,latitude:30.7,longitude:106.1,accStatus:3,speed:0,...patch}}),NOW);}
test('event scope, event type, ACC, future device time and stop action are validated',async()=>{
 const c=testConfig(),converter=new AmapConverter('');let e=await normalizeEvent(c,wirePayload(),converter,NOW);assert.equal(e.time,NOW-10000);assert.equal(e.data.mapPoint,null);assert.equal(e.data.operationState,'unknown');
 for(const [patch,code] of [[{lineCode:'not-authorized'},'OUT_OF_SCOPE'],[{accStatus:7},'UNKNOWN_ACC_STATUS'],[{time:NOW+30001},'FUTURE_EVENT']])await assert.rejects(normalizeEvent(c,wirePayload('vehicle_location',patch),converter,NOW),{code});
 await assert.rejects(normalizeEvent(c,wirePayload('vehicle_stop',{stationCode:'S1',stationSN:1,action:'guess'}),converter,NOW),{code:'INVALID_ACTION'});
 await assert.rejects(normalizeEvent(c,wirePayload('something_else'),converter,NOW),{code:'UNKNOWN_EVENT'});
});
test('MQTT processing ACK follows durable commit; invalid topic/type is quarantined',async()=>{
 const c=testConfig();let committed=false;const audits=[];
 const repo={acceptEvent:async()=>{await new Promise(r=>setTimeout(r,10));committed=true;return 'accepted';},recordAudit:async(k,v)=>audits.push(v)};
 const handler=createMessageHandler({config:c,repository:repo,converter:new AmapConverter(''),now:()=>NOW});
 await new Promise((resolve,reject)=>handler.handle({topic:'vehicle_location',payload:Buffer.from(JSON.stringify(wirePayload()))},e=>{try{assert.equal(e,undefined);assert.equal(committed,true);resolve();}catch(x){reject(x);}}));
 await new Promise(resolve=>handler.handle({topic:'vehicle_stop',payload:Buffer.from(JSON.stringify(wirePayload()))},()=>resolve()));assert.ok(audits.includes('TOPIC_TYPE_MISMATCH'));
});
test('storage failure returns a failed MQTT acknowledgement, not false success',async()=>{
 const handler=createMessageHandler({config:testConfig(),repository:{acceptEvent:async()=>{throw new Error('database unavailable');}},converter:new AmapConverter(''),now:()=>NOW});
 const err=await new Promise(resolve=>handler.handle({topic:'vehicle_location',payload:Buffer.from(JSON.stringify(wirePayload()))},resolve));assert.equal(err.message,'database unavailable');
});
