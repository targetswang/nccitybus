import {homeFrom} from './content-hydration.mjs';
export const CONTENT_KINDS=['nodes','pois','walks','banners','announcements','membershipPlans','benefits','events'];
// Exclude only system bookkeeping, not business text, URLs, rules or step order.
function normalized(value){
 if(Array.isArray(value))return value.map(normalized);
 if(!value||typeof value!=='object')return value;
 const out={};for(const key of Object.keys(value).sort()){
  if(['coverMediaId','mediaApproval','audioApproval','publication'].includes(key)||value[key]===undefined)continue;
  if(key==='source'){const {status,verifiedAt,...source}=value[key]||{};out.source=normalized(source);}
  else out[key]=normalized(value[key]);
 }return out;
}
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
function fields(a,b){const out=[];for(const key of new Set([...Object.keys(a||{}),...Object.keys(b||{})]))if(!equal({[key]:a?.[key]},{[key]:b?.[key]})&&!['coverMediaId','mediaApproval','audioApproval','publication'].includes(key))out.push({field:key,published:a?.[key]??null,draft:b?.[key]??null});return out;}
export function compareContent(published,draft,records){
 const differences=[],counts={};
 for(const kind of CONTENT_KINDS){
  const live=new Map((published?.[kind]||[]).map(x=>[x.id,x])),editing=new Map((records[kind]||[]).map(x=>[x.id,x]));
  counts[kind]={published:live.size,draft:editing.size};
  for(const id of new Set([...live.keys(),...editing.keys()])){
   const a=live.get(id),row=editing.get(id),b=row?.data;
   const status=!row?'missing':row.status==='offline'?(a?'offline':null):!a?'added':equal(a,b)?null:'changed';
   if(status)differences.push({kind,id,title:b?.title||b?.name||a?.title||a?.name||id,status,revision:row?.revision||null,fields:fields(a,b)});
  }
  if(draft&&published){const liveIds=(published[kind]||[]).map(x=>x.id),draftIds=(draft[kind]||[]).map(x=>x.id);if(liveIds.length===draftIds.length&&liveIds.every(id=>draftIds.includes(id))&&!equal(liveIds,draftIds))differences.push({kind,id:'$order',title:'展示顺序',status:'changed',fields:[{field:'order',published:liveIds,draft:draftIds}]});}
 }
 if(published&&draft){
  const a={...published,home:homeFrom(published)},b={...draft};
  for(const key of [...CONTENT_KINDS,'version','publication','approval']){delete a[key];delete b[key];}
  // The legacy snapshot format omitted these optional defaults.
  for(const c of [a,b]){c.routeId ||= 'jialing-loop';c.routeName ||= c.title;c.description ||= '';c.notice ||= '';c.guides ||= [];c.privacy ||= '';}
  const changed=fields(a,b);if(changed.length)differences.push({kind:'configuration',id:'home-route',title:'首页与线路配置',status:'changed',fields:changed});
 }
 return {publishedVersion:published?.version||null,draftVersion:draft?.version||null,counts,differences,missingCount:differences.filter(x=>x.status==='missing').length,hasChanges:differences.length>0};
}
