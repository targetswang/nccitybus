import { randomUUID, createHash } from 'node:crypto';
import { DomainError, invariant } from '../contracts/index.mjs';
const json = value => JSON.stringify(value ?? {});
const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const text = (value, max=3000) => { const s=String(value ?? '').trim(); invariant(s.length>0&&s.length<=max,'INVALID_TEXT','文本内容无效'); return s; };
const active = (item, now=Date.now()) => item && item.operationalStatus !== 'cancelled' && (!item.startsAt || Date.parse(item.startsAt)<=now) && (!item.endsAt || Date.parse(item.endsAt)>now);
function ensureId(value){invariant(typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value),'INVALID_ID','业务ID无效');return value;}
export class UserService {
  constructor(db){this.db=db;}
  async publicStatus(catalog, now=Date.now()) {
    const [grants, registrations]=await Promise.all([
      this.db.query('SELECT benefit_id AS id, COUNT(*) AS count FROM benefit_grants GROUP BY benefit_id'),
      this.db.query("SELECT event_id AS id, COUNT(*) AS count FROM event_registrations WHERE status='registered' GROUP BY event_id")
    ]);
    const counts={benefits:new Map(grants.map(r=>[r.id,Number(r.count)])),events:new Map(registrations.map(r=>[r.id,Number(r.count)]))};
    const decorate=(kind,item)=>{
      let availability='active',availabilityReason='';
      if(item.operationalStatus==='cancelled'){availability='cancelled';availabilityReason=item.cancellationReason||'已取消';}
      else if((item.startsAt&&!Number.isFinite(Date.parse(item.startsAt)))||(item.endsAt&&!Number.isFinite(Date.parse(item.endsAt)))){availability='disabled';availabilityReason='开放时间配置无效';}
      else if(item.startsAt&&Date.parse(item.startsAt)>now){availability='upcoming';availabilityReason='尚未开放';}
      else if(item.endsAt&&Date.parse(item.endsAt)<=now){availability='expired';availabilityReason='已结束';}
      else if(kind==='events'&&item.registration!=='free'){availability='disabled';availabilityReason='未开放免费报名';}
      else if(Number(item.capacity)>0&&(counts[kind]?.get(item.id)||0)>=Number(item.capacity)){availability='full';availabilityReason='名额已满';}
      return {...item,availability,availabilityReason};
    };
    return {...catalog,...Object.fromEntries(['membershipPlans','benefits','events'].map(kind=>[kind,(catalog[kind]||[]).map(item=>decorate(kind,item))]))};
  }
  async profile(userId){
    const user=(await this.db.query('SELECT id,phone_mask,nickname,avatar_url,status,created_at,updated_at FROM users WHERE id=$1',[userId]))[0];
    invariant(user&&user.status==='active','USER_UNAVAILABLE','账号不存在或不可用',403);
    const [favorites,memberships,grants,registrations,tickets,messages]=await Promise.all([
      this.db.query('SELECT poi_id FROM user_favorites WHERE user_id=$1 ORDER BY created_at DESC',[userId]),
      this.db.query('SELECT id,plan_id,title,terms_snapshot,status,joined_at,expires_at,updated_at FROM membership_instances WHERE user_id=$1 ORDER BY joined_at DESC',[userId]),
      this.db.query('SELECT id,benefit_id,title,provider,terms_snapshot,status,claimed_at,expires_at,updated_at FROM benefit_grants WHERE user_id=$1 ORDER BY claimed_at DESC',[userId]),
      this.db.query('SELECT id,event_id,title,rules_snapshot,status,registered_at,updated_at FROM event_registrations WHERE user_id=$1 ORDER BY registered_at DESC',[userId]),
      this.db.query('SELECT id,kind,category,description,status,public_reply,created_at,updated_at FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[userId]),
      this.db.query('SELECT id,title,body,target,read_at,created_at FROM inbox_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[userId])
    ]);
    return {user:{id:user.id,phoneMasked:user.phone_mask,nickname:user.nickname,avatar:user.avatar_url},favorites:favorites.map(x=>x.poi_id),memberships:memberships.map(x=>({...x,planId:x.plan_id,terms:x.terms_snapshot,joinedAt:Number(x.joined_at),expiresAt:x.expires_at?Number(x.expires_at):null})),grants:grants.map(x=>({...x,benefitId:x.benefit_id,terms:x.terms_snapshot,claimedAt:Number(x.claimed_at),expiresAt:x.expires_at?Number(x.expires_at):null})),registrations:registrations.map(x=>({...x,eventId:x.event_id,rules:x.rules_snapshot,registeredAt:Number(x.registered_at)})),tickets:tickets.filter(x=>x.kind==='ticket').map(x=>({...x,reply:x.public_reply,createdAt:Number(x.created_at),updatedAt:Number(x.updated_at)})),privacyRequests:tickets.filter(x=>x.kind==='privacy').map(x=>({...x,reply:x.public_reply,createdAt:Number(x.created_at),updatedAt:Number(x.updated_at)})),messages:messages.map(x=>({...x,read:Boolean(x.read_at),readAt:x.read_at?Number(x.read_at):null,createdAt:Number(x.created_at)}))};
  }
  async action(userId, action, payload, catalog, now=Date.now()){
    const current=await this.db.query('SELECT status FROM users WHERE id=$1',[userId]);invariant(current[0]?.status==='active','USER_UNAVAILABLE','账号不存在或不可用',403);
    if(action==='favorite')return this.favorite(userId,payload,catalog,now);
    if(action==='join')return this.join(userId,payload,catalog,now);
    if(action==='leaveMembership')return this.leaveMembership(userId,payload,now);
    if(action==='claim')return this.claim(userId,payload,catalog,now);
    if(action==='openBenefit')return this.openBenefit(userId,payload,now);
    if(action==='register')return this.register(userId,payload,catalog,now);
    if(action==='cancelRegistration')return this.cancelRegistration(userId,payload,now);
    if(action==='ticket'||action==='privacy')return this.ticket(userId,action,payload,now);
    if(action==='readMessage')return this.readMessage(userId,payload,now);
    throw new DomainError('UNKNOWN_ACTION','不支持此用户操作',404);
  }
  async favorite(userId,p,catalog,now){
    const allowed=new Set([...(catalog.pois||[]),...(catalog.walks||[])].map(x=>x.id));const op=p.operation||'merge';
    return this.db.transaction(`favorite:${userId}`,async tx=>{
      if(op==='merge'){
        invariant(Array.isArray(p.ids)&&p.ids.length<=300,'INVALID_FAVORITES','收藏格式错误');for(const id of new Set(p.ids)){ensureId(id);if(!allowed.has(id))continue;await tx.query('INSERT INTO user_favorites(user_id,poi_id,created_at) VALUES($1,$2,$3) ON CONFLICT(user_id,poi_id) DO NOTHING',[userId,id,now]);}
      }else{
        const id=ensureId(p.id);invariant(allowed.has(id),'CONTENT_NOT_FOUND','内容不存在或已下线',404);
        if(op==='add')await tx.query('INSERT INTO user_favorites(user_id,poi_id,created_at) VALUES($1,$2,$3) ON CONFLICT(user_id,poi_id) DO NOTHING',[userId,id,now]);
        else if(op==='remove')await tx.query('DELETE FROM user_favorites WHERE user_id=$1 AND poi_id=$2',[userId,id]);
        else throw new DomainError('INVALID_FAVORITE_OPERATION','收藏操作无效');
      }
      const rows=await tx.query('SELECT poi_id FROM user_favorites WHERE user_id=$1 ORDER BY created_at DESC',[userId]);return {ids:rows.map(x=>x.poi_id),saved:true};
    });
  }
  async join(userId,p,catalog,now){
    invariant(p.accepted===true,'TERMS_REQUIRED','请先确认会员规则');const id=ensureId(p.id);const plan=(catalog.membershipPlans||[]).find(x=>x.id===id);invariant(active(plan,now),'NOT_AVAILABLE','会员方案不可用',409);
    const expiresAt=Number(plan.validDays)>0?now+Number(plan.validDays)*86400000:null;
    return this.db.transaction(`membership:${userId}:${id}`,async tx=>{
      const old=(await tx.query('SELECT * FROM membership_instances WHERE user_id=$1 AND plan_id=$2',[userId,id]))[0];
      if(old?.status==='active'&&(!old.expires_at||Number(old.expires_at)>now))return {record:{id:old.id,status:old.status},replayed:true};
      const rid=old?.id||randomUUID();
      if(old)await tx.query('UPDATE membership_instances SET title=$1,terms_snapshot=$2,status=$3,joined_at=$4,expires_at=$5,updated_at=$6 WHERE id=$7',[plan.name||plan.title,String(plan.terms||''),'active',now,expiresAt,now,rid]);
      else await tx.query('INSERT INTO membership_instances(id,user_id,plan_id,title,terms_snapshot,status,joined_at,expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[rid,userId,id,plan.name||plan.title,String(plan.terms||''),'active',now,expiresAt,now]);
      return {record:{id:rid,planId:id,title:plan.name||plan.title,status:'active',expiresAt},created:!old};
    });
  }
  async leaveMembership(userId,p,now){invariant(p.confirmed===true,'CONFIRMATION_REQUIRED','请确认退出');const id=ensureId(p.recordId);const row=(await this.db.query('SELECT * FROM membership_instances WHERE id=$1 AND user_id=$2',[id,userId]))[0];invariant(row,'NOT_FOUND','会员记录不存在',404);if(row.status==='withdrawn')return {record:{id,status:'withdrawn'},replayed:true};invariant(row.status==='active','INVALID_STATE','当前会员状态不能退出',409);await this.db.query('UPDATE membership_instances SET status=$1,updated_at=$2 WHERE id=$3',['withdrawn',now,id]);return {record:{id,status:'withdrawn'},saved:true};}
  async claim(userId,p,catalog,now){
    invariant(p.accepted===true,'TERMS_REQUIRED','请先确认权益规则');const id=ensureId(p.id);const benefit=(catalog.benefits||[]).find(x=>x.id===id);invariant(active(benefit,now),'NOT_AVAILABLE','权益不可领取',409);
    return this.db.transaction(`benefit:${id}`,async tx=>{
      const old=(await tx.query('SELECT * FROM benefit_grants WHERE user_id=$1 AND benefit_id=$2',[userId,id]))[0];if(old)return {record:{id:old.id,status:old.status},replayed:true};
      if(benefit.membershipPlanId){const membership=(await tx.query('SELECT status,expires_at FROM membership_instances WHERE user_id=$1 AND plan_id=$2',[userId,benefit.membershipPlanId]))[0];invariant(membership?.status==='active'&&(!membership.expires_at||Number(membership.expires_at)>now),'MEMBERSHIP_REQUIRED','请先加入所需会员方案',403);}
      const capacity=Number(benefit.capacity||0);if(capacity>0){const count=Number((await tx.query('SELECT COUNT(*) AS count FROM benefit_grants WHERE benefit_id=$1',[id]))[0]?.count||0);invariant(count<capacity,'BENEFIT_SOLD_OUT','权益名额已满',409);}
      const rid=randomUUID(),expiresAt=Number(benefit.validDays)>0?now+Number(benefit.validDays)*86400000:benefit.endsAt?Date.parse(benefit.endsAt):null;
      const snap={type:benefit.fulfillment||'digital',content:benefit.digitalContent||'',externalUrl:benefit.externalUrl||null,provider:benefit.provider||'',terms:benefit.rules||''};
      await tx.query('INSERT INTO benefit_grants(id,user_id,benefit_id,title,provider,terms_snapshot,fulfillment_snapshot,status,claimed_at,expires_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[rid,userId,id,benefit.name||benefit.title,benefit.provider||'',String(benefit.rules||''),json(snap),'available',now,expiresAt,now]);return {record:{id:rid,benefitId:id,title:benefit.name||benefit.title,status:'available',expiresAt},created:true};
    });
  }
  async openBenefit(userId,p,now){const id=ensureId(p.recordId);const row=(await this.db.query('SELECT * FROM benefit_grants WHERE id=$1 AND user_id=$2',[id,userId]))[0];invariant(row,'NOT_FOUND','权益不存在',404);invariant(row.status==='available'&&(!row.expires_at||Number(row.expires_at)>now),'BENEFIT_EXPIRED','权益已过期或不可用',409);return {fulfillment:parse(row.fulfillment_snapshot),usageVerified:false,message:'查看使用说明不等于已核销'};}
  async register(userId,p,catalog,now){
    invariant(p.accepted===true,'TERMS_REQUIRED','请确认活动规则');const id=ensureId(p.id);const event=(catalog.events||[]).find(x=>x.id===id);invariant(active(event,now)&&event.registration==='free','REGISTRATION_DISABLED','活动未开放报名',409);
    return this.db.transaction(`event:${id}`,async tx=>{
      const old=(await tx.query('SELECT * FROM event_registrations WHERE user_id=$1 AND event_id=$2',[userId,id]))[0];if(old?.status==='registered')return {record:{id:old.id,status:'registered'},replayed:true};
      const capacity=Number(event.capacity||0);if(capacity>0){const count=Number((await tx.query("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id=$1 AND status='registered'",[id]))[0]?.count||0);invariant(count<capacity,'EVENT_FULL','活动名额已满',409);}
      const rid=old?.id||randomUUID();if(old)await tx.query('UPDATE event_registrations SET title=$1,rules_snapshot=$2,status=$3,registered_at=$4,updated_at=$5 WHERE id=$6',[event.title,String(event.rules||''),'registered',now,now,rid]);else await tx.query('INSERT INTO event_registrations(id,user_id,event_id,title,rules_snapshot,status,registered_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[rid,userId,id,event.title,String(event.rules||''),'registered',now,now]);return {record:{id:rid,eventId:id,status:'registered'},created:!old};
    });
  }
  async cancelRegistration(userId,p,now){invariant(p.confirmed===true,'CONFIRMATION_REQUIRED','请确认取消报名');const id=ensureId(p.recordId);const row=(await this.db.query('SELECT * FROM event_registrations WHERE id=$1 AND user_id=$2',[id,userId]))[0];invariant(row,'NOT_FOUND','报名记录不存在',404);if(row.status==='cancelled')return {record:{id,status:'cancelled'},replayed:true};invariant(row.status==='registered','INVALID_STATE','当前状态不能取消报名',409);await this.db.query('UPDATE event_registrations SET status=$1,updated_at=$2 WHERE id=$3',['cancelled',now,id]);return {record:{id,status:'cancelled'},saved:true};}
  async ticket(userId,kind,p,now){
    const category=text(p.category||'其他建议',80),description=text(p.description,3000);
    const key=p.idempotencyKey;
    invariant(key===undefined||(typeof key==='string'&&/^[A-Za-z0-9_-]{16,160}$/.test(key)),'INVALID_IDEMPOTENCY_KEY','提交标识无效');
    const id=key?createHash('sha256').update(JSON.stringify([userId,kind,key])).digest('hex'):randomUUID();
    return this.db.transaction('ticket:'+id,async tx=>{
      const old=(await tx.query('SELECT id,kind,category,description,status,created_at FROM support_tickets WHERE id=$1 AND user_id=$2',[id,userId]))[0];
      if(old){invariant(old.category===category&&old.description===description,'IDEMPOTENCY_CONFLICT','同一提交标识不能用于不同内容',409);return {record:{...old,createdAt:Number(old.created_at)},replayed:true};}
      await tx.query('INSERT INTO support_tickets(id,user_id,kind,category,description,status,public_reply,internal_note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,userId,kind,category,description,'open','','',now,now]);
      return {record:{id,kind,category,description,status:'open',createdAt:now},created:true};
    });
  }
  async readMessage(userId,p,now){const id=ensureId(p.recordId);const row=(await this.db.query('SELECT read_at FROM inbox_messages WHERE id=$1 AND user_id=$2',[id,userId]))[0];invariant(row,'NOT_FOUND','消息不存在',404);if(!row.read_at)await this.db.query('UPDATE inbox_messages SET read_at=$1 WHERE id=$2',[now,id]);return {record:{id,read:true,readAt:Number(row.read_at||now)},saved:true};}
}
