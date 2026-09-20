import { createHash, randomUUID } from 'node:crypto';
import { CATEGORIES, DomainError, invariant } from '../contracts/index.mjs';

const MEDIA_STATES=new Set(['inherited_unverified','pending','confirmed','rejected']);
const CANDIDATE_STATES=new Set(['pending_review','approved','rejected','imported']);
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const safeText=(v,max=1000)=>{const s=String(v??'').trim();invariant(s.length<=max,'INVALID_TEXT','文本过长');return s;};
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return{};}};
const encode=v=>JSON.stringify(v??{});
const safeId=value=>{const s=String(value||'').trim();invariant(/^[A-Za-z0-9_-]{1,160}$/.test(s),'INVALID_ID','ID无效');return s;};
const maskPhone=phone=>`${phone.slice(0,3)}****${phone.slice(-4)}`;

function parseAmapLocation(value){
  if(typeof value!=='string')return {longitude:null,latitude:null};
  const [lng,lat]=value.split(',').map(Number);
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lat)>90||Math.abs(lng)>180)return {longitude:null,latitude:null};
  return {longitude:lng,latitude:lat};
}

export class OperationsService{
  constructor(db,content,config,transport=fetch){this.db=db;this.content=content;this.config=config;this.transport=transport;}

  async listMedia({rightsStatus=null,matchStatus=null}={}){
    invariant(!rightsStatus||MEDIA_STATES.has(rightsStatus),'INVALID_MEDIA_STATE','版权状态无效');
    invariant(!matchStatus||MEDIA_STATES.has(matchStatus),'INVALID_MEDIA_STATE','地点匹配状态无效');
    const where=[],args=[];
    if(rightsStatus){args.push(rightsStatus);where.push(`m.rights_status=$${args.length}`);}
    if(matchStatus){args.push(matchStatus);where.push(`m.match_status=$${args.length}`);}
    let sql='SELECT m.* FROM media_assets m';if(where.length)sql+=' WHERE '+where.join(' AND ');sql+=' ORDER BY m.updated_at DESC,m.id';
    const rows=await this.db.query(sql,args),items=[];
    for(const row of rows){
      const used=await this.db.query('SELECT id,name FROM pois WHERE cover_media_id=$1 ORDER BY id',[row.id]);
      const evidence=parse(row.evidence);
      items.push({id:row.id,sourceUrl:row.source_url||null,storagePath:row.storage_path||null,url:row.storage_path?'/media/'+row.storage_path:(row.source_url||null),mimeType:row.mime_type||null,width:row.width===null?null:Number(row.width),height:row.height===null?null:Number(row.height),rightsStatus:row.rights_status,matchStatus:row.match_status,evidence,usage:used,updatedAt:Number(row.updated_at)});
    }
    return{items};
  }

  async mediaAudit(mediaId){
    mediaId=safeId(mediaId);const rows=await this.db.query('SELECT id,action,actor_user_id,before_json,after_json,created_at FROM media_audit_log WHERE media_id=$1 ORDER BY created_at DESC LIMIT 100',[mediaId]);
    return{items:rows.map(r=>({id:r.id,action:r.action,actorUserId:r.actor_user_id,before:parse(r.before_json),after:parse(r.after_json),createdAt:Number(r.created_at)}))};
  }

