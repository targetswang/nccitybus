import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import path from 'node:path';
import * as core from '../packages/client-core/index.mjs';import {referenceCatalog,routeFixture,eventFixture,NOW} from './helpers.mjs';
async function loadNative(file,{wx={},deps={}}={}){
 let page,component;const filename=path.resolve('apps/weapp/dist',file),code=await fs.readFile(filename,'utf8');const exports={};const module={exports};
 const sandbox={module,exports,wx,Page:p=>{page=p;},Component:c=>{component=c;},console,setTimeout,clearTimeout,getApp:()=>({globalData:{}}),getCurrentPages:()=>[],require:spec=>{if(spec.endsWith('client-core'))return core;if(spec in deps)return deps[spec];throw new Error('Unknown native dependency: '+spec);}};
 vm.runInNewContext(code,sandbox,{filename});return {page,component,module:module.exports};
}
test('ESM shared logic and generated mini-program CJS expose identical behavior',async()=>{
 const {module:cjs}=await loadNative('shared/client-core.js');assert.deepEqual(Object.keys(cjs).sort(),Object.keys(core).sort());
 assert.equal(JSON.stringify(cjs.decodeFavorites(['a','a',null])),JSON.stringify(core.decodeFavorites(['a','a',null])));
});
test('invalid routes/IDs never resolve to a different content object',async()=>{
 const c=await referenceCatalog();assert.equal(core.parseRoute('#not-real').page,'not-found');assert.equal(core.findItem(c,'pois','not-real'),null);assert.equal(core.findItem(c,'nodes','missing'),null);assert.equal(core.parseRoute('#bus').page,'live');
});
test('all category and node filters run against one canonical catalog, including former missing references',async()=>{
 const c=await referenceCatalog();for(const w of c.walks)for(const step of w.steps)assert.ok(core.findItem(c,'pois',step.poiId));
 const food=core.filterPois(c,'吃什么','1227');assert.equal(food.length,1);assert.equal(food[0].id,'1227-hotpot');
});
test('layer switch changes actual marker sets, not only a highlighted label',async()=>{
 const c=await referenceCatalog();c.pois[0].mapPoint={lat:30.7,lng:106.1,crs:'GCJ02'};c.pois[8].mapPoint={lat:30.71,lng:106.11,crs:'GCJ02'};
 const sights=core.mapScene('sights',null,c,NOW),food=core.mapScene('food',null,c,NOW);
 assert.notDeepEqual(sights.markers,food.markers);assert.equal(sights.markers[0].entityId,'golden-park');assert.equal(food.markers[0].entityId,'1227-chagee');
 assert.equal(core.mapScene('stations',{route:routeFixture(6)},null,NOW).markers.length,6);
});
test('map hides expired coordinates while keeping last-known list record',()=>{
 const e=eventFixture();const snapshot={serverTime:NOW,integration:{state:'connected'},thresholds:{freshMs:60,staleMs:300},vehicles:[{id:'v',label:'v',locatedAt:NOW,mapPoint:e.data.mapPoint,freshness:'fresh'}]};
 const current=core.mapScene('vehicles',snapshot,null,NOW+10),old=core.mapScene('vehicles',snapshot,null,NOW+301);assert.equal(current.markers.length,1);assert.equal(old.markers.length,0);assert.equal(old.items.length,1);
});
test('navigation only targets validated POI coordinates, never another station/first item',()=>{
 assert.equal(core.navigationTarget({name:'A',mapPoint:null}),null);assert.equal(core.navigationTarget({name:'A',mapPoint:{lat:30,lng:106,crs:'WGS84'}}),null);
 assert.equal(core.navigationTarget({name:'A',address:'B',mapPoint:{lat:30,lng:106,crs:'GCJ02'}}).name,'A');
});
test('legacy favorites preserved, invalid entries removed, no global cache clearing',()=>{
 assert.deepEqual(core.decodeFavorites('["golden-park","golden-park",13,null]'),['golden-park']);assert.deepEqual(core.decodeFavorites(core.encodeFavorites(['x'])),['x']);assert.deepEqual(core.decodeFavorites('broken'),[]);
});
test('native request failure rejects; no demo content fallback exists',async()=>{
 const {module:api}=await loadNative('services/api.js',{wx:{request:o=>o.fail()},deps:{'../shared/config':{apiBaseUrl:'https://test.invalid'}}});await assert.rejects(api.request('/content'),{code:'NETWORK_ERROR'});
 const noConfig=await loadNative('services/api.js',{deps:{'../shared/config':{apiBaseUrl:''}}});await assert.rejects(noConfig.module.request('/content'),{code:'API_NOT_CONFIGURED'});
});
test('native top-level navigation uses switchTab instead of destroying page stack with reLaunch',async()=>{
 const calls=[];const {component}=await loadNative('components/bottom-nav/index.js',{wx:{switchTab:o=>calls.push(o.url)}});
 component.methods.go.call({data:{},properties:{active:'home'}},{currentTarget:{dataset:{page:'explore'}}});assert.deepEqual(calls,['/pages/explore/index']);
});
test('native narration separates real audio playback and reading; text is not announced as playing',async()=>{
 const p=await fs.readFile('apps/weapp/dist/components/narration/index.wxml','utf8');assert.ok(p.includes('阅读讲解'));assert.equal(core.narrationAction({narration:'text',audioUrl:null}),'text');assert.equal(core.narrationAction({audioUrl:'/media/a.mp3'}),'audio');
 const js=await fs.readFile('apps/weapp/dist/components/narration/index.js','utf8');assert.ok(js.includes('createInnerAudioContext'));assert.ok(js.includes('destroy'));
});
test('shared design token compilation changes real mini-program styles, not a dead configuration file',async()=>{
 const {compileNativeStyle}=await import('../packages/design/render.mjs');const tokens=JSON.parse(await fs.readFile('packages/design/tokens.json','utf8'));const source=await fs.readFile('apps/weapp/src/app.wxss','utf8');const built=await fs.readFile('apps/weapp/dist/app.wxss','utf8');assert.equal(compileNativeStyle(source,tokens),built);assert.ok(compileNativeStyle(source,{...tokens,brand:'#123456'}).includes('#123456'));assert.equal(/__[A-Z_]+__/.test(built),false);
});
