import fs from 'node:fs';
import {loadConfig} from '../packages/core/config.mjs';
import {openDatabase,migrate} from '../packages/storage/database.mjs';
import {Repository} from '../packages/storage/repository.mjs';
import {ContentService} from '../packages/core/content-service.mjs';
import {invariant} from '../packages/contracts/index.mjs';
const config=loadConfig(),db=await openDatabase(config);
try{
 await migrate(db);const repo=new Repository(db),service=new ContentService(db,repo),args=process.argv.slice(2);
 if(args[0]==='--rollback'){await repo.rollbackCatalog(args[1]);console.log('Content rollback completed; existing drafts retained');}
 else if(args[0]==='--publish-draft'){
  const version=args[args.indexOf('--version')+1],evidence=args[args.indexOf('--evidence')+1];
  invariant(args.includes('--version')&&args.includes('--evidence'),'USAGE','需要 --version 草稿版本 --evidence 审核依据');
  console.log(JSON.stringify(await service.publish({actorUserId:'cli-publisher',approved:true,expectedDraftVersion:version,approval:{evidence},requireApproved:config.production}),null,2));
 }else{
  invariant(args[0],'USAGE','先执行 node scripts/reconcile-content.mjs 核对；导入文件只补入草稿；发布用 --publish-draft --version ... --evidence ...');
  const file=args[0]==='--import'?args[1]:args[0];
  invariant(file,'USAGE','请提供导入文件路径');
  console.log(JSON.stringify({message:'已补入草稿，未发布；已有草稿保留',result:await service.importCatalog(JSON.parse(fs.readFileSync(file,'utf8'))),comparison:await service.comparison()},null,2));
 }
}finally{await db.close();}
