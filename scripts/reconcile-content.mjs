import {loadConfig} from '../packages/core/config.mjs';
import {openDatabase,migrate} from '../packages/storage/database.mjs';
import {Repository} from '../packages/storage/repository.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
const db=await openDatabase(loadConfig());
try{
 await migrate(db);const service=new ContentService(db,new Repository(db));
 const before=await service.comparison();
 if(process.argv.includes('--apply'))console.log(JSON.stringify({migration:await service.reconcilePublished({expectedVersion:before.publishedVersion,actorUserId:'reconcile-cli'}),comparison:await service.comparison()},null,2));
 else console.log(JSON.stringify({mode:'read-only',comparison:before},null,2));
}finally{await db.close();}
