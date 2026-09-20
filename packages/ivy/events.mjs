import { decodeEnvelope } from './crypto.mjs';
import { invariant, object, safeTime, coordinate } from '../contracts/index.mjs';
export async function normalizeEvent(config, wire, converter, now = Date.now()) {
    invariant(config.ivy.envelope === 'signed-json-v1', 'UNSUPPORTED_ENVELOPE', 'Confirm MQTT envelope with supplier');
    const plaintext = decodeEnvelope(config.ivy, wire, now);
    let event;
    try {
        event = JSON.parse(plaintext);
    }
    catch {
        invariant(false, 'BAD_JSON', 'Decrypted event is not JSON');
    }
    object(event);
    object(event.data);
    invariant([
        'vehicle_location',
        'vehicle_stop'
    ].includes(event.type), 'UNKNOWN_EVENT', 'Unexpected IVY event type');
    const d = event.data, stream = event.type === 'vehicle_location' ? 'location' : 'stop';
    invariant(typeof d.code === 'string' && d.code.length > 0, 'INVALID_VEHICLE', 'vehicle code missing');
    invariant(typeof d.lineCode === 'string' && d.lineCode.length > 0, 'INVALID_ROUTE', 'lineCode missing');
    invariant(typeof d.branchCode === 'string' || Number.isSafeInteger(d.branchCode), 'INVALID_BRANCH', 'branchCode missing');
    invariant([
        'upward',
        'downward'
    ].includes(d.direction), 'INVALID_DIRECTION', 'Unknown vehicle direction');
    const route = config.transit.routes.find(r => r.lineCode === d.lineCode && r.branchCode === String(d.branchCode) && r.directions.includes(d.direction));
    invariant(route, 'OUT_OF_SCOPE', 'Event is outside authorized tourism route', 403);
    if (route.vehicleAllowlist?.length)
        invariant(route.vehicleAllowlist.includes(d.code), 'OUT_OF_SCOPE', 'Vehicle not authorized', 403);
    const time = safeTime(d.time, now, config.ivy.futureMs), publishedAt = safeTime(Number(event.timestamp), now, config.ivy.futureMs);
    const rawPoint = coordinate(d.latitude, d.longitude, 'WGS84');
    invariant(!(rawPoint.lat === 0 && rawPoint.lng === 0), 'INVALID_COORDINATE', 'Null island is not a valid vehicle position');
    if (d.accStatus !== undefined)
        invariant([
            0,
            2,
            3
        ].includes(d.accStatus), 'UNKNOWN_ACC_STATUS', 'Supplier ACC enum differs');
    if (stream === 'stop') {
        invariant(typeof d.stationCode === 'string' && Number.isInteger(d.stationSN) && d.stationSN >= 1, 'INVALID_STOP', 'Missing stop reference');
        invariant([
            'entry',
            'leave'
        ].includes(d.action), 'INVALID_ACTION', 'Unknown stop action');
    }
    let mapPoint = null;
    // An explicit unpositioned flag must not create a fresh map marker.
    if (d.accStatus !== 0 && d.accStatus !== 2)
        [
            mapPoint
        ] = await converter.convert([
            rawPoint
        ]);
    return {
        operatorId: config.transit.operatorId,
        vehicleKey: d.code,
        stream,
        time,
        publishedAt,
        receivedAt: now,
        routeId: route.id,
        data: {
            lineCode: d.lineCode,
            branchCode: String(d.branchCode),
            direction: d.direction,
            code: d.code,
            rawPoint,
            mapPoint,
            speed: Number.isFinite(d.speed) && d.speed >= 0 ? d.speed : null,
            azimuth: Number.isFinite(d.azimuth) && d.azimuth >= 0 && d.azimuth < 360 ? d.azimuth : null,
            accStatus: d.accStatus ?? null,
            operationState: 'unknown',
            ...(stream === 'stop' ? {
                stationCode: d.stationCode,
                stationSN: d.stationSN,
                action: d.action
            } : {})
        }
    };
}