  async reviewMedia(mediaId,{rightsStatus,matchStatus,rightsEvidence='',matchEvidence='',note=''},actorUserId,now=Date.now()){
    mediaId=safeId(mediaId);invariant(MEDIA_STATES.has(rightsStatus),'INVALID_MEDIA_STATE','版权状态无效');invariant(MEDIA_STATES.has(matchStatus),'INVALID_MEDIA_STATE','地点匹配状态无效');
    rightsEvidence=safeText(rightsEvidence,4000);matchEvidence=safeText(matchEvidence,4000);note=safeText(note,2000);
    if(rightsStatus==='confirmed')invariant(rightsEvidence.length>=6,'RIGHTS_EVIDENCE_REQUIRED','确认版权前必须填写授权/来源依据');
    if(matchStatus==='confirmed')invariant(matchEvidence.length>=2,'MATCH_EVIDENCE_REQUIRED','确认地点匹配前必须填写核对依据');
    return this.db.transaction(`media:${mediaId}`,async tx=>{
      const row=(await tx.query('SELECT * FROM media_assets WHERE id=$1',[mediaId]))[0];invariant(row,'NOT_FOUND','素材不存在',404);
      const before={rightsStatus:row.rights_status,matchStatus:row.match_status,evidence:parse(row.evidence)};
      const evidence={rightsEvidence,matchEvidence,note,reviewedAt:now,reviewerUserId:actorUserId};
      await tx.query('UPDATE media_assets SET rights_status=$1,match_status=$2,evidence=$3,updated_at=$4 WHERE id=$5',[rightsStatus,matchStatus,encode(evidence),now,mediaId]);
      const after={rightsStatus,matchStatus,evidence};
      await tx.query('INSERT INTO media_audit_log(id,media_id,action,actor_user_id,before_json,after_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),mediaId,'review',actorUserId,encode(before),encode(after),now]);
      return{id:mediaId,...after};
    });
  }

  async assignMedia(mediaId,{poiId,imageLabel='场地实景'},actorUserId,now=Date.now()){
    mediaId=safeId(mediaId);poiId=safeId(poiId);imageLabel=safeText(imageLabel,120)||'场地实景';
    return this.db.transaction(`media-assign:${poiId}`,async tx=>{
      const media=(await tx.query('SELECT * FROM media_assets WHERE id=$1',[mediaId]))[0];invariant(media,'NOT_FOUND','素材不存在',404);
      invariant(media.rights_status==='confirmed','MEDIA_RIGHTS_UNVERIFIED','素材版权/授权尚未确认',409);invariant(media.match_status==='confirmed','MEDIA_MATCH_UNVERIFIED','素材与地点尚未确认匹配',409);
      invariant(typeof media.storage_path==='string'&&/^[a-f0-9]{64}\.webp$/.test(media.storage_path),'MEDIA_NOT_OWNED','只有已入库的内容寻址素材才能设为正式封面',409);
      const poi=(await tx.query('SELECT * FROM pois WHERE id=$1',[poiId]))[0];invariant(poi,'NOT_FOUND','地点不存在',404);
      const before=parse(poi.payload_json),evidence=parse(media.evidence),next=Number(poi.revision||1)+1;
      const after={...before,coverMediaId:mediaId,cover:'/media/'+media.storage_path,imageLabel,mediaApproval:{sha256:media.storage_path.replace(/\.webp$/,''),sourceUrl:media.source_url||null,rightsEvidence:evidence.rightsEvidence||'',placeMatchConfirmed:true,matchEvidence:evidence.matchEvidence||''}};
      await tx.query('UPDATE pois SET cover_media_id=$1,payload_json=$2,revision=$3,updated_at=$4 WHERE id=$5',[mediaId,encode(after),next,now,poiId]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'pois',poiId,encode(before),encode(after),next,actorUserId,now]);
      await tx.query('INSERT INTO media_audit_log(id,media_id,action,actor_user_id,before_json,after_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),mediaId,'assign_cover',actorUserId,encode({poiId,coverMediaId:poi.cover_media_id||null}),encode({poiId,coverMediaId:mediaId}),now]);
      return{mediaId,poiId,revision:next,savedAsDraft:true,published:false};
    });
  }

  discoveryStatus(){return{provider:'amap-poi-2.0',configured:Boolean(this.config.amapKey),mode:'candidate_pool',autoPublish:false};}

  async discover({nodeId,longitude,latitude,keywords='',types='',radius=3000},actorUserId,now=Date.now()){
    nodeId=safeId(nodeId);invariant(this.config.amapKey,'POI_PROVIDER_NOT_CONFIGURED','高德 Web服务 Key 尚未配置',503);
    const node=(await this.db.query('SELECT payload_json FROM tourism_nodes WHERE id=$1',[nodeId]))[0];invariant(node,'NOT_FOUND','站点不存在',404);
    const nodeData=parse(node.payload_json);longitude=Number(longitude??nodeData.mapPoint?.lng);latitude=Number(latitude??nodeData.mapPoint?.lat);
    invariant(Number.isFinite(longitude)&&Math.abs(longitude)<=180&&Number.isFinite(latitude)&&Math.abs(latitude)<=90,'DISCOVERY_CENTER_REQUIRED','该站点还没有坐标，请先填写采集中心经纬度');
    keywords=safeText(keywords,80);types=safeText(types,200);radius=Number(radius||3000);invariant(Number.isInteger(radius)&&radius>=100&&radius<=50000,'INVALID_RADIUS','采集半径必须在100-50000米之间');
    const u=new URL('https://restapi.amap.com/v5/place/around');u.searchParams.set('key',this.config.amapKey);u.searchParams.set('location',`${longitude.toFixed(6)},${latitude.toFixed(6)}`);u.searchParams.set('radius',String(radius));u.searchParams.set('region','南充市');u.searchParams.set('city_limit','true');u.searchParams.set('page_size','25');u.searchParams.set('page_num','1');u.searchParams.set('show_fields','business,photos');if(keywords)u.searchParams.set('keywords',keywords);if(types)u.searchParams.set('types',types);
    const response=await this.transport(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});invariant(response.ok,'POI_UPSTREAM','POI采集服务请求失败',502);const payload=await response.json();invariant(String(payload.status)==='1','POI_UPSTREAM',String(payload.info||'POI采集服务返回失败'),502);
    const candidates=[];
    for(const p of Array.isArray(payload.pois)?payload.pois:[]){
      if(!p?.id||!p?.name)continue;const loc=parseAmapLocation(p.location);const id='cand-'+sha(`amap:${nodeId}:${p.id}`).slice(0,24),distance=Number(p.distance);
      await this.db.query(`INSERT INTO poi_discovery_candidates(id,provider,provider_id,node_id,name,category,address,longitude,latitude,distance_m,source_payload_json,status,mapped_category,description_draft,review_note,reviewer_user_id,imported_poi_id,created_at,updated_at,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT(provider,provider_id,node_id) DO UPDATE SET name=excluded.name,category=excluded.category,address=excluded.address,longitude=excluded.longitude,latitude=excluded.latitude,distance_m=excluded.distance_m,source_payload_json=excluded.source_payload_json,updated_at=excluded.updated_at`,[id,'amap-poi-2.0',String(p.id),nodeId,String(p.name).slice(0,200),String(p.type||'').slice(0,300),Array.isArray(p.address)?p.address.join(''):String(p.address||'').slice(0,500),loc.longitude,loc.latitude,Number.isFinite(distance)?Math.round(distance):null,encode(p),'pending_review','','','','',null,now,now,null]);
      candidates.push(id);
    }
    return{provider:'amap-poi-2.0',nodeId,center:{longitude,latitude,crs:'GCJ02'},received:Array.isArray(payload.pois)?payload.pois.length:0,upserted:candidates.length,candidateIds:candidates,autoPublished:false};
  }

