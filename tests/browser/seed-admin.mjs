import fs from 'node:fs/promises';
import {loadConfig} from '../../packages/core/config.mjs';
import {openDatabase,migrate} from '../../packages/storage/database.mjs';
if(process.env.BROWSER_ACCEPTANCE!=='1'||process.env.DB_DRIVER!=='sqlite'||process.env.NODE_ENV==='production')throw Error('Dedicated browser fixture only');
const config=loadConfig(),db=await openDatabase(config);
try{
 await migrate(db);const catalog=JSON.parse(await fs.readFile('packages/content/catalog.reference.json','utf8'));
 catalog.events=[{id:'legacy-event',title:'迁移前线上活动',registration:'free',rules:'已有规则'}];
 // Legacy production fixture intentionally bypasses the fixed repository method.
 await db.query('INSERT INTO content_releases(version,payload,created_at) VALUES($1,$2,$3)',[catalog.version,JSON.stringify(catalog),Date.now()]);
 await db.query('INSERT INTO content_active(singleton,version) VALUES(1,$1)',[catalog.version]);
}finally{await db.close();}
