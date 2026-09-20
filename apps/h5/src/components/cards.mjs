import { h } from '../runtime.mjs';
import { Picture, go, Icon } from './common.mjs';
export function PoiCard({ poi, nodeName, compact = false }) {
    return h('button', {
        className: `content-card ${compact ? 'compact' : ''}`,
        onClick: () => go(`poi/${encodeURIComponent(poi.id)}`)
    }, h(Picture, {
        src: poi.cover,
        alt: poi.name,
        label: poi.category
    }), h('div', {
        className: 'card-body'
    }, h('h3', null, poi.name), h('p', {
        className: 'meta'
    }, nodeName || poi.subcategory), h('p', {
        className: 'summary'
    }, poi.description)));
}
export function WalkCard({ walk, catalog, compact = false }) {
    const cover = catalog.pois.find(p => p.id === walk.coverPoiId);
    return h('button', {
        className: `content-card ${compact ? 'compact' : ''}`,
        onClick: () => go(`walk/${walk.id}`)
    }, h(Picture, {
        src: cover?.cover,
        alt: walk.title,
        label: '路线玩法'
    }), h('div', {
        className: 'card-body'
    }, h('p', {
        className: 'meta'
    }, walk.duration, ' · ', walk.bestTime), h('h3', null, walk.title), h('p', {
        className: 'summary'
    }, walk.subtitle), h('div', {
        className: 'tags'
    }, walk.tags.map(t => h('span', {
        key: t
    }, t)))));
}
export function StationRows({ catalog, from = 'home' }) {
    return h('div', {
        className: 'station-list'
    }, catalog.nodes.map((s, i) => h('button', {
        key: s.id,
        className: 'station-row',
        onClick: () => go(`station/${s.id}?from=${from}`)
    }, h('span', {
        className: 'stop-index'
    }, i + 1), h('span', {
        className: 'grow'
    }, h('strong', null, s.name), h('small', null, s.persona)), h(Icon, {
        name: 'chevron'
    }))));
}