  async listCandidates({status=null,nodeId=null}={}){
    invariant(!status||CANDIDATE_STATES.has(status),'INVALID_CANDIDATE_STATE','候选状态无效');const where=[],args=[];if(status){args.push(status);where.push(`status=$${args.length}`);}if(nodeId){args.push(safeId(nodeId));where.push(`node_id=$${args.length}`);}let sql='SELECT * FROM poi_discovery_candidates';if(where.length)sql+=' WHERE '+where.join(' AND ');sql+=' ORDER BY updated_at DESC,id LIMIT 200';const rows=await this.db.query(sql,args);
    return{items:rows.map(r=>({id:r.id,provider:r.provider,providerId:r.provider_id,nodeId:r.node_id,name:r.name,providerCategory:r.category,address:r.address,longitude:r.longitude===null?null:Number(r.longitude),latitude:r.latitude===null?null:Number(r.latitude),distanceM:r.distance_m===null?null:Number(r.distance_m),status:r.status,mappedCategory:r.mapped_category,descriptionDraft:r.description_draft,reviewNote:r.review_note,importedPoiId:r.imported_poi_id,source:parse(r.source_payload_json),createdAt:Number(r.created_at),updatedAt:Number(r.updated_at),reviewedAt:r.reviewed_at?Number(r.reviewed_at):null}))};
  }

