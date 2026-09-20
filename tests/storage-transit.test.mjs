import {validateCatalog} from '../packages/contracts/index.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {openDatabase,migrate} from '../packages/storage/database.mjs';import {Repository} from '../packages/storage/repository.mjs';
import {freshness,remainingStops,liveSnapshot,arrivals} from '../packages/core/transit.mjs';
import {database,routeFixture,eventFixture,referenceCatalog,testConfig,NOW,tempDirectory} from './helpers.mjs';

test('catalog has 21 POIs, 4 complete walks, all step references and tips',async()=>{
 const {repo,db}=await database();try{const c=await referenceCatalog();await repo.publishCatalog(c);assert.equal(c.pois.length,21);assert.equal(c.walks.length,4);assert.equal(c.walks.reduce((n,w)=>n+w.steps.length,0),9);assert.deepEqual(await repo.catalog(),c);}finally{await db.close();}
});
test('immutable content version prevents silent mutation; explicit rollback restores previous release',async()=>{
 const {repo,db}=await database();try{const a=await referenceCatalog();await repo.publishCatalog(a);const b=structuredClone(a);b.routeName='mutated';await assert.rejects(repo.publishCatalog(b),{code:'IMMUTABLE_VERSION'});b.version='test-version-2';await repo.publishCatalog(b);await repo.rollbackCatalog(a.version);assert.equal((await repo.catalog()).routeName,a.routeName);}finally{await db.close();}
});
test('freshness uses device time; expiry keeps last-known position',async()=>{
 const {repo,db,config}=await database();try{
  await repo.publishRoute(routeFixture());await repo.setState('mqtt:test-operator',{state:'connected'},NOW);await repo.setState('worker:test-operator',{state:'running'},NOW);
  await repo.acceptEvent(eventFixture());let live=await liveSnapshot(repo,config,'jialing-loop',NOW+10);assert.equal(live.freshness,'fresh');
  live=await liveSnapshot(repo,config,'jialing-loop',NOW+120000);assert.equal(live.freshness,'stale');assert.equal(live.integration.reason,'WORKER_HEARTBEAT_EXPIRED');
  await repo.housekeeping(NOW+8*86400000);live=await liveSnapshot(repo,config,'jialing-loop',NOW+8*86400000);assert.equal(live.vehicles.length,1);assert.equal(live.freshness,'unavailable');assert.equal(live.vehicles[0].etaMinutes,null);
 }finally{await db.close();}
});
test('duplicate, out-of-order, equal-time conflicting events are rejected independently per stream',async()=>{
 const {repo,db}=await database();try{
  const a=eventFixture();assert.equal(await repo.acceptEvent(a),'accepted');assert.equal(await repo.acceptEvent({...a,receivedAt:NOW+99}),'duplicate');
  assert.equal(await repo.acceptEvent(eventFixture('location',NOW-1)),'out_of_order');const conflict=structuredClone(a);conflict.data.speed=100;assert.equal(await repo.acceptEvent(conflict),'same_time_conflict');
  assert.equal(await repo.acceptEvent(eventFixture('stop',NOW-10000)),'accepted');const list=await repo.latest('test-operator');assert.equal(list.length,2);assert.equal(list.find(x=>x.stream==='location').data.speed,15);
 }finally{await db.close();}
});
test('arrivals require fresh real stop evidence and a healthy ingestion process, never synthesize minutes',async()=>{
 const {repo,db,config}=await database();try{
  await repo.publishRoute(routeFixture());await repo.acceptEvent(eventFixture());await repo.acceptEvent(eventFixture('stop'));
  assert.equal((await arrivals(repo,config,'jialing-loop','S3',NOW)).items.length,0);
  await repo.setState('mqtt:test-operator',{state:'connected'},NOW);await repo.setState('worker:test-operator',{state:'running'},NOW);
  const a=await arrivals(repo,config,'jialing-loop','S3',NOW);assert.equal(a.items[0].remainingStops,1);assert.equal(a.items[0].etaMinutes,null);
  assert.equal((await arrivals(repo,config,'jialing-loop','S3',NOW+60001)).items.length,0);
 }finally{await db.close();}
});
test('stop occurrence supports circular terminal duplicate, reverse order and sixth stop without UI edits',()=>{
 const branch=routeFixture(6).branches[0];assert.equal(remainingStops(branch,{stationSN:6,stationCode:'S6',action:'leave'},'S1'),1);
 assert.equal(remainingStops(branch,{stationSN:2,stationCode:'S2',action:'entry'},'S2'),0);
 assert.equal(remainingStops(branch,{stationSN:2,stationCode:'S2',action:'leave'},'S2'),6);
 branch.stops.push({...branch.stops[0],sequence:7});assert.equal(remainingStops(branch,{stationSN:7,stationCode:'S1',action:'entry'},'S2'),1);
 assert.equal(remainingStops(branch,{stationSN:2,stationCode:'wrong',action:'leave'},'S3'),null);
 branch.circular=false;assert.equal(remainingStops(branch,{stationSN:4,stationCode:'S4',action:'leave'},'S2'),null);
});
test('two processes/connections share persistence; leases survive until expiry and prevent duplicate owner',async()=>{
 const tmp=await tempDirectory(),config={...testConfig(),sqlitePath:path.join(tmp,'data.sqlite')};let a,b;
 try{a=await openDatabase(config);await migrate(a);b=await openDatabase(config);await migrate(b);const ra=new Repository(a),rb=new Repository(b);
  assert.equal(await ra.lease('ivy','A',NOW,30000),true);assert.equal(await rb.lease('ivy','B',NOW+10,30000),false);
  await ra.acceptEvent(eventFixture());assert.equal((await rb.latest('test-operator')).length,1);await a.close();a=null;
  assert.equal(await rb.lease('ivy','B',NOW+30001,30000),true);assert.equal((await rb.latest('test-operator'))[0].time,NOW);
 }finally{if(a)await a.close();if(b)await b.close();await fs.rm(tmp,{recursive:true,force:true});}
});
test('invalid route cannot replace the last complete published version',async()=>{
 const {repo,db}=await database();try{const original=routeFixture();const version=await repo.publishRoute(original);const broken=routeFixture();broken.branches[0].stops.splice(1,1);await assert.rejects(repo.publishRoute(broken),{code:'INCOMPLETE_SEQUENCE'});assert.equal((await repo.route(original.id)).version,version);}finally{await db.close();}
});
test('null, stale, future and unavailable states stay distinct',()=>{assert.equal(freshness(null,NOW,60,300),'no_data');assert.equal(freshness(NOW+1,NOW,60,300),'unavailable');assert.equal(freshness(NOW-61,NOW,60,300),'stale');});
test('sync acknowledgement is compare-and-swap; a new request cannot be lost mid-sync',async()=>{
 const {repo,db}=await database();try{const key='sync-request:test-operator';await repo.setState(key,{pending:true,requestedAt:1},1);const old=await repo.state(key);await repo.setState(key,{pending:true,requestedAt:2},2);assert.equal(await repo.acknowledgeSync(key,old,3),false);assert.equal((await repo.state(key)).pending,true);assert.equal(await repo.acknowledgeSync(key,await repo.state(key),4),true);assert.equal((await repo.state(key)).pending,false);}finally{await db.close();}
});

