import {createHash,randomUUID} from 'node:crypto';
import {invariant,validateCatalog} from '../contracts/index.mjs';
const encode=v=>JSON.stringify(v??{});
const key=v=>{invariant(typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v),'INVALID_ID','业务 ID 无效');return v;};
export const EXTRAS={banners:'banners',announcements:'announcements',membershipPlans:'membership_plans',benefits:'benefits',events:'events'};
export const homeFrom=c=>c.home??{title:c.title,heroTitle:'把南充，坐成一段风景。',heroSubtitle:'沿着嘉陵江，慢慢看这座城。',notice:c.notice,featuredWalkIds:[],maxBanners:3};
// Called inside the caller's transaction. Existing rows are deliberately immutable here.
export async function hydrateCatalog(tx,catalog,{actor='migration',now=Date.now()}={}){
    validateCatalog(catalog);
    const report={version:catalog.version,inserted:{},preserved:{},mediaConflicts:[]};
    const insert=async(kind,sql,args)=>{const rows=await tx.query(sql,args);const bucket=rows.length?report.inserted:report.preserved;bucket[kind]=(bucket[kind]||0)+1;return rows;};
    const routeId=key(catalog.routeId||'jialing-loop');

      const routePayload={collectionOrder:Object.fromEntries(Object.keys(EXTRAS).map(k=>[k,(catalog[k]||[]).map(x=>x.id)])),catalogMetadata:Object.fromEntries(Object.entries(catalog).filter(([k])=>!['version','publication','approval','nodes','pois','walks','home',...Object.keys(EXTRAS)].includes(k))),id:routeId,name:catalog.routeName||catalog.title,description:catalog.description||'',title:catalog.title,notice:catalog.notice,guides:catalog.guides||[],privacy:catalog.privacy||'',sourceVersion:catalog.version};
      await insert('routes','INSERT INTO tourism_routes(id,name,description,status,sort_order,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id',[routeId,routePayload.name,routePayload.description,'active',0,encode(routePayload),now]);
      for(const [index,node] of catalog.nodes.entries())await insert('nodes','INSERT INTO tourism_nodes(id,route_id,name,persona,sequence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id',[key(node.id),routeId,node.name,node.persona||'',index+1,encode(node),now]);
      for(const [index,p] of catalog.pois.entries()){
        const mediaId=await mediaFor(tx,p,'pois',now,report);
        const payload={...p,...(mediaId?{coverMediaId:mediaId}:{})};await insert('pois','INSERT INTO pois(id,node_id,name,category,subcategory,address,description,cover_media_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING RETURNING id',[key(p.id),key(p.nodeId),p.name,p.category,p.subcategory||'',p.address||'',p.description||'',mediaId,'active',index+1,encode(payload),1,now]);
      }
      for(const [index,w] of catalog.walks.entries()){
        const inserted=await insert('walks','INSERT INTO city_walks(id,title,subtitle,cover_poi_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id',[key(w.id),w.title,w.subtitle||'',key(w.coverPoiId),'active',index+1,encode({...w,steps:undefined}),1,now]);
        if(!inserted.length)continue;
        for(const [i,s] of (w.steps||[]).entries())await tx.query('INSERT INTO city_walk_steps(walk_id,sequence,poi_id,title,payload_json) VALUES($1,$2,$3,$4,$5)',[w.id,i+1,key(s.poiId),s.title,encode(s)]);
      }
      const home=homeFrom(catalog);
      await insert('home','INSERT INTO home_config(singleton,payload_json,revision,updated_at) VALUES(1,$1,$2,$3) ON CONFLICT(singleton) DO NOTHING RETURNING singleton',[encode(home),1,now]);

    for(const [kind,table]of Object.entries(EXTRAS))for(const [i,item]of (catalog[kind]||[]).entries()){
      const mediaId=await mediaFor(tx,item,kind,now,report),data={...item,...(mediaId?{coverMediaId:mediaId}:{})};
      if(kind==='banners')await insert(kind,'INSERT INTO banners(id,placement,target_type,target_id,status,sort_order,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id',[key(item.id),item.placement||'home',item.targetType||'guide',item.targetId||null,'active',i,encode(data),1,now]);
      else await insert(kind,`INSERT INTO ${table}(id,status,payload_json,revision,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id`,[key(item.id),'active',encode(data),1,now]);
    }
    if(Object.values(report.inserted).some(Boolean))await tx.query('INSERT INTO content_edit_history(id,kind,business_id,before_json,after_json,revision,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),'reconciliation',catalog.version,null,encode(report),1,actor,now]);
    return report;
}
async function mediaFor(tx,item,kind,now,report){
  const source=item.cover||item.mediaCandidate?.originalUrl||null;
  if(!source&&!item.coverMediaId)return null;
  const id=key(item.coverMediaId||(kind==='pois'&&item.id.length<=154?'media-'+item.id:'media-'+createHash('sha256').update(kind+':'+item.id).digest('hex')));
  const storage=typeof source==='string'?source.match(/^\/media\/([a-f0-9]{64}\.webp)$/)?.[1]||null:null;
  const approval=item.mediaApproval,verified=Boolean(storage&&approval?.sha256===storage.slice(0,64)&&approval?.rightsEvidence&&approval?.placeMatchConfirmed===true);
  const rows=await tx.query('INSERT INTO media_assets(id,source_url,storage_path,mime_type,width,height,rights_status,match_status,evidence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING RETURNING id',[id,source,storage,storage?'image/webp':null,null,null,verified?'confirmed':'inherited_unverified',verified?'confirmed':'inherited_unverified',encode(verified?{rightsEvidence:approval.rightsEvidence,matchEvidence:approval.matchEvidence||'已发布版本保留的匹配审核',importedFromPublished:true}:{}),encode({id,sourceUrl:source,imageLabel:item.imageLabel||null}),now]);
  const bucket=rows.length?report.inserted:report.preserved;bucket.media=(bucket.media||0)+1;
  if(!rows.length){const current=(await tx.query('SELECT storage_path,source_url FROM media_assets WHERE id=$1',[id]))[0];if(source&&(current.storage_path?'/media/'+current.storage_path:current.source_url)!==source&&current.source_url!==source)report.mediaConflicts.push({id,publishedUrl:source,existingUrl:current.storage_path?'/media/'+current.storage_path:current.source_url});}
  return id;
}
