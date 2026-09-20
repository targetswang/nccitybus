import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadConfig} from '../packages/core/config.mjs';
import {openDatabase,migrate} from '../packages/storage/database.mjs';
import {Repository} from '../packages/storage/repository.mjs';
export const NOW=1789788000000;
export const IVY={appKey:'test-app-only',appSecret:'test-secret-not-production',aesKey:Buffer.from('0123456789abcdef0123456789abcdef').toString('base64').replace(/=$/,''),signatureMaxAgeMs:300000,futureMs:30000,envelope:'signed-json-v1',httpEncrypt:true,timeoutMs:100};
export const mapping={id:'jialing-loop',name:'嘉陵江城市漫游环线',lineCode:'TEST-LINE',branchCode:'101',directions:['upward'],tourismLinks:{S1:'golden',S2:'qinghui',S3:'1227',S4:'wangfujing',S5:'wetland'},vehicleAllowlist:[]};
export function testConfig(root=process.cwd()){
 const c=loadConfig({SQLITE_PATH:':memory:'},root);c.sqlitePath=':memory:';
 return {...c,ivy:{...c.ivy,...IVY,host:'http://127.0.0.1:0',locationTopic:'vehicle_location',stopTopic:'vehicle_stop'},transit:{operatorId:'test-operator',environment:'test',routes:[structuredClone(mapping)]},freshMs:60000,staleMs:300000};
}
export async function database(){const c=testConfig();const db=await openDatabase(c);await migrate(db);return {db,repo:new Repository(db),config:c};}
export function point(n=1){return {lat:30.7+n/1000,lng:106.0+n/1000,crs:'WGS84'};}
export function routeFixture(count=5){
 const stops=Array.from({length:count},(_,i)=>({id:String(800000000000000001n+BigInt(i)),code:`S${i+1}`,name:`测试站${i+1}`,sequence:i+1,tourismNodeId:Object.values(mapping.tourismLinks)[i]||null,rawPoint:point(i+1),mapPoint:{...point(i+1),crs:'GCJ02'}}));
 return {id:mapping.id,name:mapping.name,lineCode:mapping.lineCode,operatorId:'test-operator',externalId:'900000000000000001',branches:[{code:'101',direction:'upward',circular:true,track:stops.map(s=>s.rawPoint),mapTrack:stops.map(s=>s.mapPoint),stops}]};
}
export function eventFixture(stream='location',time=NOW){return {operatorId:'test-operator',vehicleKey:'TEST-VEHICLE',stream,time,publishedAt:time+1,receivedAt:time+2,routeId:'jialing-loop',data:{lineCode:'TEST-LINE',branchCode:'101',direction:'upward',code:'TEST-VEHICLE',rawPoint:point(),mapPoint:{...point(),crs:'GCJ02'},speed:15,azimuth:30,accStatus:3,operationState:'unknown',...(stream==='stop'?{stationCode:'S2',stationSN:2,action:'leave'}:{})}};}
export async function referenceCatalog(){return JSON.parse(await fs.readFile(new URL('../packages/content/catalog.reference.json',import.meta.url),'utf8'));}
export async function tempDirectory(){return fs.mkdtemp(path.join(os.tmpdir(),'nc-audit-'));}
