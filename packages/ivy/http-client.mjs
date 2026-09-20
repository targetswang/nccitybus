import { signature, nonce16, encrypt, decrypt, verifySignature } from './crypto.mjs';
import { DomainError, invariant, object } from '../contracts/index.mjs';
export const ENDPOINTS = Object.freeze({
    lines: 'search_line_by_cursor',
    line: 'query_line',
    lineDetail: 'query_line_detail',
    branches: 'query_branches',
    stations: 'query_station',
    vehicles: 'query_vehicle',
    allStations: 'search_station_by_cursor',
    allVehicles: 'search_vehicle_by_cursor',
    schedule: 'dispatch/query_schedule'
});
export class IvyClient {
    constructor(config, transport = fetch) {
        this.config = config;
        this.transport = transport;
    }
    async call(name, params, signal) {
        const c = this.config;
        invariant(c.host && c.appKey && c.appSecret, 'IVY_NOT_CONFIGURED', 'IVY HTTP is not configured', 503);
        invariant(ENDPOINTS[name], 'INVALID_ENDPOINT', 'Unknown IVY endpoint');
        const raw = params === undefined ? '' : JSON.stringify(params);
        const content = c.httpEncrypt ? encrypt(c, raw) : raw;
        const body = c.httpEncrypt ? JSON.stringify({
            encrypt: content
        }) : raw;
        const timestamp = String(Date.now()), nonce = nonce16();
        const url = new URL(`${c.host.replace(/\/$/, '')}/bus/openapi/v1.0/${ENDPOINTS[name]}`);
        for (const [k, v] of Object.entries({
            appKey: c.appKey,
            timestamp,
            nonce,
            signature: signature(c, timestamp, nonce, content)
        }))
            url.searchParams.set(k, v);
        let response;
        try {
            response = await this.transport(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body,
                signal: signal ? AbortSignal.any([
                    signal,
                    AbortSignal.timeout(c.timeoutMs || 10000)
                ]) : AbortSignal.timeout(c.timeoutMs || 10000),
                redirect: 'error'
            });
        }
        catch {
            throw new DomainError('IVY_NETWORK_ERROR', 'Upstream HTTP connection failed', 502);
        }
        invariant(response.ok, 'IVY_HTTP_ERROR', `Upstream HTTP status ${response.status}`, 502);
        const declared = Number(response.headers?.get('content-length') || 0);
        invariant(declared <= 8 * 1024 * 1024, 'UPSTREAM_TOO_LARGE', 'IVY response too large', 502);
        const rawResponse = await response.text();
        invariant(Buffer.byteLength(rawResponse) <= 8 * 1024 * 1024, 'UPSTREAM_TOO_LARGE', 'IVY response too large', 502);
        let parsed;
        try {
            parsed = JSON.parse(rawResponse);
        }
        catch {
            throw new DomainError('IVY_BAD_JSON', 'Invalid upstream JSON', 502);
        }
        object(parsed);
        invariant(String(parsed.code) === '0', 'IVY_REJECTED', 'IVY rejected the request; check server diagnostics', 502);
        if (!c.httpEncrypt)
            return parsed.result;
        invariant(parsed.result && typeof parsed.result.encrypt === 'string', 'IVY_BAD_ENVELOPE', 'Encrypted result missing', 502);
        verifySignature(c, parsed.timestamp, parsed.nonce, parsed.result.encrypt, parsed.signature);
        try {
            return JSON.parse(decrypt(c, parsed.result.encrypt));
        }
        catch (e) {
            if (e instanceof DomainError)
                throw e;
            throw new DomainError('IVY_BAD_JSON', 'Invalid decrypted JSON', 502);
        }
    }
    async pages(endpoint, params = {}, signal) {
        const records = [], seen = new Set();
        let cursor = '';
        for (let count = 0; count < 1000; count++) {
            const result = await this.call(endpoint, cursor ? {
                cursor,
                size: 100
            } : {
                ...params,
                cursor: '',
                size: 100
            }, signal);
            invariant(result && Array.isArray(result.list) && typeof result.hasMore === 'boolean', 'IVY_BAD_PAGE', 'Malformed paginated response', 502);
            records.push(...result.list);
            invariant(records.length <= 100000, 'IVY_PAGE_LIMIT', 'Upstream data limit exceeded', 502);
            if (!result.hasMore)
                return records;
            invariant(typeof result.nextCursor === 'string' && result.nextCursor.length && !seen.has(result.nextCursor), 'IVY_BAD_CURSOR', 'Missing or repeated cursor', 502);
            seen.add(result.nextCursor);
            cursor = result.nextCursor;
        }
        throw new DomainError('IVY_PAGE_LIMIT', 'Too many pages', 502);
    }
}

