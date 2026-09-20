import {loadConfig} from '../../packages/core/config.mjs';
import {openDatabase,migrate} from '../../packages/storage/database.mjs';
import {Repository} from '../../packages/storage/repository.mjs';
import {UnifiedAuthService} from '../../packages/core/auth-unified.mjs';
import fs from 'node:fs/promises';
if(process.env.BROWSER_ACCEPTANCE!=='1'||process.env.DB_DRIVER!=='sqlite'||process.env.NODE_ENV==='production')throw Error('Dedicated browser fixture only');
const config=loadConfig(),db=await openDatabase(config);try{
 await migrate(db);const repo=new Repository(db);
 const catalog=JSON.parse(await fs.readFile('packages/content/catalog.reference.json','utf8'));catalog.version='browser-acceptance';
 catalog.pois=catalog.pois.map(p=>({...p,cover:'/assets/map-marker.svg'}));
 catalog.benefits=[{id:'browser-benefit',name:'浏览器验收权益',rules:'测试规则',capacity:1}];
 catalog.events=[{id:'browser-event',title:'已取消的验收活动',registration:'free',operationalStatus:'cancelled',cancellationReason:'天气原因'}];
 await repo.publishCatalog(catalog);
 const auth=new UnifiedAuthService(db,config),c=await auth.requestChallenge('13900009001');const session=await auth.verifyChallenge({...c,code:'246810'});
 console.log(JSON.stringify(session));
}finally{await db.close();}
