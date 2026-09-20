import { invariant, identifier, coordinate, validateRoute } from '../contracts/index.mjs';
function asId(value, label) {
    // Never coerce a 64-bit numeric JSON ID after precision has already been lost.
    return identifier(value, label);
}
export async function synchronizeRoute(client, converter, repository, operatorId, mapping, signal, lease = null) {
    invariant(mapping.lineCode && mapping.branchCode, 'ROUTE_NOT_MAPPED', 'lineCode and branchCode are required', 503);
    const result = await client.call('lineDetail', {
        identifierType: 'code',
        identifiers: [
            mapping.lineCode
        ]
    }, signal);
    invariant(Array.isArray(result), 'IVY_BAD_ROUTE', 'Expected line array', 502);
    const line = result.find(x => String(x.code) === mapping.lineCode);
    invariant(line, 'IVY_ROUTE_NOT_FOUND', 'Mapped route not found', 502);
    asId(line.id, 'lineId');
    const source = (line.branches || []).filter(b => String(b.code) === mapping.branchCode);
    invariant(source.length === 1, 'IVY_BRANCH_NOT_FOUND', 'Mapped branch must resolve uniquely', 502);
    const branch = source[0];
    asId(branch.id, 'branchId');
    const stopIds = [
        ...new Set(mapping.directions.flatMap(dir => (branch[dir === 'upward' ? 'stationsOfUp' : 'stationsOfDown'] || []).map(s => asId(s.id, 'stationId'))))
    ];
    invariant(stopIds.length > 0, 'INCOMPLETE_ROUTE', 'No mapped stops', 502);
    const stations = [];
    for (let i = 0; i < stopIds.length; i += 100) {
        const part = await client.call('stations', {
            identifierType: 'id',
            identifiers: stopIds.slice(i, i + 100)
        }, signal);
        invariant(Array.isArray(part), 'IVY_BAD_STATIONS', 'Expected station array', 502);
        stations.push(...part);
    }
    const byId = new Map(stations.map(s => [
        asId(s.id, 'stationId'),
        s
    ]));
    invariant(stopIds.every(id => byId.has(id)), 'INCOMPLETE_ROUTE', 'Station batch incomplete', 502);
    const branches = [];
    for (const direction of mapping.directions) {
        const up = direction === 'upward', stopList = branch[up ? 'stationsOfUp' : 'stationsOfDown'], track = branch[up ? 'trackOfUp' : 'trackOfDown'];
        invariant(Array.isArray(stopList) && Array.isArray(track) && track.length >= 2, 'INCOMPLETE_ROUTE', 'Incomplete branch track', 502);
        const rawStops = stopList.map(s => {
            const full = byId.get(s.id);
            return {
                ...s,
                rawPoint: coordinate(full.lat, full.lng, 'WGS84'),
                code: identifier(String(full.code), 'stationCode'),
                name: full.name
            };
        });
        const rawTrack = track.map(p => coordinate(p.lat, p.lng, 'WGS84'));
        const converted = await converter.convert([
            ...rawStops.map(s => s.rawPoint),
            ...rawTrack
        ]);
        branches.push({
            code: String(branch.code),
            externalId: branch.id,
            direction,
            circular: [
                1,
                2
            ].includes(line.type),
            stops: rawStops.map((s, i) => ({
                id: s.id,
                code: s.code,
                name: s.name,
                sequence: s.sn,
                tourismNodeId: mapping.tourismLinks?.[s.code] || null,
                rawPoint: s.rawPoint,
                mapPoint: converted[i]
            })),
            track: rawTrack,
            mapTrack: converted.slice(rawStops.length).filter(Boolean)
        });
    }
    const route = validateRoute({
        id: mapping.id,
        name: line.name || mapping.name,
        operatorId,
        externalId: line.id,
        lineCode: String(line.code),
        branches
    });
    // Only a complete validated object reaches this atomic publication operation.
    const version = await repository.publishRoute(route, Date.now(), lease);
    return {
        route,
        version
    };
}

