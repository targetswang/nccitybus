/** Runtime contracts shared by API, worker and both clients. */
export const API_VERSION = 'v1';
export const CATEGORIES = [
    '吃什么',
    '喝什么',
    '看什么',
    '玩什么',
    '休息'
];
export class DomainError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'DomainError';
        this.code = code;
        this.status = status;
    }
}
export function invariant(condition, code, message, status = 400) {
    if (!condition)
        throw new DomainError(code, message, status);
}
export function object(value, label = 'object') {
    invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_PAYLOAD', `${label} must be an object`);
    return value;
}
export function text(value, label, max = 200) {
    invariant(typeof value === 'string' && value.length > 0 && value.length <= max, 'INVALID_PAYLOAD', `${label} must be a nonempty string`);
    return value;
}
export function identifier(value, label = 'id') {
    return text(value, label, 160);
}
export function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
    invariant(Number.isSafeInteger(value) && value >= min && value <= max, 'INVALID_PAYLOAD', `${label} out of range`);
    return value;
}
export function coordinate(lat, lng, crs) {
    invariant(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180, 'INVALID_COORDINATE', 'Invalid geographic coordinate');
    invariant([
        'WGS84',
        'GCJ02'
    ].includes(crs), 'INVALID_CRS', 'Coordinate system must be explicit');
    return {
        lat,
        lng,
        crs
    };
}
export function safeTime(value, now, futureMs = 30000) {
    integer(value, 'time', 1);
    invariant(value <= now + futureMs, 'FUTURE_EVENT', 'Device time is ahead of server time');
    return value;
}
export function validateCatalog(value) {
    object(value);
    text(value.version, 'version');
    for (const key of [
        'nodes',
        'pois',
        'walks'
    ])
        invariant(Array.isArray(value[key]), 'INVALID_CATALOG', `Missing ${key}`);
    const unique = (rows, field) => {
        const ids = new Set();
        for (const r of rows) {
            text(r[field], field);
            invariant(!ids.has(r[field]), 'DUPLICATE_ID', r[field]);
            ids.add(r[field]);
        }
        return ids;
    };
    const nodes = unique(value.nodes, 'id'), pois = unique(value.pois, 'id');
    unique(value.walks, 'id');
    for (const p of value.pois) {
        invariant(nodes.has(p.nodeId), 'DANGLING_REFERENCE', `POI ${p.id} node`);
        invariant(CATEGORIES.includes(p.category), 'INVALID_CATEGORY', p.id);
        if (p.mapPoint)
            coordinate(p.mapPoint.lat, p.mapPoint.lng, p.mapPoint.crs);
        if (p.mapPoint)
            invariant(p.mapPoint.crs === 'GCJ02', 'INVALID_CRS', p.id);
        invariant(typeof p.name === 'string' && typeof p.description === 'string', 'INVALID_CATALOG', p.id);
    }
    invariant(['reference', 'approved'].includes(value.publication), 'INVALID_CATALOG', 'Publication state required');
    if (value.publication === 'approved') {
        const approval = object(value.approval, 'approval');
        text(approval.reviewedBy, 'reviewedBy');
        text(approval.evidence, 'approval evidence', 4000);
        integer(approval.reviewedAt, 'reviewedAt', 1);
        for (const p of value.pois) {
            invariant(p.publication === 'approved', 'CONTENT_NOT_APPROVED', `POI ${p.id} is not approved`);
            invariant(p.source?.status === 'approved' && Number.isSafeInteger(p.source.verifiedAt), 'CONTENT_NOT_APPROVED', `POI ${p.id} source verification required`);
            if (p.cover) {
                invariant(/^\/media\/[a-f0-9]{64}\.webp$/.test(p.cover), 'UNOWNED_MEDIA', p.id);
                invariant(p.mediaApproval?.placeMatchConfirmed === true && p.mediaApproval.rightsEvidence, 'UNAPPROVED_MEDIA', p.id);
                invariant(p.cover.includes(p.mediaApproval.sha256), 'UNAPPROVED_MEDIA', p.id);
            }
            if (p.audioUrl)
                invariant(/^\/media\/[a-f0-9]{64}\.(mp3|ogg)$/.test(p.audioUrl) && p.audioApproval?.rightsEvidence, 'UNAPPROVED_AUDIO', p.id);
        }
    }
    for (const w of value.walks) {
        invariant(pois.has(w.coverPoiId), 'DANGLING_REFERENCE', `Walk ${w.id} cover`);
        invariant(Array.isArray(w.steps) && w.steps.length > 0, 'INVALID_CATALOG', w.id);
        if (value.publication === 'approved')
            invariant(w.source?.status === 'approved' && Number.isSafeInteger(w.source.verifiedAt), 'CONTENT_NOT_APPROVED', `Walk ${w.id} source verification required`);
        for (const s of w.steps) {
            if (value.publication === 'approved' && s.audioUrl)
                invariant(/^\/media\/[a-f0-9]{64}\.(mp3|ogg)$/.test(s.audioUrl) && s.audioApproval?.rightsEvidence, 'UNAPPROVED_AUDIO', w.id);
            invariant(nodes.has(s.nodeId) && (!s.poiId || pois.has(s.poiId)), 'DANGLING_REFERENCE', `Walk ${w.id} step`);
            for (const key of [
                'title',
                'intro',
                'localTip',
                'narration'
            ])
                text(s[key], key, 5000);
        }
        invariant(Array.isArray(w.practical), 'INVALID_CATALOG', 'Walk practical tips missing');
    }
    return value;
}
export function validateRoute(route) {
    object(route);
    identifier(route.id);
    identifier(route.lineCode, 'lineCode');
    text(route.name, 'name');
    invariant(Array.isArray(route.branches) && route.branches.length > 0, 'INCOMPLETE_ROUTE', 'No branches');
    const keys = new Set();
    for (const branch of route.branches) {
        identifier(branch.code, 'branchCode');
        invariant([
            'upward',
            'downward'
        ].includes(branch.direction), 'INVALID_DIRECTION', 'Unknown direction');
        const key = `${branch.code}:${branch.direction}`;
        invariant(!keys.has(key), 'DUPLICATE_BRANCH', key);
        keys.add(key);
        invariant(Array.isArray(branch.stops) && branch.stops.length > 0 && Array.isArray(branch.track) && branch.track.length >= 2, 'INCOMPLETE_ROUTE', key);
        const seqs = new Set();
        for (const stop of branch.stops) {
            identifier(stop.id);
            identifier(stop.code, 'stationCode');
            integer(stop.sequence, 'sequence', 1);
            invariant(!seqs.has(stop.sequence), 'DUPLICATE_SEQUENCE', key);
            seqs.add(stop.sequence);
            coordinate(stop.rawPoint.lat, stop.rawPoint.lng, 'WGS84');
            if (stop.mapPoint)
                coordinate(stop.mapPoint.lat, stop.mapPoint.lng, 'GCJ02');
        }
        branch.stops.sort((a, b) => a.sequence - b.sequence);
        invariant(branch.stops.every((x, i) => x.sequence === i + 1), 'INCOMPLETE_SEQUENCE', key);
        for (const p of branch.track)
            coordinate(p.lat, p.lng, 'WGS84');
        for (const p of branch.mapTrack || [])
            coordinate(p.lat, p.lng, 'GCJ02');
    }
    return route;
}