  async reviewCandidate(id,{decision,mappedCategory='',descriptionDraft='',reviewNote=''},actorUserId,now=Date.now()){
    id=safeId(id);invariant(['approve','reject'].includes(decision),'INVALID_DECISION','审核决定无效');reviewNote=safeText(reviewNote,2000);descriptionDraft=safeText(descriptionDraft,3000);
    if(decision==='approve')invariant(CATEGORIES.includes(mappedCategory),'INVALID_CATEGORY','请选择游客端分类');else mappedCategory='';
    const status=decision==='approve'?'approved':'rejected';const rows=await this.db.query('UPDATE poi_discovery_candidates SET status=$1,mapped_category=$2,description_draft=$3,review_note=$4,reviewer_user_id=$5,reviewed_at=$6,updated_at=$7 WHERE id=$8 AND status!=\'imported\' RETURNING id,name,node_id,status,mapped_category',[status,mappedCategory,descriptionDraft,reviewNote,actorUserId,now,now,id]);
    invariant(rows.length,'NOT_FOUND','候选不存在或已导入',404);return{id:rows[0].id,name:rows[0].name,nodeId:rows[0].node_id,status:rows[0].status,mappedCategory:rows[0].mapped_category};
  }

  async importCandidate(id,{poiId='',subcategory=''},actorUserId,now=Date.now()){
    id=safeId(id);poiId=poiId?safeId(poiId):'poi-'+randomUUID().replaceAll('-','').slice(0,20);subcategory=safeText(subcategory,120);
    return this.db.transaction(`poi-discovery:${id}`,async tx=>{
      const r=(await tx.query('SELECT * FROM poi_discovery_candidates WHERE id=$1',[id]))[0];invariant(r,'NOT_FOUND','候选不存在',404);if(r.status==='imported')return{candidateId:id,poiId:r.imported_poi_id,replayed:true,savedAsDraft:true,published:false};invariant(r.status==='approved','CANDIDATE_NOT_APPROVED','候选必须先通过人工审核',409);invariant(CATEGORIES.includes(r.mapped_category),'INVALID_CATEGORY','候选尚未映射游客端分类',409);
      const exists=await tx.query('SELECT id FROM pois WHERE id=$1',[poiId]);invariant(!exists.length,'DUPLICATE_ID','地点ID已存在',409);
      const raw=parse(r.source_payload_json),payload={id:poiId,nodeId:r.node_id,name:r.name,category:r.mapped_category,subcategory,address:r.address||'',description:r.description_draft||'',mapPoint:Number.isFinite(Number(r.longitude))&&Number.isFinite(Number(r.latitude))?{lng:Number(r.longitude),lat:Number(r.latitude),crs:'GCJ02'}:null,cover:null,audioUrl:null,narration:'',openingHours:null,priceAdvice:null,imageLabel:null,source:{kind:'amap_poi_2_0',providerId:r.provider_id,verifiedAt:Number(r.reviewed_at||now),status:'operator_reviewed'},mediaCandidate:Array.isArray(raw.photos)&&raw.photos[0]?.url?{originalUrl:raw.photos[0].url,rightsConfirmed:false,verifiedAt:null}:undefined,publication:'reference'};
      const sort=Number((await tx.query('SELECT COALESCE(MAX(sort_order),0) AS n FROM pois WHERE node_id=$1',[r.node_id]))[0]?.n||0)+1;
      await tx.query('INSERT INTO pois(id,node_id,name,category,subcategory,address,description,cover_media_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[poiId,r.node_id,r.name,r.mapped_category,subcategory,r.address||'',r.description_draft||'',null,'active',sort,encode(payload),1,now]);
      await tx.query('UPDATE poi_discovery_candidates SET status=$1,imported_poi_id=$2,updated_at=$3 WHERE id=$4',['imported',poiId,now,id]);
      await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'poi_discovery_import',poiId,null,encode(payload),1,actorUserId,now]);
      return{candidateId:id,poiId,savedAsDraft:true,published:false};
    });
  }
}
