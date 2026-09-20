import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';
import {openDatabase,migrate} from '../packages/storage/database.mjs';import {Repository} from '../packages/storage/repository.mjs';import {testConfig,tempDirectory} from './helpers.mjs';
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
test('real worker process starts unconfigured without phantom data, rejects a second lease owner and shuts down',async()=>{
 const tmp=await tempDirectory(),sqlite=path.join(tmp,'worker.sqlite');let child,second,db;
 try{
  const env={...process.env,DB_DRIVER:'sqlite',SQLITE_PATH:sqlite,TRANSIT_CONFIG:'deploy/transit.example.json',WORKER_INSTANCE_ID:'test-shared-label',IVY_BUS_HOST:'',IVY_MQTT_BROKER:''};
  child=spawn(process.execPath,['apps/transit-worker/main.mjs'],{env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);
  for(let i=0;i<50&&!log.includes('worker-started');i++)await wait(20);assert.ok(log.includes('worker-started'));
  db=await openDatabase({...testConfig(),sqlitePath:sqlite});const repo=new Repository(db);assert.equal((await repo.state('mqtt:nanchong')).state,'not_configured');assert.equal((await repo.latest('nanchong')).length,0);
  second=spawn(process.execPath,['apps/transit-worker/main.mjs'],{env,stdio:'ignore'});const secondCode=await new Promise(r=>second.on('exit',r));assert.notEqual(secondCode,0);
  const closed=new Promise(r=>child.on('exit',r));child.kill('SIGTERM');assert.equal(await closed,0);child=null;assert.equal((await repo.state('mqtt:nanchong')).state,'stopped');assert.equal((await db.query('SELECT key FROM worker_leases')).length,0);
 }finally{child?.kill('SIGKILL');second?.kill('SIGKILL');if(db)await db.close();await fs.rm(tmp,{recursive:true,force:true});}
});