test('expired or replaced worker lease cannot commit a real-time event', async () => {
 const {repo,db}=await database();
 try {
  const e=eventFixture(),key=`ivy:${e.operatorId}`;
  await repo.lease(key,'old',NOW,100);
  assert.equal(await repo.acceptEvent(e,NOW+1,{key,owner:'old'}),'accepted');
  const next={...e,time:e.time+1};
  await assert.rejects(repo.acceptEvent(next,NOW+101,{key,owner:'old'}),{code:'LEASE_LOST'});
  assert.equal(await repo.lease(key,'new',NOW+101,100),true);
  await assert.rejects(repo.acceptEvent(next,NOW+102,{key,owner:'old'}),{code:'LEASE_LOST'});
  assert.equal(await repo.acceptEvent(next,NOW+102,{key,owner:'new'}),'accepted');
 } finally { await db.close(); }
});
test('changing only the publication label cannot approve inherited content or foreign media', async () => {
 const c=await referenceCatalog();c.publication='approved';
 assert.throws(()=>validateCatalog(c));
 c.approval={reviewedBy:'test-only',reviewedAt:NOW,evidence:'unit test, not actual operator approval'};
 for(const p of c.pois){p.publication='approved';p.source={status:'approved',verifiedAt:NOW};}
 for(const w of c.walks)w.source={status:'approved',verifiedAt:NOW};
 assert.equal(validateCatalog(c),c);
 c.pois[0].cover='https://external.invalid/photo.jpg';assert.throws(()=>validateCatalog(c),{code:'UNOWNED_MEDIA'});
});

test('slow synchronization cannot publish a new route after its worker loses the lease', async () => {
 const {repo,db}=await database();
 try {
  const r=routeFixture(),key='ivy:'+r.operatorId;
  await repo.lease(key,'old',NOW,100);
  const version=await repo.publishRoute(r,NOW+1,{key,owner:'old'});
  await repo.lease(key,'new',NOW+101,100);
  await assert.rejects(repo.publishRoute({...r,name:'new'},NOW+102,{key,owner:'old'}),{code:'LEASE_LOST'});
  assert.equal((await repo.route(r.id)).version,version);
 }finally{await db.close();}
});
