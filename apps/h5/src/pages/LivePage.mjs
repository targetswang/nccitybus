import { h, React } from '../runtime.mjs';
import { useResource } from '../hooks/resource.mjs';
import { mapScene, transitMessage } from '../model.mjs';
import { go, Section, Icon, Loading } from '../components/common.mjs';
import LiveMap from '../components/LiveMap.mjs';
export default function LivePage({ catalog, capabilities, liveRouteId, setLiveRouteId, layer, setLayer }) {
    const resource = useResource(`/transit/live?routeId=${encodeURIComponent(liveRouteId)}`, {
        pollMs: 10000
    });
    const snapshot = resource.data;
    const scene = React.useMemo(() => mapScene(layer, snapshot, catalog), [
        layer,
        snapshot,
        catalog,
        resource.error
    ]);
    const onSelect = React.useCallback(item => {
        if (item.kind === 'poi')
            go(`poi/${item.entityId || item.id}`);
        if (item.kind === 'station' && item.tourismNodeId)
            go(`station/${item.tourismNodeId}?from=live`);
    }, []);
    return h('div', {
        className: 'page-content live-page'
    }, h('div', {
        className: 'section-heading'
    }, h('h1', null, '漫游地图'), h('button', {
        className: 'text-button',
        onClick: resource.retry
    }, '刷新')), capabilities?.routes?.length > 1 && h('label', {
        className: 'station-filter'
    }, '选择线路', h('select', {
        value: liveRouteId,
        onChange: e => setLiveRouteId(e.target.value)
    }, capabilities.routes.map(r => h('option', {
        key: r.id,
        value: r.id
    }, r.name)))), h('div', {
        className: 'inline-note',
        role: resource.error ? 'alert' : 'status'
    }, transitMessage(snapshot, Boolean(resource.error))), h('div', {
        className: 'category-filters',
        'aria-label': '地图图层'
    }, [
        [
            'vehicles',
            '车辆'
        ],
        [
            'stations',
            '站点'
        ],
        [
            'sights',
            '景点'
        ],
        [
            'food',
            '美食'
        ],
        [
            'shopping',
            '商业'
        ]
    ].map(([k, v]) => h('button', {
        key: k,
        className: layer === k ? 'selected' : '',
        onClick: () => setLayer(k)
    }, v))), h(LiveMap, {
        scene,
        mapKey: capabilities?.map?.h5Key,
        onSelect
    }), h(Section, {
        title: layer === 'vehicles' ? '车辆位置' : layer === 'stations' ? '公交站点' : '沿线地点'
    }, resource.loading && !snapshot ? h(Loading) : h('div', {
        className: 'panel menu-list'
    }, scene.items.map(item => h('button', {
        key: item.id,
        onClick: () => onSelect(item),
        disabled: item.kind === 'vehicle' || (item.kind === 'station' && !item.tourismNodeId)
    }, h(Icon, {
        name: item.kind === 'vehicle' ? 'bus' : 'pin'
    }), h('span', {
        className: 'grow'
    }, h('strong', null, item.name), h('small', null, item.subtitle)), item.kind === 'poi' && h(Icon, {
        name: 'chevron'
    }))), !scene.items.length && h('p', {
        className: 'empty-copy'
    }, layer === 'vehicles' ? '暂无有效车辆定位' : '当前图层暂无可用数据'))), snapshot?.vehicles?.some(x => x.freshness !== 'fresh') && h('p', {
        className: 'inline-note'
    }, '过期定位不代表当前车辆位置，不提供模拟到站时间。'), h('button', {
        className: 'button secondary full',
        onClick: () => go('stations?from=live')
    }, '查看文旅站点与玩法'));
}

