import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { invariant, text } from '../contracts/index.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
export function validAdmin(header, configured) {
    if (!configured)
        return false;
    const candidate = String(header || '').replace(/^Bearer /, '');
    const a = Buffer.from(hash(candidate)), b = Buffer.from(hash(configured));
    return timingSafeEqual(a, b);
}
export class AuthService {
    constructor(db, config, transport = fetch) {
        this.db = db;
        this.config = config;
        this.transport = transport;
    }
    async login(code, now = Date.now()) {
        text(code, 'code', 256);
        const c = this.config;
        invariant(c.wechatAppId && c.wechatAppSecret, 'LOGIN_NOT_CONFIGURED', '微信登录暂未开通', 503);
        const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
        for (const [k, v] of Object.entries({
            appid: c.wechatAppId,
            secret: c.wechatAppSecret,
            js_code: code,
            grant_type: 'authorization_code'
        }))
            url.searchParams.set(k, v);
        let response;
        try {
            response = await this.transport(url, {
                signal: AbortSignal.timeout(8000),
                redirect: 'error'
            });
        }
        catch {
            throw Object.assign(new Error('登录服务暂不可用'), {
                code: 'WECHAT_UNAVAILABLE',
                status: 502
            });
        }
        invariant(response.ok, 'WECHAT_UNAVAILABLE', '登录服务暂不可用', 502);
        const data = await response.json();
        invariant(!data.errcode && typeof data.openid === 'string', 'WECHAT_LOGIN_FAILED', '微信登录校验失败', 401);
        const provider = hash(`wechat:${c.wechatAppId}:${data.openid}`), token = randomBytes(32).toString('base64url'), expiry = now + 7 * 86400000;
        const userId = await this.db.transaction(`account:${provider}`, async (tx) => {
            const existing = await tx.query('SELECT id FROM accounts WHERE provider_key=$1', [
                provider
            ]);
            let id = existing[0]?.id;
            if (!id) {
                id = randomUUID();
                await tx.query('INSERT INTO accounts(id,provider_key,created_at) VALUES($1,$2,$3)', [
                    id,
                    provider,
                    now
                ]);
            }
            await tx.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
                hash(token),
                id,
                expiry
            ]);
            return id;
        });
        return {
            token,
            userId,
            expiresAt: expiry
        };
    }
    async user(header, now = Date.now()) {
        const token = String(header || '').replace(/^Bearer /, '');
        invariant(token.length >= 20, 'UNAUTHORIZED', '请先登录', 401);
        const rows = await this.db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>$2', [
            hash(token),
            now
        ]);
        invariant(rows.length, 'UNAUTHORIZED', '登录已过期', 401);
        return rows[0].user_id;
    }
    async logout(header) {
        const token = String(header || '').replace(/^Bearer /, '');
        await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [
            hash(token)
        ]);
    }
}

