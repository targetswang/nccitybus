import fs from 'node:fs/promises';
import { loadConfig } from '../packages/core/config.mjs';
import { openDatabase, migrate } from '../packages/storage/database.mjs';
import { Repository } from '../packages/storage/repository.mjs';
import { ContentService } from '../packages/core/content-service.mjs';
const config=loadConfig();const db=await openDatabase(config);
try{await migrate(db);const catalog=JSON.parse(await fs.readFile(new URL('../packages/content/catalog.reference.json',import.meta.url),'utf8'));const service=new ContentService(db,new Repository(db));const result=await service.importCatalog(catalog,{actor:'catalog-migration',publish:true});console.log(JSON.stringify({status:'passed',...result},null,2));}
finally{await db.close();}
