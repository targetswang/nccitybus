import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { DomainError, invariant } from '../contracts/index.mjs';

const sha=v=>createHash('sha256').update(String(v)).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const normalizePhone=value=>{const phone=String(value||'').trim();invariant(/^1[3-9]\d{9}$/.test(phone),'INVALID_PHONE','请输入11位手机号');return phone;};
const maskPhone=phone=>`${phone.slice(0,3)}****${phone.slice(-4)}`;

export class IntegrationVerificationService{
  constructor(db,config,assistant,transport=fetch){this.db=db;this.config=config;this.assistant=assistant;this.transport=transport;}
  async record(integration,provider,status,detail,latencyMs,actorUserId,now=Date.now()){
    const id=randomUUID();await this.db.query('INSERT INTO integration_verifications(id,integration,provider,status,detail_json,latency_ms,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,integration,provider||'',status,JSON.stringify(detail||{}),latencyMs??null,actorUserId||null,now]);return{id,integration,provider,status,detail,latencyMs:latencyMs??null,createdAt:now};
  }
  async history(limit=50){limit=Math.max(1,Math.min(200,Number(limit)||50));const rows=await this.db.query('SELECT * FROM integration_verifications ORDER BY created_at DESC LIMIT $1',[limit]);return{items:rows.map(r=>({id:r.id,integration:r.integration,provider:r.provider,status:r.status,detail:JSON.parse(r.detail_json||'{}'),latencyMs:r.latency_ms===null?null:Number(r.latency_ms),actorUserId:r.actor_user_id,createdAt:Number(r.created_at)}))};}
  async verifyAi(actorUserId,now=Date.now()){
    const st=this.assistant.status();if(!st.configured)return this.record('ai',st.provider||'','blocked',{reason:'MODEL_NOT_CONFIGURED'},null,actorUserId,now);
    const started=Date.now();try{
      const r=await this.transport(this.assistant.endpoint(),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.config.aiApiKey,'Content-Type':'application/json'},body:JSON.stringify({model:this.config.aiModel,messages:[{role:'system',content:'Return only OK.'},{role:'user',content:'health check'}],max_tokens:8,stream:false}),signal:AbortSignal.timeout(12000)});
      invariant(r.ok,'MODEL_UPSTREAM','模型服务请求失败',502);const data=await r.json();invariant(data.choices?.[0]?.message,'MODEL_RESPONSE_INVALID','模型没有返回有效消息',502);
      return this.record('ai',st.provider,'passed',{model:st.model,responseReceived:true},Date.now()-started,actorUserId,now);
    }catch(e){await this.record('ai',st.provider,'failed',{model:st.model,errorCode:e.code||'MODEL_VERIFY_FAILED'},Date.now()-started,actorUserId,now);throw e;}
  }
  async verifyWechat(actorUserId,now=Date.now()){
    const c=this.config;if(!c.wechatAppId||!c.wechatAppSecret)return this.record('wechat','official-api','blocked',{reason:'WECHAT_CREDENTIALS_NOT_CONFIGURED'},null,actorUserId,now);
    const started=Date.now(),u=new URL('https://api.weixin.qq.com/cgi-bin/token');u.searchParams.set('grant_type','client_credential');u.searchParams.set('appid',c.wechatAppId);u.searchParams.set('secret',c.wechatAppSecret);
    try{const r=await this.transport(u,{redirect:'error',signal:AbortSignal.timeout(10000)});invariant(r.ok,'WECHAT_UNAVAILABLE','微信服务暂不可用',502);const data=await r.json();invariant(data.access_token&&!data.errcode,'WECHAT_CREDENTIALS_INVALID','微信 AppID/AppSecret 校验失败',401);return this.record('wechat','official-api','passed',{appidSuffix:c.wechatAppId.slice(-6),expiresIn:Number(data.expires_in||0),accessTokenStored:false},Date.now()-started,actorUserId,now);}catch(e){await this.record('wechat','official-api','failed',{appidSuffix:c.wechatAppId.slice(-6),errorCode:e.code||'WECHAT_VERIFY_FAILED',accessTokenStored:false},Date.now()-started,actorUserId,now);throw e;}
  }
  async smsStart(phone,actorUserId,now=Date.now()){
    phone=normalizePhone(phone);const c=this.config;if(!c.smsProviderConfigured)return this.record('sms',c.smsProvider||'','blocked',{reason:'SMS_NOT_CONFIGURED'},null,actorUserId,now);
    const id=randomUUID(),code=String(randomInt(100000,1000000)),phoneHash=sha('sms-delivery:'+phone);await this.db.query('INSERT INTO sms_delivery_challenges(id,phone_hash,phone_mask,code_hash,expires_at,consumed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,phoneHash,maskPhone(phone),sha(`sms-verify:${id}:${code}`),now+300000,null,now]);
    const started=Date.now();try{const r=await this.transport(c.smsSendUrl,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+c.smsProviderToken,'Content-Type':'application/json'},body:JSON.stringify({provider:c.smsProvider,phone,templateId:c.smsTemplateId||null,signName:c.smsSignName||null,parameters:{code,expiresMinutes:5,purpose:'integration_verification'}}),signal:AbortSignal.timeout(10000)});invariant(r.ok,'SMS_UNAVAILABLE','短信服务暂不可用',502);let data={};try{data=await r.json();}catch{}invariant(data.success===true||data.code===0||data.code==='OK'||data.status==='sent','SMS_SEND_FAILED','短信发送失败',502);await this.record('sms-send',c.smsProvider,'passed',{phoneMasked:maskPhone(phone),challengeId:id,deliveryNotYetConfirmed:true},Date.now()-started,actorUserId,now);return{challengeId:id,phoneMasked:maskPhone(phone),expiresAt:now+300000,deliveryConfirmed:false};}catch(e){await this.db.query('DELETE FROM sms_delivery_challenges WHERE id=$1',[id]);await this.record('sms-send',c.smsProvider,'failed',{phoneMasked:maskPhone(phone),errorCode:e.code||'SMS_SEND_FAILED'},Date.now()-started,actorUserId,now);throw e;}
  }
  async smsConfirm(challengeId,code,actorUserId,now=Date.now()){
    invariant(typeof challengeId==='string'&&challengeId.length<=160,'INVALID_ID','短信验收ID无效');invariant(/^\d{6}$/.test(String(code||'')),'OTP_INVALID','请输入收到的6位验证码');
    return this.db.transaction(`sms-verify:${challengeId}`,async tx=>{const row=(await tx.query('SELECT * FROM sms_delivery_challenges WHERE id=$1',[challengeId]))[0];invariant(row&&!row.consumed_at&&Number(row.expires_at)>now,'OTP_EXPIRED','验收验证码已过期',401);invariant(equal(row.code_hash,sha(`sms-verify:${challengeId}:${code}`)),'OTP_INVALID','验证码不匹配，不能证明短信已送达',401);await tx.query('UPDATE sms_delivery_challenges SET consumed_at=$1 WHERE id=$2',[now,challengeId]);const id=randomUUID(),detail={phoneMasked:row.phone_mask,deliveryConfirmed:true,codeStored:false};await tx.query('INSERT INTO integration_verifications(id,integration,provider,status,detail_json,latency_ms,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,'sms-delivery',this.config.smsProvider||'', 'passed',JSON.stringify(detail),null,actorUserId||null,now]);return{id,integration:'sms-delivery',provider:this.config.smsProvider||'',status:'passed',detail,createdAt:now};});
  }
}
