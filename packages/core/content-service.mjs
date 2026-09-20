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
    const routeId=key(catalog.routeId||'jialing-loop');
    await this.db.transaction('content-import:'+catalog.version,async tx=>{
      const routePayload={id:routeId,name:catalog.routeName||catalog.title,description:catalog.description||'',title:catalog.title,notice:catalog.notice,guides:catalog.guides||[],privacy:catalog.privacy||'',sourceVersion:catalog.version};
      await tx.query('INSERT INTO tourism_routes(id,name,description,status,sort_order,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,payload_json=excluded.payload_json,updated_at=excluded.updated_at',[routeId,routePayload.name,routePayload.description,'active',0,encode(routePayload),now]);
      for(const [index,node] of catalog.nodes.entries())await tx.query('INSERT INTO tourism_nodes(id,route_id,name,persona,sequence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET route_id=excluded.route_id,name=excluded.name,persona=excluded.persona,sequence=excluded.sequence,payload_json=excluded.payload_json,revision=tourism_nodes.revision+1,updated_at=excluded.updated_at',[key(node.id),routeId,node.name,node.persona||'',index+1,encode(node),now]);
      for(const [index,p] of catalog.pois.entries()){
        let mediaId=null;const source=p.cover||p.mediaCandidate?.originalUrl||null;
        if(source){mediaId='media-'+p.id;const media={id:mediaId,sourceUrl:source,source:p.source||null,imageLabel:p.imageLabel||null};await tx.query('INSERT INTO media_assets(id,source_url,storage_path,mime_type,width,height,rights_status,match_status,evidence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,payload_json=excluded.payload_json,updated_at=excluded.updated_at',[mediaId,source,null,null,null,null,p.mediaCandidate?.rightsConfirmed?'confirmed':'inherited_unverified',p.mediaCandidate?.rightsConfirmed?'confirmed':'inherited_unverified','',encode(media),now]);}
        const payload={...p,coverMediaId:mediaId};await tx.query('INSERT INTO pois(id,node_id,name,category,subcategory,address,description,cover_media_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET node_id=excluded.node_id,name=excluded.name,category=excluded.category,subcategory=excluded.subcategory,address=excluded.address,description=excluded.description,cover_media_id=excluded.cover_media_id,payload_json=excluded.payload_json,revision=pois.revision+1,updated_at=excluded.updated_at',[key(p.id),key(p.nodeId),p.name,p.category,p.subcategory||'',p.address||'',p.description||'',mediaId,'active',index+1,encode(payload),1,now]);
      }
      for(const [index,w] of catalog.walks.entries()){
        await tx.query('INSERT INTO city_walks(id,title,subtitle,cover_poi_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,cover_poi_id=excluded.cover_poi_id,payload_json=excluded.payload_json,revision=city_walks.revision+1,updated_at=excluded.updated_at',[key(w.id),w.title,w.subtitle||'',key(w.coverPoiId),'active',index+1,encode({...w,steps:undefined}),1,now]);
        await tx.query('DELETE FROM city_walk_steps WHERE walk_id=$1',[w.id]);for(const [i,s] of (w.steps||[]).entries())await tx.query('INSERT INTO city_walk_steps(walk_id,sequence,poi_id,title,payload_json) VALUES($1,$2,$3,$4,$5)',[w.id,i+1,key(s.poiId),s.title,encode(s)]);
      }
      const home={title:catalog.title,heroTitle:'把南充，坐成一段风景。',heroSubtitle:'沿着嘉陵江，慢慢看这座城。',notice:catalog.notice,featuredWalkIds:[],maxBanners:3};
      await tx.query('INSERT INTO home_config(singleton,payload_json,revision,updated_at) VALUES(1,$1,$2,$3) ON CONFLICT(singleton) DO UPDATE SET payload_json=excluded.payload_json,revision=home_config.revision+1,updated_at=excluded.updated_at',[encode(home),1,now]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'migration',catalog.version,null,encode({counts:{nodes:catalog.nodes.length,pois:catalog.pois.length,walks:catalog.walks.length,steps:catalog.walks.reduce((n,w)=>n+w.steps.length,0)}}),1,actor,now]);
    });
    const counts=await this.counts();if(publish){const built=await this.buildCatalog();await this.repository.publishCatalog({...built,version:catalog.version,publication:catalog.publication||'reference'},now);}return {counts,published:publish};
  }
  async counts(){const q=async table=>Number((await this.db.query(`SELECT COUNT(*) AS count FROM ${table}`))[0]?.count||0);return {routes:await q('tourism_routes'),nodes:await q('tourism_nodes'),pois:await q('pois'),media:await q('media_assets'),walks:await q('city_walks'),steps:await q('city_walk_steps')};}
  async list(kind){const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);const order=kind==='nodes'?'sequence':kind==='pois'||kind==='walks'?'sort_order':'updated_at';const rows=await this.db.query(`SELECT * FROM ${table} ORDER BY ${order}, id`);return rows.map(r=>({id:r.id,status:r.status||'active',revision:Number(r.revision||1),data:decode(r.payload_json)}));}
  async get(kind,id){const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);const rows=await this.db.query(`SELECT * FROM ${table} WHERE id=$1`,[key(id)]);return rows[0]?{id:rows[0].id,status:rows[0].status||'active',revision:Number(rows[0].revision||1),data:decode(rows[0].payload_json)}:null;}
  async home(){const r=(await this.db.query('SELECT payload_json,revision FROM home_config WHERE singleton=1'))[0];return r?{id:'home',status:'active',revision:Number(r.revision),data:decode(r.payload_json)}:null;}
  async save(kind,id,patch,{expectedRevision,actorUserId=null,now=Date.now()}={}){
    if(kind==='home')return this.saveHome(patch,{expectedRevision,actorUserId,now});
    const table=KINDS[kind];invariant(table,'CONTENT_KIND','内容类型无效',404);id=key(id);return this.db.transaction(`content:${kind}:${id}`,async tx=>{
      const rows=await tx.query(`SELECT * FROM ${table} WHERE id=$1`,[id]);const row=rows[0];invariant(row,'NOT_FOUND','内容不存在',404);const revision=Number(row.revision||1);invariant(expectedRevision===revision,'REVISION_CONFLICT','内容已被其他人修改，请刷新',409);const before=decode(row.payload_json),after=merge(before,patch),next=revision+1,status=pickStatus(patch.status===undefined?(row.status||'active'):patch.status);
      if(kind==='pois')await tx.query('UPDATE pois SET node_id=$1,name=$2,category=$3,subcategory=$4,address=$5,description=$6,cover_media_id=$7,status=$8,payload_json=$9,revision=$10,updated_at=$11 WHERE id=$12',[key(after.nodeId),after.name,after.category,after.subcategory||'',after.address||'',after.description||'',after.coverMediaId||row.cover_media_id||null,status,encode(after),next,now,id]);
      else if(kind==='walks'){await tx.query('UPDATE city_walks SET title=$1,subtitle=$2,cover_poi_id=$3,status=$4,payload_json=$5,revision=$6,updated_at=$7 WHERE id=$8',[after.title,after.subtitle||'',key(after.coverPoiId),status,encode({...after,steps:undefined}),next,now,id]);if(Array.isArray(after.steps)){await tx.query('DELETE FROM city_walk_steps WHERE walk_id=$1',[id]);for(const [i,s] of after.steps.entries())await tx.query('INSERT INTO city_walk_steps(walk_id,sequence,poi_id,title,payload_json) VALUES($1,$2,$3,$4,$5)',[id,i+1,key(s.poiId),s.title,encode(s)]);}}
      else if(kind==='nodes'){invariant(patch.status===undefined||patch.status==='active','INVALID_STATUS','站点下架需先调整关联内容');await tx.query('UPDATE tourism_nodes SET name=$1,persona=$2,payload_json=$3,updated_at=$4,revision=$5 WHERE id=$6',[after.name,after.persona||'',encode(after),now,next,id]);}
      else await tx.query(`UPDATE ${table} SET status=$1,payload_json=$2,revision=$3,updated_at=$4 WHERE id=$5`,[status,encode(after),next,now,id]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),kind,id,encode(before),encode(after),next,actorUserId,now]);return {id,status,revision:next,data:after};
    });
  }
  async saveHome(patch,{expectedRevision,actorUserId=null,now=Date.now()}={}){return this.db.transaction('content:home',async tx=>{const row=(await tx.query('SELECT payload_json,revision FROM home_config WHERE singleton=1'))[0];invariant(row,'NOT_FOUND','首页配置不存在',404);const revision=Number(row.revision);invariant(revision===expectedRevision,'REVISION_CONFLICT','首页配置已变化',409);const before=decode(row.payload_json),after=merge(before,patch),next=revision+1;await tx.query('UPDATE home_config SET payload_json=$1,revision=$2,updated_at=$3 WHERE singleton=1',[encode(after),next,now]);await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'home','home',encode(before),encode(after),next,actorUserId,now]);return {id:'home',revision:next,data:after};});}
  async buildCatalog(){
    const route=(await this.db.query('SELECT * FROM tourism_routes ORDER BY sort_order,id LIMIT 1'))[0];invariant(route,'CONTENT_UNAVAILABLE','线路内容尚未导入',503);const meta=decode(route.payload_json);const nodes=(await this.db.query("SELECT payload_json FROM tourism_nodes ORDER BY sequence,id")).map(r=>decode(r.payload_json));
    const pois=(await this.db.query("SELECT p.payload_json,m.storage_path,m.source_url FROM pois p LEFT JOIN media_assets m ON m.id=p.cover_media_id WHERE p.status!='offline' ORDER BY p.sort_order,p.id")).map(r=>{const p=decode(r.payload_json);if(!p.cover&&r.storage_path)p.cover='/media/'+r.storage_path;if(!p.cover&&r.source_url)p.mediaCandidate={...(p.mediaCandidate||{}),originalUrl:r.source_url};return p;});
    const walks=[];for(const r of await this.db.query("SELECT * FROM city_walks WHERE status!='offline' ORDER BY sort_order,id")){const w=decode(r.payload_json),steps=(await this.db.query('SELECT payload_json FROM city_walk_steps WHERE walk_id=$1 ORDER BY sequence',[r.id])).map(x=>decode(x.payload_json));walks.push({...w,steps});}
    const home=await this.home();const extras=async(kind)=>{const table=KINDS[kind];if(!table)return[];return (await this.db.query(`SELECT payload_json FROM ${table} WHERE status!='offline' ORDER BY id`)).map(r=>decode(r.payload_json));};
    const catalog={version:'draft',publication:'draft',routeId:route.id,title:home?.data?.title||meta.title||'嘉陵江城市漫游',routeName:meta.name||route.name,description:meta.description||route.description||'',notice:home?.data?.notice||meta.notice||'',home:home?.data||null,nodes,pois,walks,guides:meta.guides||[],privacy:meta.privacy||'',banners:await extras('banners'),announcements:await extras('announcements'),membershipPlans:await extras('membershipPlans'),benefits:await extras('benefits'),events:await extras('events')};catalog.version='draft-'+hash(catalog);return catalog;
  }
  async publish({actorUserId=null,now=Date.now(),approved=false,approval=null,expectedDraftVersion=null,requireApproved=false}={}){
    invariant(!requireApproved||approved===true,'CONTENT_NOT_APPROVED','正式环境需要审核确认后发布',409);
    const catalog=await this.buildCatalog();
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
