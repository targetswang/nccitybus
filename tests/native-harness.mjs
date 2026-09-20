import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {database,referenceCatalog} from './helpers.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
import {createApi} from '../apps/api/server.mjs';
import * as core from '../packages/client-core/index.mjs';
export async function native(file,wx,deps={}){
 const pageState=file==='services/page-state'?null:await native('services/page-state',wx);
 const exports={};let page;
 vm.runInNewContext(await fs.readFile('dist/weapp-native/'+file+'.js','utf8'),{exports,wx,Page:p=>page=p,require:n=>{if(n.endsWith('client-core'))return core;if(n.endsWith('page-state'))return pageState;if(n in deps)return deps[n];throw Error(n);},Date,Error,console,setInterval,clearInterval,setTimeout:()=>0,clearTimeout:()=>{}});
 if(page){page.data=structuredClone(page.data);page.setData=patch=>Object.assign(page.data,patch);}
 return page||exports;
}
export async function setup(t){
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
