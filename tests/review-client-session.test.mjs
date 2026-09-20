import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {database,referenceCatalog} from './helpers.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
import {UnifiedAuthService} from '../packages/core/auth-unified.mjs';
import {createApi} from '../apps/api/server.mjs';

async function setup(t,phone){
 const ctx=await database();t.after(()=>ctx.db.close());await new ContentService(ctx.db,ctx.repo).importCatalog(await referenceCatalog(),{publish:true});
 const auth=new UnifiedAuthService(ctx.db,ctx.config),c=await auth.requestChallenge(phone),login=await auth.verifyChallenge({...c,code:'246810'});
 const server=createApi({config:ctx.config,repository:ctx.repo});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=async(path,{method='GET',data,token}={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error.message),body.error);return body;};
 return {...ctx,auth,login,request};
}
test('R6 H5 actual hook sends token for profile/action/logout, rejects malformed cached sessions',async t=>{
 const {auth,login,request}=await setup(t,'13900006001');const values=[];let cursor=0;const storage=new Map();
 const React={useState:init=>{const i=cursor++;if(!(i in values))values[i]=typeof init==='function'?init():init;return [values[i],v=>values[i]=v];},useRef:init=>({current:init}),useCallback:f=>f,useEffect:()=>{}};
 const code=(await fs.readFile('apps/h5/src/services/visitor.mjs','utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const sandbox={React,request,Date,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.createContext(sandbox);vm.runInContext(code+'\nglobalThis.hooks={useVisitor,readVisitorSession};',sandbox);
 const render=()=>{cursor=0;return sandbox.hooks.useVisitor();};let visitor=render();visitor.accept(login);visitor=render();
 assert.equal((await visitor.refresh()).user.id,login.user.id);
 await visitor.perform('favorite',{id:'golden-park',operation:'add'});assert.ok((await visitor.refresh()).favorites.includes('golden-park'));
 await visitor.perform('ticket',{description:'Review regression feedback',category:'测试'});assert.equal((await visitor.refresh()).tickets.length,1);
 await visitor.logout();await assert.rejects(auth.session(login.token),{code:'UNAUTHORIZED'});assert.equal(sandbox.hooks.readVisitorSession(),null);
 storage.set('nc.visitor.session.v1',JSON.stringify({expiresAt:Date.now()+10000,user:{audience:'user'},session:'obsolete'}));assert.equal(sandbox.hooks.readVisitorSession(),null);
});

test('R6 formal mini-program source uses token and revokes on logout through real HTTP API',async t=>{
 const {auth,login,request}=await setup(t,'13900006002');const storage=new Map();
 const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>{const p=new URL(o.url).pathname.replace('/api/v1','');const token=String(o.header?.Authorization||'').replace(/^Bearer\s+/i,'')||undefined;request(p,{method:o.method,data:o.data,token}).then(data=>o.success({statusCode:200,data})).catch(e=>o.success({statusCode:401,data:{error:{code:e.code,message:e.message}}}));}};
 const compile=async(file,deps)=>{const code=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:n=>deps[n],wx,Date,Error});return exports;};
 const api=await compile('apps/weapp-native/services/api.ts',{'./config':{CONFIG:{apiBaseUrl:'https://local-test.invalid'}}});
 const session=await compile('apps/weapp-native/services/session.ts',{'./api':api});
 session.saveSession(login);assert.equal((await session.readProfile()).user.id,login.user.id);
 await api.meAction(session.readSession().token,'favorite',{id:'golden-park',operation:'add'});assert.ok((await session.readProfile()).favorites.includes('golden-park'));
 await api.meAction(session.readSession().token,'ticket',{description:'Native feedback regression',category:'测试'});assert.equal((await session.readProfile()).tickets.length,1);
 await session.logoutSession();await assert.rejects(auth.session(login.token),{code:'UNAUTHORIZED'});assert.equal(session.readSession(),null);
 // Logout failures retain a retryable session rather than claiming server revocation.
 session.saveSession({...login,token:'unknown-token-at-least-twenty-characters'});
 const failed=await compile('apps/weapp-native/services/session.ts',{'./api':{...api,logout:async()=>{throw new Error('offline');}}});
 await assert.rejects(failed.logoutSession(),/offline/);assert.ok(failed.readSession());
});
