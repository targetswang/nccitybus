import { isIP } from 'node:net';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DomainError, invariant, integer, identifier } from '../../packages/contracts/index.mjs';
import { validAdmin } from '../../packages/core/admin-token.mjs';
import { UnifiedAuthService } from '../../packages/core/auth-unified.mjs';
import { UserService } from '../../packages/core/user-service.mjs';
import { ContentService } from '../../packages/core/content-service.mjs';
import { AdminService } from '../../packages/core/admin-service.mjs';
import { AssistantService } from '../../packages/core/assistant-service.mjs';
import { OperationsService } from '../../packages/core/operations-service.mjs';
import { IntegrationVerificationService } from '../../packages/core/integration-verification.mjs';
import { liveSnapshot, arrivals } from '../../packages/core/transit.mjs';
import { decodeEnvelope, signedEnvelope } from '../../packages/ivy/crypto.mjs';
import { missingIvy } from '../../packages/core/config.mjs';
import { log } from '../../packages/core/log.mjs';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg'
};
const SAFE_POI_FIELDS = [
    'id',
    'nodeId',
    'name',
    'category',
    'subcategory',
    'address',
    'description',
    'mapPoint',
    'cover',
    'imageLabel',
    'audioUrl',
    'narration',
    'openingHours',
    'priceAdvice',
    'publication'
];
function mediaUrl(value, base) {
    return value && value.startsWith('/media/') && base ? base.replace(/\/$/, '') + value : value;
}
function publicPoi(p, base = '') {
    return Object.fromEntries(SAFE_POI_FIELDS.map(k => [
        k,
        [
            'cover',
            'audioUrl'
        ].includes(k) ? mediaUrl(p[k] ?? null, base) : p[k] ?? null
    ]));
}
function publicCatalog(c, base) {
    return {
        ...Object.fromEntries(Object.entries(c).filter(([k]) => !['approval', 'source'].includes(k))),
        pois: c.pois.map(p => publicPoi(p, base)),
        walks: c.walks.map(({ source, ...w }) => ({
            ...w,
            steps: w.steps.map(s => ({
                ...s,
                audioUrl: mediaUrl(s.audioUrl, base)
            }))
        }))
    };
}
async function body(req, max = 16384) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
        size += c.length;
        invariant(size <= max, 'BODY_TOO_LARGE', '请求过大', 413);
        chunks.push(c);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
        const parsed = raw ? JSON.parse(raw) : {};
        invariant(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'BAD_JSON', '请求必须是 JSON 对象');
        return parsed;
    }
    catch {
        throw new DomainError('BAD_JSON', 'JSON 格式错误');
    }
}
function send(res, status, value, headers = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(value === null ? '' : JSON.stringify(value));
}
function positive(query, key, fallback, max) {
    const raw = query.get(key);
    if (raw === null)
        return fallback;
    return integer(Number(raw), key, 1, max);
}
export function createApi({ config, repository, transport = fetch }) {
    const auth = new UnifiedAuthService(repository.db, config, transport), users = new UserService(repository.db), content = new ContentService(repository.db, repository), admin = new AdminService(repository.db, users), assistant = new AssistantService(repository.db, content, config, transport), operations = new OperationsService(repository.db, content, config, transport), integrations = new IntegrationVerificationService(repository.db, config, assistant, transport), rates = new Map();
    const server = http.createServer(async (req, res) => {
        const requestId = randomUUID(), started = Date.now();
        res.setHeader('X-Request-Id', requestId);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', 'default-src \'self\'; script-src \'self\' https://map.qq.com https://mapapi.qq.com; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:; connect-src \'self\' https://*.qq.com; worker-src \'self\' blob:; media-src \'self\' https:; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'');
        const origin = req.headers.origin;
        if (origin && config.corsOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,If-None-Match');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
        }
        try {
            if (req.method === 'OPTIONS') {
                invariant(!origin || (config.corsOrigins.includes(origin) || origin === config.publicBaseUrl), 'ORIGIN_DENIED', 'Origin not allowed', 403);
                res.writeHead(204);
                return res.end();
            }
            if (origin && [
                'POST',
                'DELETE',
                'PUT',
                'PATCH'
            ].includes(req.method))
                invariant((config.corsOrigins.includes(origin) || origin === config.publicBaseUrl), 'ORIGIN_DENIED', 'Origin not allowed', 403);
            const url = new URL(req.url, 'http://localhost'), method = req.method;
            let pathname;
            try {
                pathname = decodeURIComponent(url.pathname);
            }
            catch {
                throw new DomainError('BAD_PATH', 'URL 编码错误');
            }
            const peer = req.socket.remoteAddress || 'unknown';
            const forwarded = String(req.headers['x-real-ip'] || '');
            const ip = config.trustedProxyIps?.includes(peer) && isIP(forwarded) ? forwarded : peer;
            if (pathname.startsWith('/api/')) {
                const at = Date.now(), prior = rates.get(ip);
                const limit = prior && at - prior.at < 60000 ? prior : {
                    at,
                    count: 0
                };
                limit.count++;
                rates.set(ip, limit);
                invariant(limit.count <= (config.ratePerMinute || 1200), 'RATE_LIMIT', '请求过于频繁', 429);
                if (rates.size > 5000)
                    for (const [k, v] of rates)
                        if (at - v.at > 60000)
                            rates.delete(k);
            }
            if (pathname === '/api/v1/health' && method === 'GET') {
                await repository.db.query('SELECT 1');
                return send(res, 200, {
                    schemaVersion: 'v1',
                    ok: true
                });
            }
            if (pathname === '/api/v1/capabilities' && method === 'GET')
                return send(res, 200, {
                    schemaVersion: 'v1',
                    map: {
                        h5Key: config.h5MapKey || null
                    },
                    transitCode: {
                        configured: Boolean(config.transitAppId),
                        appId: config.transitAppId || null,
                        path: config.transitAppPath || null
                    },
                    login: {
                        wechat: Boolean(config.wechatAppId && config.wechatAppSecret)
                    },
                    routes: config.transit.routes.map(r => ({
                        id: r.id,
                        name: r.name
                    }))
                });
            if (pathname.startsWith('/api/v1/admin/')) {
                let actor = null;
                if (validAdmin(req.headers.authorization, config.adminToken)) actor = { userId: 'legacy-admin-token', role: 'admin', audience: 'admin', permissions: ['*'] };
                else {
                    try { const session = await auth.session(req.headers.authorization, 'admin'); actor = { userId: session.userId, role: session.role, audience: 'admin', permissions: session.permissions }; }
                    catch { throw new DomainError('UNAUTHORIZED', '需要运营权限', 401); }
                }
                const requirePermission = permission => invariant(actor.permissions.includes('*') || actor.permissions.includes(permission), 'FORBIDDEN', '当前账号没有此操作权限', 403);
                if (pathname === '/api/v1/admin/integrations' && method === 'GET') {
                    requirePermission('content.read');
                    return send(res, 200, {
                        ivy: { missing: missingIvy(config), mqtt: await repository.state(`mqtt:${config.transit.operatorId}`), routes: await Promise.all(config.transit.routes.map(async (r) => ({ id: r.id, state: await repository.state(`sync:${r.id}`) }))) },
                        ai: assistant.status(),
                        sms: { configured: Boolean(config.smsProviderConfigured), provider: config.smsProvider || null },
                        wechat: { configured: Boolean(config.wechatAppId && config.wechatAppSecret), appidSuffix: config.wechatAppId ? config.wechatAppId.slice(-6) : null },
                        poiDiscovery: operations.discoveryStatus()
                    });
                }
                if (pathname === '/api/v1/admin/content/counts' && method === 'GET') { requirePermission('content.read'); return send(res, 200, await content.counts()); }
                if (pathname === '/api/v1/admin/content/home' && method === 'GET') { requirePermission('content.read'); return send(res, 200, await content.home()); }
                if (pathname === '/api/v1/admin/content/home' && method === 'POST') {
                    requirePermission('content.write'); const payload = await body(req); return send(res, 200, await content.save('home','home',payload.data||{}, { expectedRevision: payload.expectedRevision, actorUserId: actor.userId }));
                }
                const listMatch = pathname.match(/^\/api\/v1\/admin\/content\/(nodes|pois|walks|banners|announcements|membershipPlans|benefits|events)$/);
                if (listMatch && method === 'GET') { requirePermission('content.read'); return send(res, 200, { items: await content.list(listMatch[1]) }); }
                const itemMatch = pathname.match(/^\/api\/v1\/admin\/content\/(nodes|pois|walks|banners|announcements|membershipPlans|benefits|events)\/([^/]+)$/);
                if (itemMatch && method === 'GET') { requirePermission('content.read'); const item = await content.get(itemMatch[1], itemMatch[2]); invariant(item, 'NOT_FOUND', '内容不存在', 404); return send(res, 200, item); }
                if (itemMatch && method === 'POST') { requirePermission('content.write'); const payload = await body(req); return send(res, 200, await content.save(itemMatch[1], itemMatch[2], payload.data||{}, { expectedRevision: payload.expectedRevision, actorUserId: actor.userId })); }
                if (pathname === '/api/v1/admin/content/preview' && method === 'GET') { requirePermission('content.read'); return send(res, 200, await content.buildCatalog()); }
                if (pathname === '/api/v1/admin/content/publish' && method === 'POST') { requirePermission('content.publish'); const payload=await body(req); return send(res, 200, await content.publish({ actorUserId: actor.userId, approved: payload.approved===true, approval: payload.approval, expectedDraftVersion: payload.expectedDraftVersion, requireApproved: config.production })); }
                if (pathname === '/api/v1/admin/users' && method === 'GET') { requirePermission('user.read'); return send(res, 200, await admin.listUsers()); }
                const userMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
                if (userMatch && method === 'GET') { requirePermission('user.read'); return send(res, 200, await admin.userDetail(userMatch[1])); }
                if (pathname === '/api/v1/admin/tickets' && method === 'GET') { requirePermission('ticket.manage'); return send(res, 200, await admin.listTickets({ status:url.searchParams.get('status'), kind:url.searchParams.get('kind') })); }
                const ticketMatch = pathname.match(/^\/api\/v1\/admin\/tickets\/([^/]+)$/);
                if (ticketMatch && method === 'POST') { requirePermission('ticket.manage'); const payload=await body(req); return send(res, 200, await admin.updateTicket(ticketMatch[1], payload, actor.userId)); }
                if (pathname === '/api/v1/admin/messages' && method === 'GET') { requirePermission('user.read'); return send(res, 200, await admin.listMessages()); }
                if (pathname === '/api/v1/admin/messages' && method === 'POST') { requirePermission('ticket.manage'); return send(res, 200, await admin.sendMessage(await body(req))); }
                if (pathname === '/api/v1/admin/staff' && method === 'GET') { requirePermission('*'); return send(res, 200, await admin.listStaff()); }
                if (pathname === '/api/v1/admin/staff' && method === 'POST') { requirePermission('*'); return send(res, 200, await admin.setStaff(await body(req))); }
                if (pathname === '/api/v1/admin/media' && method === 'GET') { requirePermission('media.manage'); return send(res, 200, await operations.listMedia({ rightsStatus:url.searchParams.get('rightsStatus'), matchStatus:url.searchParams.get('matchStatus') })); }
                const mediaAuditMatch=pathname.match(/^\/api\/v1\/admin\/media\/([^/]+)\/audit$/);
                if (mediaAuditMatch && method === 'GET') { requirePermission('media.manage'); return send(res, 200, await operations.mediaAudit(mediaAuditMatch[1])); }
                const mediaReviewMatch=pathname.match(/^\/api\/v1\/admin\/media\/([^/]+)\/review$/);
                if (mediaReviewMatch && method === 'POST') { requirePermission('media.manage'); return send(res, 200, await operations.reviewMedia(mediaReviewMatch[1], await body(req), actor.userId)); }
                const mediaAssignMatch=pathname.match(/^\/api\/v1\/admin\/media\/([^/]+)\/assign$/);
                if (mediaAssignMatch && method === 'POST') { requirePermission('media.manage'); return send(res, 200, await operations.assignMedia(mediaAssignMatch[1], await body(req), actor.userId)); }
                if (pathname === '/api/v1/admin/discovery/status' && method === 'GET') { requirePermission('media.manage'); return send(res, 200, operations.discoveryStatus()); }
                if (pathname === '/api/v1/admin/discovery/candidates' && method === 'GET') { requirePermission('media.manage'); return send(res, 200, await operations.listCandidates({status:url.searchParams.get('status'),nodeId:url.searchParams.get('nodeId')})); }
                if (pathname === '/api/v1/admin/discovery/run' && method === 'POST') { requirePermission('media.manage'); return send(res, 200, await operations.discover(await body(req), actor.userId)); }
                const discoveryReviewMatch=pathname.match(/^\/api\/v1\/admin\/discovery\/candidates\/([^/]+)\/review$/);
                if (discoveryReviewMatch && method === 'POST') { requirePermission('media.manage'); return send(res, 200, await operations.reviewCandidate(discoveryReviewMatch[1], await body(req), actor.userId)); }
                const discoveryImportMatch=pathname.match(/^\/api\/v1\/admin\/discovery\/candidates\/([^/]+)\/import$/);
                if (discoveryImportMatch && method === 'POST') { requirePermission('media.manage'); return send(res, 200, await operations.importCandidate(discoveryImportMatch[1], await body(req), actor.userId)); }
                if (pathname === '/api/v1/admin/integration-verifications' && method === 'GET') { requirePermission('*'); return send(res, 200, await integrations.history()); }
                if (pathname === '/api/v1/admin/integrations/verify/ai' && method === 'POST') { requirePermission('*'); return send(res, 200, await integrations.verifyAi(actor.userId)); }
                if (pathname === '/api/v1/admin/integrations/verify/wechat' && method === 'POST') { requirePermission('*'); return send(res, 200, await integrations.verifyWechat(actor.userId)); }
                if (pathname === '/api/v1/admin/integrations/verify/sms/start' && method === 'POST') { requirePermission('*'); const payload=await body(req); return send(res, 200, await integrations.smsStart(payload.phone, actor.userId)); }
                if (pathname === '/api/v1/admin/integrations/verify/sms/confirm' && method === 'POST') { requirePermission('*'); const payload=await body(req); return send(res, 200, await integrations.smsConfirm(payload.challengeId,payload.code,actor.userId)); }
                if (pathname === '/api/v1/admin/assistant/status' && method === 'GET') { requirePermission('content.read'); return send(res, 200, assistant.status()); }
                if (pathname === '/api/v1/admin/assistant/ask' && method === 'POST') { requirePermission('content.write'); const payload=await body(req,32768); return send(res, 200, await assistant.ask(actor.userId,payload.message)); }
                if (pathname === '/api/v1/admin/assistant/tasks' && method === 'GET') { requirePermission('content.read'); return send(res, 200, await assistant.tasks(actor.userId)); }
                const proposalMatch=pathname.match(/^\/api\/v1\/admin\/assistant\/proposals\/([^/]+)\/apply$/);
                if (proposalMatch && method === 'POST') { requirePermission('content.write'); const payload=await body(req); return send(res, 200, await assistant.apply(actor.userId,proposalMatch[1],payload.confirmed)); }
                throw new DomainError('NOT_FOUND', '接口不存在', 404);
            }
            if (pathname === '/api/v1/integrations/ivy/events' && method === 'POST') {
                invariant(config.ivy.appKey && config.ivy.aesKey, 'IVY_NOT_CONFIGURED', '接入尚未配置', 503);
                const payload = await body(req, 2 * 1024 * 1024);
                const plain = decodeEnvelope(config.ivy, {
                    ...payload,
                    timestamp: url.searchParams.get('timestamp'),
                    nonce: url.searchParams.get('nonce'),
                    signature: url.searchParams.get('signature')
                });
                let event;
                try {
                    event = JSON.parse(plain);
                }
                catch {
                    throw new DomainError('BAD_JSON', '事件 JSON 格式错误');
                }
                invariant([
                    'hello',
                    'schedule_release',
                    'schedule_update'
                ].includes(event.type), 'UNKNOWN_EVENT', '未订阅事件');
                if (event.type !== 'hello')
                    await repository.setState(`sync-request:${config.transit.operatorId}`, {
                        pending: true,
                        requestedAt: Date.now()
                    });
                return send(res, 200, signedEnvelope(config.ivy, 'success'));
            }
            if (pathname === '/api/v1/auth/challenge' && method === 'POST') {
                const data = await body(req); return send(res, 200, await auth.requestChallenge(data.phone, data.audience || 'user'));
            }
            if (pathname === '/api/v1/auth/verify' && method === 'POST') {
                const data = await body(req); return send(res, 200, await auth.verifyChallenge(data));
            }
            if (pathname === '/api/v1/auth/wechat' && method === 'POST') {
                const data = await body(req); return send(res, 200, await auth.wechatLogin(data.code));
            }
            if (pathname === '/api/v1/auth/wechat-phone' && method === 'POST') {
                const data = await body(req); return send(res, 200, await auth.wechatPhoneLogin(data.code, data.loginCode));
            }
            if (pathname === '/api/v1/auth/logout' && method === 'POST') {
                const data = req.headers['content-length'] ? await body(req) : {}; await auth.logout(req.headers.authorization || data._session); return send(res, 200, { ok: true });
            }
            if (pathname === '/api/v1/auth/me' && method === 'GET') {
                const s = await auth.session(req.headers.authorization); return send(res, 200, { user: { id: s.userId, phoneMasked: s.phoneMasked, role: s.role, audience: s.audience, permissions: s.permissions }, expiresAt: s.expiresAt });
            }
            if (pathname === '/api/v1/me' && method === 'GET') {
                const s = await auth.session(req.headers.authorization, 'user'); return send(res, 200, { id: s.userId });
            }
            if (pathname === '/api/v1/me/query' && method === 'POST') {
                const data = await body(req); const s = await auth.session(req.headers.authorization || data._session, 'user'); return send(res, 200, await users.profile(s.userId));
            }
            if (pathname === '/api/v1/me/action' && method === 'POST') {
                const data = await body(req); const s = await auth.session(req.headers.authorization || data._session, 'user'); const catalog = await repository.catalog(); invariant(catalog, 'CONTENT_UNAVAILABLE', '内容尚未发布', 503); return send(res, 200, await users.action(s.userId, data.action, data, catalog));
            }
            if (pathname === '/api/v1/analytics/event' && method === 'POST') {
                const data = await body(req, 32768); const allowed = new Set(['banner_view','banner_click','content_view','navigation_click','transit_code_click','login_success','member_join','benefit_claim','event_register','support_submit']); invariant(allowed.has(data.event), 'INVALID_EVENT', '事件类型无效'); let userId = null; if (req.headers.authorization) { try { userId = (await auth.session(req.headers.authorization)).userId; } catch {} } await repository.db.query('INSERT INTO analytics_events(id,user_id,event,client,page,object_type,object_id,channel_code,content_version,properties_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [data.eventId || randomUUID(), userId, data.event, String(data.client||'unknown').slice(0,20), String(data.page||'').slice(0,120), String(data.objectType||'').slice(0,80), String(data.objectId||'').slice(0,160), String(data.channelCode||'').slice(0,100), String(data.contentVersion||'').slice(0,160), JSON.stringify(data.properties||{}), Date.now()]); return send(res, 202, { accepted: true });
            }
            if (pathname.startsWith('/api/v1/me/favorites')) {
                const id = (await auth.session(req.headers.authorization, 'user')).userId;
                if (pathname === '/api/v1/me/favorites' && method === 'GET') {
                    const rows = await repository.db.query('SELECT poi_id FROM user_favorites WHERE user_id=$1 ORDER BY created_at DESC', [
                        id
                    ]);
                    return send(res, 200, {
                        ids: rows.map(x => x.poi_id)
                    });
                }
                const c = await repository.catalog();
                invariant(c, 'CONTENT_UNAVAILABLE', '内容尚未发布', 503);
                if (pathname === '/api/v1/me/favorites' && method === 'POST') {
                    const payload = await body(req), ids = payload.ids;
                    invariant(Array.isArray(ids) && ids.length <= 500, 'INVALID_FAVORITES', '收藏格式错误');
                    invariant(ids.every(x => typeof x === 'string' && c.pois.some(p => p.id === x)), 'UNKNOWN_POI', '收藏的地点不存在', 404);
                    await repository.db.transaction(`favorites:${id}`, async (tx) => {
                        for (const poiId of new Set(ids))
                            await tx.query('INSERT INTO user_favorites(user_id,poi_id,created_at) VALUES($1,$2,$3) ON CONFLICT(user_id,poi_id) DO NOTHING', [
                                id,
                                poiId,
                                Date.now()
                            ]);
                    });
                    return send(res, 200, {
                        ok: true
                    });
                }
                if (pathname.startsWith('/api/v1/me/favorites/') && method === 'DELETE') {
                    const poiId = pathname.slice('/api/v1/me/favorites/'.length);
                    await repository.db.query('DELETE FROM user_favorites WHERE user_id=$1 AND poi_id=$2', [
                        id,
                        poiId
                    ]);
                    return send(res, 200, {
                        ok: true
                    });
                }
                throw new DomainError('NOT_FOUND', '接口不存在', 404);
            }
            if (pathname === '/api/v1/transit/live' && method === 'GET') {
                const id = url.searchParams.get('routeId') || config.transit.routes[0].id;
                const live = await liveSnapshot(repository, config, id);
                invariant(live, 'ROUTE_NOT_FOUND', '线路不存在', 404);
                return send(res, 200, live);
            }
            if (pathname === '/api/v1/transit/arrivals' && method === 'GET') {
                const id = url.searchParams.get('routeId') || config.transit.routes[0].id, code = identifier(url.searchParams.get('stationCode'), 'stationCode');
                const a = await arrivals(repository, config, id, code);
                invariant(a, 'ROUTE_NOT_FOUND', '线路不存在', 404);
                return send(res, 200, a);
            }
            if (pathname.startsWith('/api/v1/content')) {
                invariant(method === 'GET', 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
                const c = await repository.catalog();
                invariant(c, 'CONTENT_UNAVAILABLE', '内容尚未发布', 503);
                invariant(!config.production || c.publication === 'approved', 'CONTENT_NOT_APPROVED', '内容尚未完成发布审核', 503);
                const etag = `"${c.version}"`;
                if (pathname === '/api/v1/content') {
                    if (req.headers['if-none-match'] === etag)
                        return send(res, 304, null, {
                            'ETag': etag
                        });
                    return send(res, 200, publicCatalog(c, config.publicBaseUrl), {
                        'ETag': etag
                    });
                }
                if (pathname === '/api/v1/content/pois') {
                    const limit = positive(url.searchParams, 'limit', 20, 50), category = url.searchParams.get('category'), nodeId = url.searchParams.get('nodeId');
                    let offset = 0;
                    const cursor = url.searchParams.get('cursor');
                    if (cursor) {
                        let decoded;
                        try {
                            decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
                        }
                        catch {
                            throw new DomainError('INVALID_CURSOR', '游标错误');
                        }
                        invariant(decoded.version === c.version && decoded.category === (category || null) && decoded.nodeId === (nodeId || null), 'CURSOR_EXPIRED', '内容或筛选条件已更新，请重新加载', 409);
                        offset = integer(decoded.offset, 'offset', 0, 100000);
                    }
                    const list = c.pois.filter(p => (!category || p.category === category) && (!nodeId || p.nodeId === nodeId));
                    const hasMore = offset + limit < list.length;
                    return send(res, 200, {
                        version: c.version,
                        items: list.slice(offset, offset + limit).map(p => publicPoi(p, config.publicBaseUrl)),
                        hasMore,
                        nextCursor: hasMore ? Buffer.from(JSON.stringify({
                            version: c.version,
                            category: category || null,
                            nodeId: nodeId || null,
                            offset: offset + limit
                        })).toString('base64url') : null
                    });
                }
                const match = pathname.match(/^\/api\/v1\/content\/(pois|walks|nodes)\/([^/]+)$/);
                if (match) {
                    const item = c[match[1]].find(x => x.id === match[2]);
                    invariant(item, 'NOT_FOUND', '内容不存在或已下线', 404);
                    return send(res, 200, {
                        version: c.version,
                        item: match[1] === 'pois' ? publicPoi(item, config.publicBaseUrl) : item
                    });
                }
                throw new DomainError('NOT_FOUND', '接口不存在', 404);
            }
            if (pathname.startsWith('/api/'))
                throw new DomainError('NOT_FOUND', '接口不存在', 404);
            invariant(method === 'GET' || method === 'HEAD', 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
            const isMedia=pathname.startsWith('/media/'),isAdmin=pathname==='/admin'||pathname.startsWith('/admin/');
            const base = isMedia ? path.resolve(config.root, 'var/media') : isAdmin ? path.resolve(config.root,'dist/admin') : path.resolve(config.root, 'dist/h5');
            const relative = isMedia ? pathname.slice(7) : isAdmin ? (pathname==='/admin'||pathname==='/admin/'?'index.html':pathname.slice('/admin/'.length)) : pathname === '/' ? 'index.html' : pathname.slice(1);
            const target = path.resolve(base, relative);
            invariant(target.startsWith(base + path.sep), 'NOT_FOUND', '不存在', 404);
            let buffer;
            try {
                buffer = await fs.readFile(target);
            }
            catch {
                throw new DomainError('NOT_FOUND', '页面不存在', 404);
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
                'Cache-Control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=300'
            });
            res.end(method === 'HEAD' ? undefined : buffer);
        }
        catch (e) {
            const status = e.status || 500;
            send(res, status, {
                error: {
                    code: e.code || 'INTERNAL_ERROR',
                    message: status >= 500 && status !== 503 ? '服务暂不可用，请稍后重试' : e.message,
                    requestId
                }
            });
            log({
                event: 'request-failed',
                code: e.code || 'INTERNAL_ERROR',
                requestId,
                durationMs: Date.now() - started
            });
        }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    return server;
}


