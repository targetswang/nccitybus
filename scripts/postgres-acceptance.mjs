import fs from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, migrate } from '../packages/storage/database.mjs';
import { Repository } from '../packages/storage/repository.mjs';
import { ContentService } from '../packages/core/content-service.mjs';

const url=process.env.POSTGRES_ACCEPTANCE_URL||'';
if(process.env.POSTGRES_ACCEPTANCE_CONFIRM!=='I_UNDERSTAND_THIS_DATABASE_IS_FOR_TESTING')throw new Error('Refusing to modify a database without POSTGRES_ACCEPTANCE_CONFIRM');
if(!/^postgres(?:ql)?:\/\//.test(url))throw new Error('POSTGRES_ACCEPTANCE_URL is required');
const config={dbDriver:'postgres',databaseUrl:url,databaseCaFile:process.env.POSTGRES_ACCEPTANCE_CA_FILE||'',root:process.cwd()};
const db=await openDatabase(config),started=Date.now();
try{
  await migrate(db);const repo=new Repository(db),content=new ContentService(db,repo);const catalog=JSON.parse(await fs.readFile('packages/content/catalog.reference.json','utf8'));await content.importCatalog(catalog,{actor:'postgres-acceptance',publish:true,now:Date.now()});
  const counts=await content.counts();if(counts.nodes!==5||counts.pois!==21||counts.walks!==4||counts.steps!==9)throw new Error('PostgreSQL migration/content counts do not match 5/21/4/9 baseline');
  const poi=await content.get('pois','qinghui-pavilion'),marker='PG验收-'+Date.now();await content.save('pois',poi.id,{description:marker},{expectedRevision:poi.revision,actorUserId:'postgres-acceptance'});if((await repo.catalog()).pois.find(x=>x.id===poi.id).description===marker)throw new Error('Draft leaked into published catalog');await content.publish({actorUserId:'postgres-acceptance'});if((await repo.catalog()).pois.find(x=>x.id===poi.id).description!==marker)throw new Error('Published PostgreSQL readback failed');
  const result={status:'passed',driver:db.driver,counts,draftPublishIsolation:true,durationMs:Date.now()-started,verifiedAt:new Date().toISOString()};await fs.mkdir('audit/postgres',{recursive:true});await fs.writeFile('audit/postgres/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await db.close();}
