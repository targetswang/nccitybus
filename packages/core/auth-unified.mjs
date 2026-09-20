import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { DomainError, invariant, text } from '../contracts/index.mjs';
const sha = value => createHash('sha256').update(String(value)).digest('hex');
const maskPhone = phone => `${phone.slice(0,3)}****${phone.slice(-4)}`;
function constantEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
function normalizePhone(phone){const value=String(phone||'').trim();invariant(/^1[3-9]\d{9}$/.test(value),'INVALID_PHONE','请输入11位手机号');return value;}
function rolePermissions(role){
  const map={
    admin:['*'],
    publisher:['content.read','content.write','content.publish','media.manage','user.read','ticket.manage','benefit.manage'],
    operator:['content.read','content.write','media.manage'],
    customer_service:['user.read','ticket.manage','benefit.manage'],
    viewer:['content.read']
  };
  return map[role]||[];
}
export class UnifiedAuthService {
  constructor(db, config, transport=fetch){this.db=db;this.config=config;this.transport=transport;this.accessToken=null;}
  async ensureUserByWechat({openid,unionid,phone}, now=Date.now()){
    const appId=this.config.wechatAppId;invariant(appId,'LOGIN_NOT_CONFIGURED','微信登录暂未开通',503);
    const openKey=sha(`wechat:${appId}:${openid}`);const unionKey=unionid?sha(`wechat-union:${unionid}`):null;
    return this.db.transaction(`wechat:${openKey}`,async tx=>{
      const existing=await tx.query("SELECT u.id,u.status,u.phone_hash,u.phone_mask FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.kind='wechat_openid' AND i.provider_key=$1",[openKey]);
      let user=existing[0];
      if(!user&&phone){
        const ph=sha(`phone:${normalizePhone(phone)}`);
        const byPhone=await tx.query('SELECT id,status,phone_hash,phone_mask FROM users WHERE phone_hash=$1',[ph]);
        user=byPhone[0]||null;
      }
      if(!user){
        const id=randomUUID(),ph=phone?sha(`phone:${normalizePhone(phone)}`):null;
        await tx.query('INSERT INTO users(id,phone_hash,phone_mask,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',[id,ph,phone?maskPhone(phone):null,'active',now,now]);user={id,status:'active',phone_hash:ph,phone_mask:phone?maskPhone(phone):null};
        if(ph)await tx.query('INSERT INTO user_identities(id,user_id,kind,provider_key,verified_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,'phone',ph,now,now]);
      }
      invariant(user.status==='active','USER_DISABLED','账号不可用',403);
      await tx.query('INSERT INTO user_identities(id,user_id,kind,provider_key,verified_at,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,provider_key) DO NOTHING',[randomUUID(),user.id,'wechat_openid',openKey,now,now]);
      if(unionKey)await tx.query('INSERT INTO user_identities(id,user_id,kind,provider_key,verified_at,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,provider_key) DO NOTHING',[randomUUID(),user.id,'wechat_unionid',unionKey,now,now]);
      return {id:user.id,phoneHash:user.phone_hash||null,phoneMasked:user.phone_mask||null};
    });
  }
  async requestChallenge(phone,audience='user',now=Date.now()){
    phone=normalizePhone(phone);invariant(['user','admin'].includes(audience),'INVALID_AUDIENCE','登录入口无效');
    invariant(!this.config.production || this.config.smsProviderConfigured,'SMS_NOT_CONFIGURED','正式短信服务尚未配置',503);
    const phoneHash=sha(`phone:${phone}`),id=randomUUID();
    const recent=await this.db.query('SELECT created_at FROM auth_challenges WHERE phone_hash=$1 ORDER BY created_at DESC LIMIT 1',[phoneHash]);
    invariant(!recent.length||now-Number(recent[0].created_at)>=60000,'OTP_RATE_LIMIT','请稍后再次获取验证码',429);
    const code=this.config.production?String(randomInt(100000,1000000)):this.config.testLoginCode;
    invariant(/^\d{6}$/.test(code||''),this.config.production?'SMS_NOT_CONFIGURED':'TEST_AUTH_NOT_CONFIGURED',this.config.production?'正式短信服务尚未配置':'联调验证码尚未配置',503);
    await this.db.query('INSERT INTO auth_challenges(id,phone_hash,phone_mask,audience,code_hash,attempts,expires_at,consumed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,phoneHash,maskPhone(phone),audience,sha(`otp:${id}:${code}`),0,now+300000,null,now]);
    if(this.config.production){
      try{await this.sendSms(phone,code);}catch(e){await this.db.query('DELETE FROM auth_challenges WHERE id=$1',[id]);throw e;}
      return {challengeId:id,phoneHash,expiresAt:now+300000,mode:'sms'};
    }
    return {challengeId:id,phoneHash,expiresAt:now+300000,mode:'test',debugCode:code};
  }
  async sendSms(phone,code){
    const c=this.config;invariant(c.smsProviderConfigured,'SMS_NOT_CONFIGURED','正式短信服务尚未配置',503);
    let response;try{response=await this.transport(c.smsSendUrl,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+c.smsProviderToken,'Content-Type':'application/json'},body:JSON.stringify({provider:c.smsProvider,phone,templateId:c.smsTemplateId||null,signName:c.smsSignName||null,parameters:{code,expiresMinutes:5}}),signal:AbortSignal.timeout(8000)});}catch{throw new DomainError('SMS_UNAVAILABLE','短信服务暂不可用',502);}
    invariant(response.ok,'SMS_UNAVAILABLE','短信服务暂不可用',502);let data={};try{data=await response.json();}catch{}
    invariant(data.success===true||data.code===0||data.code==='OK'||data.status==='sent','SMS_SEND_FAILED','短信发送失败',502);
    return {provider:c.smsProvider};
  }
  async verifyChallenge({challengeId,phoneHash,code,clientType='h5'},now=Date.now()){
    text(challengeId,'challengeId',160);text(phoneHash,'phoneHash',128);text(code,'code',16);
    const result = await this.db.transaction(`challenge:${challengeId}`,async tx=>{
      const rows=await tx.query('SELECT * FROM auth_challenges WHERE id=$1 AND phone_hash=$2',[challengeId,phoneHash]);const c=rows[0];
      invariant(c&&!c.consumed_at&&Number(c.expires_at)>now&&Number(c.attempts)<5,'OTP_EXPIRED','验证码已失效，请重新获取',401);
      if(!constantEqual(c.code_hash,sha(`otp:${challengeId}:${code}`))){await tx.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1',[challengeId]);return {invalidCode:true};}
      await tx.query('UPDATE auth_challenges SET consumed_at=$1 WHERE id=$2',[now,challengeId]);
      let users=await tx.query('SELECT id,status,phone_mask FROM users WHERE phone_hash=$1',[phoneHash]),user=users[0];
      if(!user){const id=randomUUID();await tx.query('INSERT INTO users(id,phone_hash,phone_mask,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',[id,phoneHash,c.phone_mask,'active',now,now]);await tx.query('INSERT INTO user_identities(id,user_id,kind,provider_key,verified_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,'phone',phoneHash,now,now]);user={id,status:'active',phone_mask:c.phone_mask};}
      invariant(user.status==='active','USER_DISABLED','账号不可用',403);
      let role='user';
      if(c.audience==='admin'){
        const rows=await tx.query('SELECT role,enabled FROM staff_roles WHERE user_id=$1',[user.id]);
        if(rows[0]?.enabled)role=rows[0].role;
        else if(!rows.length&&this.config.initialAdminPhoneHash&&constantEqual(this.config.initialAdminPhoneHash,phoneHash)){role='admin';await tx.query('INSERT INTO staff_roles(user_id,role,enabled,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,enabled=excluded.enabled,updated_at=excluded.updated_at',[user.id,'admin',1,now]);}
        else throw new DomainError('ADMIN_NOT_ALLOWED','该手机号未开通后台权限',403);
      }
      return this.issueSession(tx,{userId:user.id,audience:c.audience,role,clientType,authMethod:'phone_otp',phoneMasked:user.phone_mask},now);
    });
    // Commit failed attempts before returning an authentication error.
    if(result.invalidCode)throw new DomainError('OTP_INVALID','验证码错误',401);
    return result;
  }
  async issueSession(tx,{userId,audience='user',role='user',clientType='unknown',authMethod,phoneMasked=null},now=Date.now()){
    const token=randomBytes(32).toString('base64url'),id=randomUUID(),expiresAt=now+(audience==='admin'?8*3600000:7*86400000);
    await tx.query('INSERT INTO user_sessions(id,token_hash,user_id,audience,role,client_type,auth_method,expires_at,revoked_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,sha(token),userId,audience,role,clientType,authMethod,expiresAt,null,now]);
    return {token,expiresAt,user:{id:userId,phoneMasked,role,audience,permissions:rolePermissions(role)}};
  }
  async session(headerOrToken,audience=null,now=Date.now()){
    const token=String(headerOrToken||'').replace(/^Bearer\s+/i,'');invariant(token.length>=20,'UNAUTHORIZED','请先登录',401);
    const rows=await this.db.query('SELECT s.*,u.status,u.phone_mask FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2',[sha(token),now]);const s=rows[0];
    invariant(s&&s.status==='active','UNAUTHORIZED','登录已过期',401);if(audience)invariant(s.audience===audience,'WRONG_AUDIENCE','会话用途不匹配',403);
    if(s.audience==='admin'){const role=await this.db.query('SELECT role,enabled FROM staff_roles WHERE user_id=$1',[s.user_id]);invariant(role[0]?.enabled,'STAFF_DISABLED','工作人员权限已撤销',403);s.role=role[0].role;}
    return {token,userId:s.user_id,audience:s.audience,role:s.role,phoneMasked:s.phone_mask,permissions:rolePermissions(s.role),sessionId:s.id,expiresAt:Number(s.expires_at)};
  }
  async logout(headerOrToken,now=Date.now()){
    const token=String(headerOrToken||'').replace(/^Bearer\s+/i,'');if(!token)return;
    await this.db.query('UPDATE user_sessions SET revoked_at=$1 WHERE token_hash=$2 AND revoked_at IS NULL',[now,sha(token)]);
  }
  async exchangeWechatLogin(loginCode){
    text(loginCode,'loginCode',256);const c=this.config;invariant(c.wechatAppId&&c.wechatAppSecret,'LOGIN_NOT_CONFIGURED','微信登录暂未开通',503);
    const url=new URL('https://api.weixin.qq.com/sns/jscode2session');for(const [k,v] of Object.entries({appid:c.wechatAppId,secret:c.wechatAppSecret,js_code:loginCode,grant_type:'authorization_code'}))url.searchParams.set(k,v);
    let response;try{response=await this.transport(url,{signal:AbortSignal.timeout(8000),redirect:'error'});}catch{throw new DomainError('WECHAT_UNAVAILABLE','微信登录服务暂不可用',502);}
    invariant(response.ok,'WECHAT_UNAVAILABLE','微信登录服务暂不可用',502);const data=await response.json();invariant(!data.errcode&&typeof data.openid==='string','WECHAT_LOGIN_FAILED','微信登录校验失败',401);return data;
  }
  async wechatLogin(loginCode,now=Date.now()){
    const data=await this.exchangeWechatLogin(loginCode);const u=await this.ensureUserByWechat({openid:data.openid,unionid:data.unionid},now);
    return this.db.transaction(`session:${u.id}`,tx=>this.issueSession(tx,{userId:u.id,audience:'user',role:'user',clientType:'weapp',authMethod:'wechat_openid',phoneMasked:u.phoneMasked},now));
  }
  async wechatPhoneLogin(phoneCode,loginCode,now=Date.now()){
    text(phoneCode,'phoneCode',256);const identity=await this.exchangeWechatLogin(loginCode);const access=await this.wechatAccessToken();
    let response;try{response=await this.transport('https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token='+encodeURIComponent(access),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:phoneCode}),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{throw new DomainError('WECHAT_PHONE_UNAVAILABLE','微信手机号服务暂不可用',502);}
    invariant(response.ok,'WECHAT_PHONE_UNAVAILABLE','微信手机号服务暂不可用',502);const data=await response.json();const phone=data.phone_info?.purePhoneNumber;invariant(!data.errcode&&typeof phone==='string','WECHAT_PHONE_FAILED','微信手机号校验失败',401);
    const u=await this.ensureUserByWechat({openid:identity.openid,unionid:identity.unionid,phone},now);
    return this.db.transaction(`session:${u.id}`,tx=>this.issueSession(tx,{userId:u.id,audience:'user',role:'user',clientType:'weapp',authMethod:'wechat_phone',phoneMasked:u.phoneMasked},now));
  }
  async wechatAccessToken(now=Date.now()){
    if(this.accessToken&&this.accessToken.expiresAt>now+60000)return this.accessToken.value;
    const c=this.config,u=new URL('https://api.weixin.qq.com/cgi-bin/token');u.searchParams.set('grant_type','client_credential');u.searchParams.set('appid',c.wechatAppId);u.searchParams.set('secret',c.wechatAppSecret);
    const r=await this.transport(u,{signal:AbortSignal.timeout(8000),redirect:'error'});invariant(r.ok,'WECHAT_UNAVAILABLE','微信服务暂不可用',502);const data=await r.json();invariant(data.access_token&&!data.errcode,'WECHAT_UNAVAILABLE','微信服务暂不可用',502);this.accessToken={value:data.access_token,expiresAt:now+Math.max(300,Number(data.expires_in||7200)-120)*1000};return this.accessToken.value;
  }
}

