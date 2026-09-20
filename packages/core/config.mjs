import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DomainError, invariant } from '../contracts/index.mjs';
export function secret(env, key) {
    if (env[`${key}_FILE`])
        return fs.readFileSync(env[`${key}_FILE`], 'utf8').trim();
    return env[key] || '';
}
function millis(env, key, fallback) {
    const n = Number(env[key] ?? fallback);
    invariant(Number.isSafeInteger(n) && n > 0, 'INVALID_CONFIG', key);
    return n;
}
export function loadConfig(env = process.env, root = process.cwd()) {
    const production = env.NODE_ENV === 'production';
    const port = Number(env.PORT || 3000);
    invariant(Number.isInteger(port) && port >= 0 && port <= 65535, 'INVALID_CONFIG', 'PORT');
    const dbDriver = env.DB_DRIVER || 'sqlite';
    invariant([
        'sqlite',
        'postgres'
    ].includes(dbDriver), 'INVALID_CONFIG', 'DB_DRIVER');
    invariant(!production || dbDriver === 'postgres', 'INVALID_CONFIG', 'Production requires PostgreSQL; SQLite is the single-host development/test adapter');
    const file = path.resolve(root, env.TRANSIT_CONFIG || 'deploy/transit.example.json');
    const transit = JSON.parse(fs.readFileSync(file, 'utf8'));
    invariant(Array.isArray(transit.routes) && transit.routes.length > 0, 'INVALID_CONFIG', 'No route declarations');
    invariant([
        'development',
        'test',
        'production'
    ].includes(transit.environment), 'INVALID_CONFIG', 'Explicit environment required');
    invariant(!production || transit.environment === 'production', 'INVALID_CONFIG', 'Production must use its own transit environment');
    invariant(typeof transit.operatorId === 'string' && transit.operatorId.length > 0, 'INVALID_CONFIG', 'operatorId required');
    invariant(new Set(transit.routes.map(r => r.id)).size === transit.routes.length, 'INVALID_CONFIG', 'Duplicate internal route ID');
    for (const r of transit.routes) {
        invariant(typeof r.id === 'string' && r.id && Array.isArray(r.directions) && r.directions.length && r.directions.every(x => [
            'upward',
            'downward'
        ].includes(x)), 'INVALID_CONFIG', 'Invalid route mapping');
        if (r.lineCode)
            invariant(typeof r.lineCode === 'string', 'INVALID_CONFIG', 'lineCode must be a string');
        if (r.branchCode)
            invariant(typeof r.branchCode === 'string', 'INVALID_CONFIG', 'branchCode must be a string');
    }
    invariant(!production || secret(env, 'DATABASE_URL'), 'INVALID_CONFIG', 'DATABASE_URL required');
    const freshMs = millis(env, 'POSITION_FRESH_MS', 60000), staleMs = millis(env, 'POSITION_STALE_MS', 300000);
    invariant(staleMs > freshMs, 'INVALID_CONFIG', 'stale threshold must exceed fresh threshold');
    if (production)
        invariant(/^https:\/\//.test(env.PUBLIC_BASE_URL || ''), 'INVALID_CONFIG', 'Production requires PUBLIC_BASE_URL using HTTPS');
    const adminToken = secret(env, 'ADMIN_TOKEN');
    invariant(!production || adminToken.length >= 32, 'INVALID_CONFIG', 'Production requires ADMIN_TOKEN >=32 characters');
    const ivy = {
        host: env.IVY_BUS_HOST || '',
        appKey: secret(env, 'IVY_APP_KEY'),
        appSecret: secret(env, 'IVY_APP_SECRET'),
        aesKey: secret(env, 'IVY_ENCODING_AES_KEY'),
        httpEncrypt: env.IVY_HTTP_ENCRYPT !== 'false',
        protocolConfirmed: env.IVY_PROTOCOL_CONFIRMED === 'true',
        broker: env.IVY_MQTT_BROKER || '',
        username: secret(env, 'IVY_MQTT_USERNAME'),
        password: secret(env, 'IVY_MQTT_PASSWORD'),
        caFile: env.IVY_MQTT_CA_FILE || '',
        clientId: env.IVY_MQTT_CLIENT_ID || '',
        group: env.IVY_MQTT_GROUP || '',
        envelope: env.IVY_MQTT_ENVELOPE || 'signed-json-v1',
        locationTopic: env.IVY_MQTT_LOCATION_TOPIC || 'vehicle_location',
        stopTopic: env.IVY_MQTT_STOP_TOPIC || 'vehicle_stop',
        signatureMaxAgeMs: millis(env, 'SIGNATURE_MAX_AGE_MS', 300000),
        futureMs: millis(env, 'MAX_FUTURE_MS', 30000),
        timeoutMs: 10000,
    };
    if (ivy.host) {
        const u = new URL(ivy.host);
        invariant(!u.username && !u.password && (!production || u.protocol === 'https:'), 'INVALID_CONFIG', 'IVY host must use HTTPS without URL credentials');
    }
    if (ivy.broker) {
        const u = new URL(ivy.broker);
        invariant(!u.username && !u.password && [
            'mqtt:',
            'mqtts:'
        ].includes(u.protocol) && (!production || u.protocol === 'mqtts:'), 'INVALID_CONFIG', 'Production MQTT requires TLS without URL credentials');
    }
    if (ivy.group)
        invariant(ivy.group.startsWith(`${transit.environment}-`) && !/[+#/]/.test(ivy.group), 'INVALID_CONFIG', 'Use an environment-specific MQTT shared group');

    if (production && env.SMS_SEND_URL) {
        const smsUrl = new URL(env.SMS_SEND_URL);
        invariant(smsUrl.protocol === 'https:' && !smsUrl.username && !smsUrl.password, 'INVALID_CONFIG', 'Production SMS gateway requires HTTPS without URL credentials');
    }
    return {
        root,
        production,
        host: env.HOST || '127.0.0.1',
        port,
        dbDriver,
        databaseUrl: secret(env, 'DATABASE_URL'),
        databaseCaFile: env.DATABASE_SSL_CA_FILE || '',
        sqlitePath: env.SQLITE_PATH === ':memory:' ? ':memory:' : path.resolve(root, env.SQLITE_PATH || 'var/nanchong.sqlite'),
        adminToken,
        transit,
        ivy,
        freshMs,
        staleMs,
        workerLeaseMs: 30000,
        workerHeartbeatMs: 10000,
        corsOrigins: (env.CORS_ORIGINS || '').split(',').filter(Boolean),
        publicBaseUrl: env.PUBLIC_BASE_URL || '',
        trustedProxyIps: (env.TRUSTED_PROXY_IPS || '').split(',').filter(Boolean),
        ratePerMinute: millis(env, 'RATE_PER_MINUTE', 1200),
        h5MapKey: env.H5_MAP_KEY || '',
        amapKey: secret(env, 'AMAP_SERVER_KEY'),
        transitAppId: env.TRANSIT_APP_ID || '',
        transitAppPath: env.TRANSIT_APP_PATH || '',
        wechatAppId: env.WECHAT_APP_ID || env.WECHAT_MINIPROGRAM_APP_ID || '',
        wechatAppSecret: secret(env, 'WECHAT_APP_SECRET') || secret(env, 'WECHAT_MINIPROGRAM_APP_SECRET'),
        testLoginCode: production ? '' : (env.TEST_LOGIN_CODE || '246810'),
        initialAdminPhoneHash: secret(env, 'INITIAL_ADMIN_PHONE_HASH'),
        smsProvider: env.SMS_PROVIDER || '',
        smsSendUrl: env.SMS_SEND_URL || '',
        smsProviderToken: secret(env, 'SMS_PROVIDER_TOKEN'),
        smsTemplateId: env.SMS_TEMPLATE_ID || '',
        smsSignName: env.SMS_SIGN_NAME || '',
        smsProviderConfigured: Boolean((env.SMS_PROVIDER || '') && (env.SMS_SEND_URL || '') && secret(env, 'SMS_PROVIDER_TOKEN')),
        aiProvider: env.AI_PROVIDER || '',
        aiModel: env.AI_MODEL || '',
        aiApiKey: secret(env, 'AI_API_KEY'),
        aiBaseUrl: env.AI_BASE_URL || '',
        workerId: `${env.WORKER_INSTANCE_ID || 'worker'}:${randomUUID()}`,
    };
}
export function missingHttp(config) {
    const c = config.ivy, keys = [];
    for (const [field, name] of [
        [
            'host',
            'IVY_BUS_HOST'
        ],
        [
            'appKey',
            'IVY_APP_KEY'
        ],
        [
            'appSecret',
            'IVY_APP_SECRET'
        ]
    ])
        if (!c[field])
            keys.push(name);
    if (c.httpEncrypt && !c.aesKey)
        keys.push('IVY_ENCODING_AES_KEY');
    if (!config.transit.routes.some(r => r.lineCode && r.branchCode))
        keys.push('at least one mapped route');
    return keys;
}
export function missingMqtt(config) {
    const c = config.ivy, keys = [];
    for (const [field, name] of [
        [
            'broker',
            'IVY_MQTT_BROKER'
        ],
        [
            'username',
            'IVY_MQTT_USERNAME'
        ],
        [
            'password',
            'IVY_MQTT_PASSWORD'
        ],
        [
            'clientId',
            'IVY_MQTT_CLIENT_ID'
        ],
        [
            'appKey',
            'IVY_APP_KEY'
        ],
        [
            'appSecret',
            'IVY_APP_SECRET'
        ],
        [
            'aesKey',
            'IVY_ENCODING_AES_KEY'
        ]
    ])
        if (!c[field])
            keys.push(name);
    if (!c.protocolConfirmed)
        keys.push('IVY_PROTOCOL_CONFIRMED');
    if (!config.transit.routes.some(r => r.lineCode && r.branchCode))
        keys.push('at least one mapped route');
    return keys;
}
export function missingIvy(config) {
    return [
        ...new Set([
            ...missingHttp(config),
            ...missingMqtt(config)
        ])
    ];
}

