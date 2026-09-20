import { createHash } from 'node:crypto';
export function freshness(time, now, freshMs, staleMs) {
    if (time === null || time === undefined)
        return 'no_data';
    const age = now - time;
    if (age < 0)
        return 'unavailable';
    return age <= freshMs ? 'fresh' : age <= staleMs ? 'stale' : 'unavailable';
}
export function remainingStops(branch, stop, targetCode) {
    if (!branch || !stop)
        return null;
    let rows = branch.stops;
    const duplicateTerminal = branch.circular && rows.length > 1 && rows[0].code === rows.at(-1).code;
    const count = rows.length - (duplicateTerminal ? 1 : 0);
    let from = rows.findIndex(s => s.sequence === stop.stationSN && s.code === stop.stationCode);
    if (from < 0 || !count)
        return null;
    if (duplicateTerminal && from === count)
        from = 0;
    const targets = rows.slice(0, count).flatMap((s, i) => s.code === targetCode ? [
        i
    ] : []);
    const distances = targets.map(to => {
        let n = to - from;
        if (n === 0 && stop.action === 'leave')
            return branch.circular ? count : null;
        if (n < 0)
            return branch.circular ? n + count : null;
        return n;
    }).filter(n => n !== null);
    return distances.length ? Math.min(...distances) : null;
}
export async function liveSnapshot(repository, config, routeId, now = Date.now()) {
    const mapping = config.transit.routes.find(r => r.id === routeId);
    if (!mapping)
        return null;
    const version = await repository.route(routeId), state = await repository.state(`mqtt:${config.transit.operatorId}`), worker = await repository.state(`worker:${config.transit.operatorId}`);
    let integration = {
        state: 'not_configured',
        reason: 'INTEGRATION_NOT_CONFIGURED'
    };
    if (state)
        integration = {
            state: state.state,
            reason: state.reason || ''
        };
    if (state?.state === 'connected' && (!worker || now - worker.updatedAt > config.workerLeaseMs))
        integration = {
            state: 'error',
            reason: 'WORKER_HEARTBEAT_EXPIRED'
        };
    if (!mapping.lineCode || !mapping.branchCode)
        integration = {
            state: 'not_configured',
            reason: 'ROUTE_NOT_MAPPED'
        };
    const events = await repository.latest(config.transit.operatorId), vehicles = [];
    for (const e of events.filter(x => x.stream === 'location' && x.routeId === routeId)) {
        // Also re-check current binding: an old publication must not leak vehicles from another route.
        if (e.data.lineCode !== mapping.lineCode || e.data.branchCode !== mapping.branchCode || !mapping.directions.includes(e.data.direction))
            continue;
        const age = freshness(e.time, now, config.freshMs, config.staleMs);
        const positionValid = e.data.accStatus !== 0 && e.data.accStatus !== 2;
        const stop = events.find(x => x.stream === 'stop' && x.vehicleKey === e.vehicleKey && x.data.lineCode === e.data.lineCode && x.data.branchCode === e.data.branchCode && x.data.direction === e.data.direction);
        const stopFresh = stop && freshness(stop.time, now, config.freshMs, config.staleMs) === 'fresh';
        vehicles.push({
            id: createHash('sha256').update(`${e.operatorId}:${e.vehicleKey}`).digest('hex').slice(0, 20),
            label: e.data.code,
            lineCode: e.data.lineCode,
            branchCode: e.data.branchCode,
            direction: e.data.direction,
            mapPoint: positionValid ? e.data.mapPoint : null,
            locatedAt: e.time,
            publishedAt: e.publishedAt,
            receivedAt: e.receivedAt,
            freshness: positionValid ? age : 'unavailable',
            operationState: 'unknown',
            speed: e.data.speed,
            azimuth: e.data.azimuth,
            lastStop: stopFresh ? {
                stationCode: stop.data.stationCode,
                stationSN: stop.data.stationSN,
                action: stop.data.action,
                time: stop.time
            } : null,
            etaMinutes: null
        });
    }
    const aggregate = vehicles.some(x => x.freshness === 'fresh') ? 'fresh' : vehicles.some(x => x.freshness === 'stale') ? 'stale' : vehicles.length ? 'unavailable' : 'no_data';
    return {
        schemaVersion: 'v1',
        routeVersion: version?.version || null,
        route: version?.route || null,
        integration,
        freshness: aggregate,
        vehicles: vehicles.sort((a, b) => a.label.localeCompare(b.label)),
        serverTime: now,
        thresholds: {
            freshMs: config.freshMs,
            staleMs: config.staleMs
        },
        reason: !version ? 'NO_VALID_ROUTE_VERSION' : aggregate === 'no_data' ? 'AWAITING_FIRST_LOCATION' : null
    };
}
export async function arrivals(repository, config, routeId, stationCode, now = Date.now()) {
    const live = await liveSnapshot(repository, config, routeId, now);
    if (!live)
        return null;
    const rows = [];
    // A last-known position may be shown during an outage, but it must not generate an arrival claim.
    if (live.integration.state !== 'connected')
        return {
            schemaVersion: 'v1',
            routeVersion: live.routeVersion,
            stationCode,
            items: [],
            serverTime: now,
            reason: 'INTEGRATION_UNAVAILABLE'
        };
    for (const v of live.vehicles) {
        if (v.freshness !== 'fresh' || !v.lastStop)
            continue;
        const branch = live.route?.branches.find(x => x.code === v.branchCode && x.direction === v.direction);
        const remaining = remainingStops(branch, v.lastStop, stationCode);
        if (remaining !== null)
            rows.push({
                vehicleId: v.id,
                label: v.label,
                remainingStops: remaining,
                etaMinutes: null,
                evidence: 'vehicle_stop',
                observedAt: v.lastStop.time
            });
    }
    return {
        schemaVersion: 'v1',
        routeVersion: live.routeVersion,
        stationCode,
        items: rows.sort((a, b) => a.remainingStops - b.remainingStops),
        serverTime: now
    };
}

