import {CONTENT_KINDS,compareContent} from './content-comparison.mjs';
import {hydrateCatalog} from './content-hydration.mjs';
import { OPERATIONAL_KINDS, validateOperational } from './operational-content.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { invariant, validateCatalog } from '../contracts/index.mjs';
const encode = value => JSON.stringify(value ?? {});
const decode = value => JSON.parse(value || '{}');
const hash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const key = value => { invariant(typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value),'INVALID_ID','业务ID无效'); return value; };
const KINDS={nodes:'tourism_nodes',pois:'pois',walks:'city_walks',banners:'banners',announcements:'announcements',membershipPlans:'membership_plans',benefits:'benefits',events:'events'};
function pickStatus(value){invariant(['active','offline'].includes(value),'INVALID_STATUS','内容状态无效');return value;}
function merge(current,patch){const out={...current,...patch};delete out.revision;delete out.status;return out;}
export class ContentService {
  constructor(db, repository){this.db=db;this.repository=repository;}
  async importCatalog(catalog,{actor='migration',now=Date.now(),publish=false}={}){
    validateCatalog(catalog);
    if(publish){invariant(!await this.repository.catalog(),'IMPORT_DRAFT_ONLY','已有线上版本，请先导入草稿、核对差异，再从后台发布',409);await this.repository.publishCatalog(catalog,now);}
    else await this.db.transaction('content-publish',tx=>hydrateCatalog(tx,catalog,{actor,now}));
    return {counts:await this.counts(),published:publish};
  }
  async reconcilePublished({actorUserId='migration',expectedVersion}={}){
    return this.db.transaction('content-publish',async tx=>{
      const row=(await tx.query('SELECT c.payload FROM content_releases c JOIN content_active a ON a.version=c.version WHERE a.singleton=1'))[0];
      if(!row)return {version:null,inserted:{},preserved:{},mediaConflicts:[]};
      const catalog=decode(row.payload);
      invariant(expectedVersion===undefined||expectedVersion===catalog.version,'REVISION_CONFLICT','线上版本已变化，请刷新后重试',409);
      return hydrateCatalog(tx,catalog,{actor:actorUserId});
    });
  }
  async comparison(){
    return this.db.transaction('content-publish',async tx=>{
      const service=new ContentService(tx,this.repository);
      const row=(await tx.query('SELECT c.payload FROM content_releases c JOIN content_active a ON a.version=c.version WHERE a.singleton=1'))[0];
      const published=row?decode(row.payload):null,records={};
      for(const kind of CONTENT_KINDS)records[kind]=await service.list(kind);
      let draft=null;try{draft=await service.buildCatalog();}catch(e){if(e.code!=='CONTENT_UNAVAILABLE')throw e;}
      return compareContent(published,draft,records);
    });
  }
  async counts(){const q=async table=>Number((await this.db.query(`SELECT COUNT(*) AS count FROM ${table}`))[0]?.count||0);return {routes:await q('tourism_routes'),nodes:await q('tourism_nodes'),pois:await q('pois'),media:await q('media_assets'),walks:await q('city_walks'),steps:await q('city_walk_steps')};}
  async list(kind){const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);const order=kind==='nodes'?'sequence':kind==='pois'||kind==='walks'?'sort_order':'updated_at';const rows=await this.db.query(`SELECT * FROM ${table} ORDER BY ${order}, id`);return Promise.all(rows.map(async r=>({id:r.id,status:r.status||'active',revision:Number(r.revision||1),data:kind==='walks'?{...decode(r.payload_json),steps:(await this.db.query('SELECT payload_json FROM city_walk_steps WHERE walk_id=$1 ORDER BY sequence',[r.id])).map(x=>decode(x.payload_json))}:decode(r.payload_json)})));}
  async get(kind,id){const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);const rows=await this.db.query(`SELECT * FROM ${table} WHERE id=$1`,[key(id)]);return rows[0]?{id:rows[0].id,status:rows[0].status||'active',revision:Number(rows[0].revision||1),data:kind==='walks'?{...decode(rows[0].payload_json),steps:(await this.db.query('SELECT payload_json FROM city_walk_steps WHERE walk_id=$1 ORDER BY sequence',[id])).map(x=>decode(x.payload_json))}:decode(rows[0].payload_json)}:null;}
  async home(){const r=(await this.db.query('SELECT payload_json,revision FROM home_config WHERE singleton=1'))[0];return r?{id:'home',status:'active',revision:Number(r.revision),data:decode(r.payload_json)}:null;}
  async create(kind,patch,{actorUserId=null,now=Date.now()}={}){
    invariant(OPERATIONAL_KINDS.includes(kind),'CONTENT_KIND','当前新建支持活动、Banner、公告、会员和权益');
    const id=kind+'-'+randomUUID(),table=KINDS[kind];
    return this.db.transaction('content:create:'+id,async tx=>{
      const data=await validateOperational(tx,kind,{...(kind==='events'?{registration:'free',capacity:0}:{}),...(kind==='banners'?{placement:'home'}:{}),...merge({},patch),id});
      const status=pickStatus(patch.status||'active');
      if(kind==='banners')await tx.query('INSERT INTO banners(id,placement,target_type,target_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,data.placement,data.targetType,data.targetId||null,status,0,encode(data),1,now]);
      else await tx.query(`INSERT INTO ${table}(id,status,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5)`,[id,status,encode(data),1,now]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),kind,id,null,encode(data),1,actorUserId,now]);
      return {id,status,revision:1,data};
    });
  }
  async save(kind,id,patch,{expectedRevision,actorUserId=null,now=Date.now()}={}){
    if(kind==='home')return this.saveHome(patch,{expectedRevision,actorUserId,now});
    const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);id=key(id);return this.db.transaction(`content:${kind}:${id}`,async tx=>{
      const rows=await tx.query(`SELECT * FROM ${table} WHERE id=$1`,[id]);const row=rows[0];invariant(row,'NOT_FOUND','内容不存在',404);const revision=Number(row.revision||1);invariant(expectedRevision===revision,'REVISION_CONFLICT','内容已被其他人修改，请刷新',409);const before=decode(row.payload_json),after=merge(before,patch),next=revision+1,status=pickStatus(patch.status===undefined?(row.status||'active'):patch.status);
      after.id=id;await validateOperational(tx,kind,after);
      if(kind==='pois')await tx.query('UPDATE pois SET node_id=$1,name=$2,category=$3,subcategory=$4,address=$5,description=$6,cover_media_id=$7,status=$8,payload_json=$9,revision=$10,updated_at=$11 WHERE id=$12',[key(after.nodeId),after.name,after.category,after.subcategory||'',after.address||'',after.description||'',after.coverMediaId||row.cover_media_id||null,status,encode(after),next,now,id]);
      else if(kind==='walks'){await tx.query('UPDATE city_walks SET title=$1,subtitle=$2,cover_poi_id=$3,status=$4,payload_json=$5,revision=$6,updated_at=$7 WHERE id=$8',[after.title,after.subtitle||'',key(after.coverPoiId),status,encode({...after,steps:undefined}),next,now,id]);if(Array.isArray(after.steps)){await tx.query('DELETE FROM city_walk_steps WHERE walk_id=$1',[id]);for(const [i,s] of after.steps.entries())await tx.query('INSERT INTO city_walk_steps(walk_id,sequence,poi_id,title,payload_json) VALUES($1,$2,$3,$4,$5)',[id,i+1,key(s.poiId),s.title,encode(s)]);}}
      else if(kind==='nodes'){invariant(patch.status===undefined||patch.status==='active','INVALID_STATUS','站点下架需先调整关联内容');await tx.query('UPDATE tourism_nodes SET name=$1,persona=$2,payload_json=$3,updated_at=$4,revision=$5 WHERE id=$6',[after.name,after.persona||'',encode(after),now,next,id]);}
      else if(kind==='banners')await tx.query('UPDATE banners SET placement=$1,target_type=$2,target_id=$3,status=$4,payload_json=$5,revision=$6,updated_at=$7 WHERE id=$8',[after.placement,after.targetType,after.targetId||null,status,encode(after),next,now,id]);
      else await tx.query(`UPDATE ${table} SET status=$1,payload_json=$2,revision=$3,updated_at=$4 WHERE id=$5`,[status,encode(after),next,now,id]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),kind,id,encode(before),encode(after),next,actorUserId,now]);return {id,status,revision:next,data:after};
    });
  }
  async saveHome(patch,{expectedRevision,actorUserId=null,now=Date.now()}={}){return this.db.transaction('content:home',async tx=>{const row=(await tx.query('SELECT payload_json,revision FROM home_config WHERE singleton=1'))[0];invariant(row,'NOT_FOUND','首页配置不存在',404);const revision=Number(row.revision);invariant(revision===expectedRevision,'REVISION_CONFLICT','首页配置已变化',409);const before=decode(row.payload_json),after=merge(before,patch),next=revision+1;await tx.query('UPDATE home_config SET payload_json=$1,revision=$2,updated_at=$3 WHERE singleton=1',[encode(after),next,now]);await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'home','home',encode(before),encode(after),next,actorUserId,now]);return {id:'home',revision:next,data:after};});}
  async buildCatalog(){
    const route=(await this.db.query('SELECT * FROM tourism_routes ORDER BY sort_order,id LIMIT 1'))[0];invariant(route,'CONTENT_UNAVAILABLE','线路内容尚未导入',503);const meta=decode(route.payload_json);const nodes=(await this.db.query("SELECT payload_json FROM tourism_nodes ORDER BY sequence,id")).map(r=>decode(r.payload_json));
    const pois=(await this.db.query("SELECT p.payload_json,m.storage_path,m.source_url FROM pois p LEFT JOIN media_assets m ON m.id=p.cover_media_id WHERE p.status!='offline' ORDER BY p.sort_order,p.id")).map(r=>{const p=decode(r.payload_json);if(!p.cover&&r.storage_path)p.cover='/media/'+r.storage_path;if(!p.cover&&r.source_url)p.mediaCandidate={...(p.mediaCandidate||{}),originalUrl:r.source_url};return p;});
    const walks=[];for(const r of await this.db.query("SELECT * FROM city_walks WHERE status!='offline' ORDER BY sort_order,id")){const w=decode(r.payload_json),steps=(await this.db.query('SELECT payload_json FROM city_walk_steps WHERE walk_id=$1 ORDER BY sequence',[r.id])).map(x=>decode(x.payload_json));walks.push({...w,steps});}
    const home=await this.home();const extras=async(kind)=>{const table=KINDS[kind];if(!table)return[];const order=meta.collectionOrder?.[kind]||[];return (await this.db.query(`SELECT payload_json FROM ${table} WHERE status!='offline' ORDER BY id`)).map(r=>decode(r.payload_json)).sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});};
    const catalog={...meta.catalogMetadata,version:'draft',publication:'draft',routeId:route.id,title:home?.data?.title||meta.title||'嘉陵江城市漫游',routeName:meta.name||route.name,description:meta.description||route.description||'',notice:home?.data?.notice||meta.notice||'',home:home?.data||null,nodes,pois,walks,guides:meta.guides||[],privacy:meta.privacy||'',banners:await extras('banners'),announcements:await extras('announcements'),membershipPlans:await extras('membershipPlans'),benefits:await extras('benefits'),events:await extras('events')};catalog.version='draft-'+hash(catalog);return catalog;
  }
  async publish({actorUserId=null,now=Date.now(),approved=false,approval=null,expectedDraftVersion=null,requireApproved=false}={}){
    invariant(!requireApproved||approved===true,'CONTENT_NOT_APPROVED','正式环境需要审核确认后发布',409);
    const catalog=await this.buildCatalog();
    for(const kind of OPERATIONAL_KINDS)for(const item of catalog[kind]||[])await validateOperational(this.db,kind,item);
    let release={...catalog,publication:'reference'};
    if(approved===true){
      invariant(actorUserId&&typeof approval?.evidence==='string'&&approval.evidence.trim().length>0&&approval.evidence.length<=4000,'APPROVAL_REQUIRED','请填写内容事实核验与发布审核依据');
      invariant(expectedDraftVersion===catalog.version,'REVISION_CONFLICT','草稿已变化，请重新预览并审核',409);
      // The publisher explicitly attests to this exact draft. Media still has
      // separate rights/place checks enforced by validateCatalog.
      release={...catalog,publication:'approved',approval:{reviewedBy:actorUserId,reviewedAt:now,evidence:approval.evidence.trim(),draftVersion:catalog.version},
        pois:catalog.pois.map(p=>({...p,publication:'approved',source:{...p.source,status:'approved',verifiedAt:now}})),
        walks:catalog.walks.map(w=>({...w,source:{...w.source,status:'approved',verifiedAt:now}}))};
    }
    release.version='content-'+hash(release).slice(0,24);
    validateCatalog(release);
    await this.repository.publishCatalog(release,now);
    await this.db.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'publication',release.version,null,encode({version:release.version,publication:release.publication,approval:release.approval||null}),1,actorUserId,now]);
    return {version:release.version,catalog:release};
  }
}
