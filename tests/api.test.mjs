import test from 'node:test';import assert from 'node:assert/strict';
import {createApi} from '../apps/api/server.mjs';import {signedEnvelope,decodeEnvelope} from '../packages/ivy/crypto.mjs';
import {database,referenceCatalog,routeFixture,eventFixture,IVY} from './helpers.mjs';
async function setup(t,{publish=true,production=false}={}){
 const {db,repo,config}=await database();config.production=production;config.adminToken='test-admin-token-only-32-characters';config.wechatAppId='test-app';config.wechatAppSecret='test-secret';config.publicBaseUrl='https://nanchong.test';
 if(publish)await repo.publishCatalog(await referenceCatalog());
 const transport=async url=>{const u=new URL(url);return Response.json(u.searchParams.get('js_code')==='invalid'?{errcode:40029}:{openid:'test-openid-'+u.searchParams.get('js_code'),session_key:'must-not-return'});};
 const server=createApi({config,repository:repo,transport});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});
 const req=async(p,options={})=>{const r=await fetch(base+'/api/v1'+p,options);const text=await r.text();return {status:r.status,headers:r.headers,data:text?JSON.parse(text):null};};
 const login=async who=>(await req('/auth/wechat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:who})})).data;
 return {db,repo,config,server,req,login,base};
}
test('API without credentials exposes no synthetic vehicles and correct independent capabilities',async t=>{
 const {req}=await setup(t);const live=await req('/transit/live');assert.equal(live.status,200);assert.deepEqual(live.data.vehicles,[]);assert.equal(live.data.freshness,'no_data');assert.equal(live.data.route,null);
 const caps=await req('/capabilities');assert.equal(caps.data.transitCode.configured,false);assert.equal(caps.data.routes.length,1);assert.equal(caps.data.routes[0].id,'jialing-loop');assert.equal(JSON.stringify(caps.data).includes('test-secret'),false);
});
test('content failure does not blank transit; bad IDs produce 404 rather than first item',async t=>{
 const {req}=await setup(t,{publish:false});assert.equal((await req('/content')).status,503);assert.equal((await req('/transit/live')).status,200);assert.equal((await req('/transit/live?routeId=not-a-route')).status,404);
});
test('full content and paginated POIs share immutable version, no provenance or secret leakage',async t=>{
 const {req}=await setup(t);const all=await req('/content');assert.equal(all.data.pois.length,21);assert.equal(all.data.walks.length,4);
 assert.ok(all.data.pois.every(p=>!('mediaCandidate' in p)));assert.equal((await req('/content/pois/not-real')).status,404);
 const one=await req('/content/pois?limit=2');assert.equal(one.data.items.length,2);assert.equal(one.data.version,all.data.version);
 const two=await req('/content/pois?limit=2&cursor='+encodeURIComponent(one.data.nextCursor));assert.ok(two.data.items.every(x=>!one.data.items.some(y=>x.id===y.id)));
 assert.equal((await req('/content/pois?limit=2&category=other&cursor='+encodeURIComponent(one.data.nextCursor))).status,409);
 assert.equal((await req('/content/pois?limit=abc')).status,400);
 assert.equal(all.headers.get('cache-control'),'no-store');assert.equal((await req('/content',{headers:{'If-None-Match':'old-content-version'}})).status,200);
});
test('reference content is never auto-approved for production',async t=>{
 const {req}=await setup(t,{production:true});assert.equal((await req('/content')).status,503);assert.equal((await req('/health')).status,200);
});
test('authentication and account favorites: unauthorized denial, ownership, persistence and logout',async t=>{
 const {req,login}=await setup(t);assert.equal((await req('/me/favorites')).status,401);
 const a=await login('alice'),b=await login('bob');assert.ok(a.token);assert.equal(a.openid,undefined);assert.equal(a.session_key,undefined);
 const auth={Authorization:'Bearer '+a.token,'Content-Type':'application/json'};
 assert.equal((await req('/me/favorites',{method:'POST',headers:auth,body:JSON.stringify({ids:['golden-park']})})).status,200);
 assert.deepEqual((await req('/me/favorites',{headers:auth})).data.ids,['golden-park']);
 assert.deepEqual((await req('/me/favorites',{headers:{Authorization:'Bearer '+b.token}})).data.ids,[]);
 assert.equal((await req('/me/favorites',{method:'POST',headers:auth,body:JSON.stringify({ids:['missing']})})).status,404);
 await req('/me/favorites/golden-park',{method:'DELETE',headers:auth});assert.deepEqual((await req('/me/favorites',{headers:auth})).data.ids,[]);
 await req('/auth/logout',{method:'POST',headers:auth});assert.equal((await req('/me/favorites',{headers:auth})).status,401);
});
test('invalid login code never creates a pretend user or session',async t=>{
 const {req,db}=await setup(t);const r=await req('/auth/wechat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'invalid'})});assert.equal(r.status,401);assert.equal((await db.query('SELECT id FROM users')).length,0);
});
test('admin separation, origin restriction, malformed bodies and path guards',async t=>{
 const {req,base,config}=await setup(t);assert.equal((await req('/admin/integrations')).status,401);
 assert.equal((await req('/admin/integrations',{headers:{Authorization:'Bearer '+config.adminToken}})).status,200);
 assert.equal((await req('/auth/wechat',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'})).status,403);
 assert.equal((await req('/auth/wechat',{method:'POST',headers:{Origin:'https://nanchong.test'},body:'!'})).status,400);
 assert.equal((await req('/auth/wechat',{method:'POST',body:'x'.repeat(17000)})).status,413);
 assert.equal((await fetch(base+'/%2e%2e%2f.env')).status,404);assert.equal((await fetch(base+'/%ZZ')).status,400);
});
test('real protocol hello response is encrypted success; invalid signature is denied',async t=>{
 const {req,config,repo}=await setup(t);const wire=signedEnvelope(config.ivy,JSON.stringify({type:'hello',timestamp:Date.now()}));
 const query='?timestamp='+wire.timestamp+'&nonce='+wire.nonce+'&signature='+wire.signature;
 const r=await req('/integrations/ivy/events'+query,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encrypt:wire.encrypt})});
 assert.equal(r.status,200);assert.equal(decodeEnvelope(config.ivy,r.data),'success');assert.equal(await repo.state('sync-request:test-operator'),null);
 const bad=await req('/integrations/ivy/events'+query.replace(wire.signature,'0'.repeat(40)),{method:'POST',body:JSON.stringify({encrypt:wire.encrypt})});assert.equal(bad.status,401);
});
test('schedule webhook persists a sync request before acknowledging',async t=>{
 const {req,config,repo}=await setup(t);const w=signedEnvelope(config.ivy,JSON.stringify({type:'schedule_release',timestamp:Date.now(),data:{releases:[]}}));
 const r=await req(`/integrations/ivy/events?timestamp=${w.timestamp}&nonce=${w.nonce}&signature=${w.signature}`,{method:'POST',body:JSON.stringify({encrypt:w.encrypt})});assert.equal(r.status,200);assert.equal((await repo.state('sync-request:test-operator')).pending,true);
});
