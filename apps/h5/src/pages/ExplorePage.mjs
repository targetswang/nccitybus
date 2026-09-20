import { h } from '../runtime.mjs';
import { Switch } from '../components/common.mjs';
import { PoiCard, WalkCard } from '../components/cards.mjs';
import { filterPois } from '../model.mjs';
export default function ExplorePage({ catalog, mode, setMode, category, setCategory, nodeId, setNodeId }) {
    const places = filterPois(catalog, category, nodeId);
    return h('div', {
        className: 'page-content'
    }, h('div', {
        className: 'page-intro'
    }, h('h1', null, '像当地人一样，', h('br'), '慢慢认识南充。'), h('p', null, '选择一条完整玩法，或发现这一站值得去的地方。')), h(Switch, {
        value: mode,
        onChange: setMode
    }), mode === 'walks' ? h('div', {
        className: 'card-list'
    }, catalog.walks.map(w => h(WalkCard, {
        key: w.id,
        walk: w,
        catalog
    }))) : h('section', null, h('div', {
        className: 'category-filters',
        'aria-label': '地点类别'
    }, [
        '全部',
        '吃什么',
        '喝什么',
        '看什么',
        '玩什么',
        '休息'
    ].map(c => h('button', {
        key: c,
        className: c === category ? 'selected' : '',
        onClick: () => setCategory(c)
    }, c))), h('label', {
        className: 'station-filter'
    }, '按站点筛选', h('select', {
        value: nodeId,
        onChange: e => setNodeId(e.target.value)
    }, h('option', {
        value: 'all'
    }, '全部站点'), catalog.nodes.map(n => h('option', {
        key: n.id,
        value: n.id
    }, n.name)))), h('div', {
        className: 'card-list'
    }, places.map(p => h(PoiCard, {
        key: p.id,
        poi: p,
        nodeName: catalog.nodes.find(n => n.id === p.nodeId)?.name
    }))), !places.length && h('p', {
        className: 'inline-note'
    }, '当前筛选条件下没有地点。')));
}

