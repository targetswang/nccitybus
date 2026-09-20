import { invariant } from '../contracts/index.mjs';
export const OPERATIONAL_KINDS = ['events','banners','announcements','membershipPlans','benefits'];
const targets={event:'events',benefit:'benefits',walk:'city_walks',poi:'pois',station:'tourism_nodes'};
export async function validateOperational(db,kind,data){
  if(!OPERATIONAL_KINDS.includes(kind))return data;
  invariant(data&&typeof data==='object'&&!Array.isArray(data),'INVALID_CONTENT','内容必须是对象');
  invariant(typeof(data.title||data.name)==='string'&&(data.title||data.name).trim().length>0&&(data.title||data.name).length<=200,'INVALID_TITLE','请填写标题（最多200字）');
  for(const field of ['startsAt','endsAt'])if(data[field])invariant(typeof data[field]==='string'&&Number.isFinite(Date.parse(data[field])),'INVALID_DATE','开放时间格式无效');
  if(data.startsAt&&data.endsAt)invariant(Date.parse(data.endsAt)>Date.parse(data.startsAt),'INVALID_DATE','结束时间必须晚于开始时间');
  for(const field of ['capacity','validDays'])if(data[field]!==undefined)invariant(Number.isSafeInteger(data[field])&&data[field]>=0,'INVALID_NUMBER',field+' 必须为非负整数');
  if(kind==='events')invariant(['free','closed'].includes(data.registration),'INVALID_REGISTRATION','报名方式必须为免费或关闭');
  if(kind==='banners'){
    invariant(data.placement==='home','INVALID_PLACEMENT','当前支持首页 Banner');
    invariant(targets[data.targetType]||data.targetType==='guide','INVALID_TARGET','跳转类型无效');
    if(targets[data.targetType]){const table=targets[data.targetType];const row=(await db.query(`SELECT id FROM ${table} WHERE id=$1${table==='tourism_nodes'?'':" AND status='active'"}`,[data.targetId||'']))[0];invariant(row,'INVALID_TARGET','跳转目标不存在或已下架');}
  }
  if(data.membershipPlanId)invariant((await db.query("SELECT id FROM membership_plans WHERE id=$1 AND status='active'",[data.membershipPlanId])).length,'INVALID_MEMBERSHIP','会员方案不存在或已下架');
  if(data.externalUrl)invariant(/^https:\/\//.test(data.externalUrl),'INVALID_URL','外部地址必须使用 HTTPS');
  // Approval is derived from the database; callers cannot attest to their own media.
  delete data.mediaApproval;
  if(data.coverMediaId){
    const m=(await db.query('SELECT * FROM media_assets WHERE id=$1',[data.coverMediaId]))[0];
    invariant(m&&m.rights_status==='confirmed'&&m.match_status==='confirmed'&&/^[a-f0-9]{64}\.webp$/.test(m.storage_path),'UNAPPROVED_MEDIA','请选择已入库且审核通过的图片',409);
    const evidence=JSON.parse(m.evidence||'{}');
    data.cover='/media/'+m.storage_path;
    data.mediaApproval={sha256:m.storage_path.slice(0,64),rightsEvidence:evidence.rightsEvidence,matchEvidence:evidence.matchEvidence,placeMatchConfirmed:true};
  }else{invariant(!data.cover,'UNAPPROVED_MEDIA','封面必须通过素材库选择');delete data.cover;}
  return data;
}
