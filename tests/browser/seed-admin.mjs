import fs from 'node:fs/promises';
import {loadConfig} from '../../packages/core/config.mjs';
import {openDatabase,migrate} from '../../packages/storage/database.mjs';
import {Repository} from '../../packages/storage/repository.mjs';
import {ContentService} from '../../packages/core/content-service.mjs';
if(process.env.BROWSER_ACCEPTANCE!=='1'||process.env.DB_DRIVER!=='sqlite'||process.env.NODE_ENV==='production')throw Error('Dedicated browser fixture only');
const config=loadConfig(),db=await openDatabase(config);
try{await migrate(db);await new ContentService(db,new Repository(db)).importCatalog(JSON.parse(await fs.readFile('packages/content/catalog.reference.json','utf8')),{publish:true});}finally{await db.close();}
