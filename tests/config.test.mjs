import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {loadConfig,missingHttp,missingMqtt} from '../packages/core/config.mjs';import {testConfig,tempDirectory} from './helpers.mjs';
test('worker lease identities differ even when two containers have the same instance label',()=>{assert.notEqual(loadConfig({WORKER_INSTANCE_ID:'same'}).workerId,loadConfig({WORKER_INSTANCE_ID:'same'}).workerId);});
test('HTTP synchronization can run before MQTT configuration is complete',()=>{const c=testConfig();c.ivy.httpEncrypt=false;c.ivy.broker='';c.ivy.host='https://test.invalid';assert.deepEqual(missingHttp(c),[]);assert.ok(missingMqtt(c).includes('IVY_MQTT_BROKER'));});
test('production rejects local database, insecure transport and cross-environment consumer groups',async()=>{
 assert.throws(()=>loadConfig({NODE_ENV:'production'}),{code:'INVALID_CONFIG'});
 assert.throws(()=>loadConfig({IVY_MQTT_GROUP:'production-shared'}),{code:'INVALID_CONFIG'});
 const dir=await tempDirectory();try{const configFile=path.join(dir,'routes.json');const c=testConfig();c.transit.environment='production';await fs.writeFile(configFile,JSON.stringify(c.transit));const env={NODE_ENV:'production',DB_DRIVER:'postgres',DATABASE_URL:'postgres://test',ADMIN_TOKEN:'a'.repeat(32),PUBLIC_BASE_URL:'https://test.invalid',TRANSIT_CONFIG:configFile,IVY_MQTT_BROKER:'mqtt://test.invalid'};assert.throws(()=>loadConfig(env),{code:'INVALID_CONFIG'});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
