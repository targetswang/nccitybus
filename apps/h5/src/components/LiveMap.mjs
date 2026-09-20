import { h, React } from '../runtime.mjs';
let sdk;
function loadSdk(key) {
    if (window.TMap)
        return Promise.resolve(window.TMap);
    if (sdk)
        return sdk;
    sdk = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
        script.onload = () => window.TMap ? resolve(window.TMap) : reject(new Error('地图加载失败'));
        script.onerror = () => reject(new Error('地图服务暂不可用'));
        document.head.append(script);
    }).catch(e => {
        sdk = null;
        throw e;
    });
    return sdk;
}
export default function LiveMap({ scene, mapKey, onSelect }) {
    const node = React.useRef(null), instance = React.useRef(null), latest = React.useRef(scene), select = React.useRef(onSelect);
    const [error, setError] = React.useState(null);
    latest.current = scene;
    select.current = onSelect;
    const drawable = scene.hasGeometry;
    function update() {
        if (!instance.current)
            return;
        const { T, markers, lines } = instance.current;
        markers.setGeometries(latest.current.markers.map(m => ({
            id: String(m.id),
            styleId: m.stale ? 'stale' : 'point',
            position: new T.LatLng(m.point.lat, m.point.lng),
            properties: {
                entity: m
            }
        })));
        lines.setGeometries(latest.current.polylines.map(l => ({
            id: l.id,
            styleId: 'route',
            paths: l.points.map(p => new T.LatLng(p.lat, p.lng))
        })));
    }
    React.useEffect(() => {
        let closed = false;
        if (!mapKey || !drawable)
            return;
        setError(null);
        loadSdk(mapKey).then(T => {
            if (closed)
                return;
            const p = latest.current.markers[0]?.point || latest.current.polylines[0]?.points[0];
            const map = new T.Map(node.current, {
                center: new T.LatLng(p.lat, p.lng),
                zoom: 14
            });
            const markers = new T.MultiMarker({
                map,
                styles: {
                    point: new T.MarkerStyle({
                        width: 30,
                        height: 30,
                        src: '/assets/map-marker.svg',
                        anchor: {
                            x: 15,
                            y: 30
                        }
                    }),
                    stale: new T.MarkerStyle({
                        width: 26,
                        height: 26,
                        src: '/assets/map-marker-stale.svg',
                        anchor: {
                            x: 13,
                            y: 26
                        }
                    })
                }
            });
            const lines = new T.MultiPolyline({
                map,
                styles: {
                    route: new T.PolylineStyle({
                        color: '#28745e',
                        width: 5
                    })
                }
            });
            markers.on('click', e => {
                const hit = e.geometry?.properties?.entity;
                if (hit)
                    select.current(hit);
            });
            instance.current = {
                T,
                map,
                markers,
                lines
            };
            update();
        }).catch(e => !closed && setError(e.message));
        return () => {
            closed = true;
            if (instance.current) {
                instance.current.markers.setMap(null);
                instance.current.lines.setMap(null);
                instance.current.map.destroy();
                instance.current = null;
            }
        };
    }, [
        mapKey,
        drawable
    ]);
    // Geometry changes never recreate the map or reset the user's zoom and pan.
    React.useEffect(update, [
        scene
    ]);
    return h('div', {
        className: 'live-map'
    }, h('div', {
        ref: node,
        className: 'map-canvas'
    }), (!mapKey || !drawable || error) && h('div', {
        className: 'map-note'
    }, h('strong', null, !drawable ? '尚无可显示的真实地图点' : !mapKey ? '地图服务尚未配置' : error), h('p', null, '车辆与站点列表独立可用；不会用示意轨迹冒充真实路线。')));
}

