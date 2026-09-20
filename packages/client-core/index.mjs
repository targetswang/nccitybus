/** Pure, platform-free presentation rules. The formal native CJS copy is generated during build, never hand edited. */
export const ROOTS = [
    'home',
    'live',
    'explore',
    'me'
];
export const PAGES = [
    'home',
    'live',
    'explore',
    'me',
    'route',
    'stations',
    'station',
    'walks',
    'walk',
    'poi',
    'guide',
    'favorites',
    'rights',
    'privacy',
    'login',
    'member',
    'events',
    'event',
    'benefit',
    'messages',
    'support'
];
export function parseRoute(hash) {
    const clean = String(hash || '').replace(/^#\/?/, '') || 'home';
    const [pathname, query = ''] = clean.split('?');
    let [page, id] = pathname.split('/');
    if (page === 'bus')
        page = 'live';
    const params = {};
    for (const pair of query.split('&')) {
        if (!pair)
            continue;
        const [k, v = ''] = pair.split('=');
        try {
            params[decodeURIComponent(k)] = decodeURIComponent(v);
        }
        catch {
            return {
                page: 'not-found',
                id: null,
                params: {}
            };
        }
    }
    if (!PAGES.includes(page))
        return {
            page: 'not-found',
            id: null,
            params
        };
    return {
        page,
        id: id || null,
        params
    };
}
export function ownerForPage(page, from) {
    if (ROOTS.includes(page))
        return page;
    if ([
        'poi',
        'walk',
        'walks'
    ].includes(page))
        return from === 'home' ? 'home' : 'explore';
    if ([
        'favorites',
        'rights',
        'privacy',
        'login',
        'member',
        'events',
        'event',
        'benefit',
        'messages',
        'support'
    ].includes(page))
        return 'me';
    if ([
        'station',
        'stations',
        'route',
        'guide'
    ].includes(page))
        return ROOTS.includes(from) ? from : 'home';
    return 'home';
}
export function findItem(catalog, collection, id) {
    if (!catalog || !id || !Array.isArray(catalog[collection]))
        return null;
    return catalog[collection].find(x => x.id === id) || null;
}
export function filterPois(catalog, category = '全部', nodeId = 'all') {
    if (!catalog)
        return [];
    return catalog.pois.filter(p => (category === '全部' || p.category === category) && (nodeId === 'all' || p.nodeId === nodeId));
}
export function isMapPoint(point) {
    return Boolean(point && point.crs === 'GCJ02' && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
}
export function navigationTarget(poi) {
    return poi && isMapPoint(poi.mapPoint) ? {
        name: poi.name,
        address: poi.address || '',
        latitude: poi.mapPoint.lat,
        longitude: poi.mapPoint.lng
    } : null;
}
export function narrationAction(item) {
    return item?.audioUrl ? 'audio' : 'text';
}
export function decodeFavorites(raw) {
    try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const ids = Array.isArray(v) ? v : v && v.version === 2 ? v.ids : [];
        return [
            ...new Set((Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string' && x.length > 0 && x.length < 161))
        ];
    }
    catch {
        return [];
    }
}
export function encodeFavorites(ids) {
    return {
        version: 2,
        ids: decodeFavorites(ids)
    };
}
export function updatedText(time, now) {
    if (!Number.isFinite(time))
        return '尚未收到定位';
    const sec = Math.max(0, Math.floor((now - time) / 1000));
    return sec < 60 ? `${sec}秒前更新` : sec < 3600 ? `${Math.floor(sec / 60)}分钟前更新` : `${Math.floor(sec / 3600)}小时前更新`;
}
export function transitMessage(snapshot, error = false) {
    if (error)
        return '实时数据连接失败，请重试';
    if (!snapshot)
        return '正在读取公交信息';
    if (snapshot.integration.state === 'not_configured')
        return '实时公交接入中，暂不显示车辆和到站时间';
    if (snapshot.integration.state === 'error' || snapshot.integration.state === 'stopped')
        return '实时数据连接中断，以下仅为最后有效信息';
    if (!snapshot.routeVersion)
        return '尚未收到完整线路数据';
    if (snapshot.freshness === 'no_data')
        return '尚未收到车辆定位';
    if (snapshot.freshness === 'unavailable')
        return '定位已过期，暂不提供到站判断';
    if (snapshot.freshness === 'stale')
        return '定位数据延迟，请留意更新时间';
    return '车辆位置来自公交系统';
}
function markerId(value) {
    let n = 2166136261;
    for (let i = 0; i < value.length; i++)
        n = Math.imul(n ^ value.charCodeAt(i), 16777619);
    return (n >>> 0) % 2147483646 + 1;
}
export function mapScene(layer, snapshot, catalog, now = Date.now()) {
    const markers = [], items = [], polylines = [];
    const branches = snapshot?.route?.branches || [];
    for (const branch of branches)
        if (branch.mapTrack?.length >= 2)
            polylines.push({
                id: `${branch.code}:${branch.direction}`,
                points: branch.mapTrack
            });
    if (layer === 'vehicles') {
        for (const v of snapshot?.vehicles || []) {
            items.push({
                id: v.id,
                name: v.label,
                kind: 'vehicle',
                subtitle: updatedText(v.locatedAt, now),
                vehicle: v
            });
            const age = Math.max(0, now - v.locatedAt);
            const expired = v.freshness === 'unavailable' || age > (snapshot.thresholds?.staleMs ?? 0);
            if (isMapPoint(v.mapPoint) && !expired)
                markers.push({
                    id: markerId('vehicle:' + v.id),
                    entityId: v.id,
                    kind: 'vehicle',
                    name: v.label,
                    point: v.mapPoint,
                    stale: v.freshness !== 'fresh' || age > (snapshot.thresholds?.freshMs ?? 0) || snapshot.integration.state !== 'connected'
                });
        }
    }
    else if (layer === 'stations') {
        const seen = new Set();
        for (const branch of branches)
            for (const s of branch.stops) {
                if (seen.has(s.code))
                    continue;
                seen.add(s.code);
                const id = s.tourismNodeId || s.code;
                items.push({
                    id,
                    name: s.name,
                    kind: 'station',
                    tourismNodeId: s.tourismNodeId,
                    stationCode: s.code,
                    subtitle: '公交站点'
                });
                if (isMapPoint(s.mapPoint))
                    markers.push({
                        id: markerId('station:' + s.code),
                        entityId: id,
                        kind: 'station',
                        name: s.name,
                        point: s.mapPoint,
                        tourismNodeId: s.tourismNodeId
                    });
            }
    }
    else {
        const categories = layer === 'sights' ? [
            '看什么'
        ] : layer === 'food' ? [
            '吃什么',
            '喝什么'
        ] : [
            '玩什么',
            '休息'
        ];
        for (const p of catalog?.pois || [])
            if (categories.includes(p.category)) {
                items.push({
                    id: p.id,
                    name: p.name,
                    kind: 'poi',
                    subtitle: p.subcategory,
                    nodeId: p.nodeId,
                    cover: p.cover
                });
                if (isMapPoint(p.mapPoint))
                    markers.push({
                        id: markerId('poi:' + p.id),
                        entityId: p.id,
                        kind: 'poi',
                        name: p.name,
                        point: p.mapPoint
                    });
            }
    }
    return {
        markers,
        items,
        polylines,
        hasGeometry: markers.length > 0 || polylines.length > 0
    };
}
export function stationMatches(snapshot, nodeId) {
    const matches = [];
    for (const b of snapshot?.route?.branches || [])
        for (const s of b.stops)
            if (s.tourismNodeId === nodeId)
                matches.push(s);
    return matches;
}


export function homeContent(catalog) {
    const home = catalog.home || {};
    const walks = catalog.walks || [];
    const ids = home.featuredWalkIds || [];
    return {
        heroTitle: home.heroTitle || '把南充，坐成一段风景。',
        heroSubtitle: home.heroSubtitle || '沿着嘉陵江，慢慢看这座城。',
        walks: (ids.length ? ids.map(id => walks.find(w => w.id === id)).filter(Boolean) : walks).slice(0, 4),
        pois: (catalog.pois || []).slice(0, 5),
        banners: (catalog.banners || []).filter(b => b.placement === 'home').slice(0, home.maxBanners ?? 5),
        announcements: catalog.announcements || [],
        routePath: (catalog.nodes || []).map(n => n.name).join(' → ')
    };
}
export function contentTarget(type, id) {
    const pages = { event: 'event', benefit: 'benefit', walk: 'walk', poi: 'poi', station: 'station', guide: 'guide' };
    const page = pages[type];
    return page ? page + (page === 'guide' ? '' : '/' + encodeURIComponent(id || '')) : null;
}
