import { h } from '../runtime.mjs';
import { Picture, Section, NotFound, NavigationButton, Narration, go } from '../components/common.mjs';
import { StationRows, PoiCard, WalkCard } from '../components/cards.mjs';
import { findItem, stationMatches } from '../model.mjs';
import { useResource } from '../hooks/resource.mjs';
export function RoutePage({ catalog, from }) {
    return h('div', {
        className: 'page-content'
    }, h('div', {
        className: 'page-intro'
    }, h('h1', null, catalog.routeName), h('p', null, `${catalog.nodes.length}个文旅站点串联江岸、街区与城市生活。`)), h('div', {
        className: 'facts'
    }, h('div', null, h('strong', null, catalog.nodes.length), h('small', null, '文旅站点')), h('div', null, h('strong', null, '随到随上'), h('small', null, '无需预约'))), h(StationRows, {
        catalog,
        from
    }), h('p', {
        className: 'inline-note'
    }, '这里介绍文旅停留点。实际停靠顺序和线路轨迹以公交系统发布为准。'), h('button', {
        className: 'button primary full',
        onClick: () => go('live')
    }, '进入实时查车'));
}
export function StationsPage({ catalog, from }) {
    return h('div', {
        className: 'page-content'
    }, h('div', {
        className: 'page-intro'
    }, h('h1', null, '每一站，都是一个玩法入口。'), h('p', null, '查看这一站的游览内容与交通信息。')), h(StationRows, {
        catalog,
        from
    }));
}
export function StationPage({ catalog, id, from }) {
    const live = useResource(`/transit/live?routeId=${catalog.routeId}`, {
        pollMs: 10000
    }), node = findItem(catalog, 'nodes', id);
    if (!node)
        return h(NotFound);
    const official = stationMatches(live.data, id), poi = catalog.pois.filter(p => p.nodeId === id);
    return h('div', {
        className: 'page-content'
    }, h('div', {
        className: 'page-intro'
    }, h('h1', null, node.name), h('p', null, node.persona)), h('div', {
        className: 'panel'
    }, h('h2', null, '乘车与候车'), h('p', null, official.length ? '已关联公交系统站点。' : '公交站牌位置尚未完成确认，请勿以景区中心点作为候车点。'), official.map(s => h('div', {
        key: s.code
    }, h(NavigationButton, {
        poi: {
            name: s.name,
            address: '公交站点',
            mapPoint: s.mapPoint
        }
    }))), h('button', {
        className: 'button secondary',
        onClick: () => go('live')
    }, '查看实时车辆')), h(Section, {
        title: '这一站怎么玩'
    }, h('div', {
        className: 'card-list'
    }, poi.map(p => h(PoiCard, {
        key: p.id,
        poi: p,
        nodeName: node.name
    })))));
}
export function WalksPage({ catalog }) {
    return h('div', {
        className: 'page-content'
    }, h('h1', null, '选一条路线，慢慢认识南充'), h('div', {
        className: 'card-list'
    }, catalog.walks.map(w => h(WalkCard, {
        key: w.id,
        walk: w,
        catalog
    }))));
}
export function WalkPage({ catalog, id }) {
    const w = findItem(catalog, 'walks', id);
    if (!w)
        return h(NotFound);
    const cover = findItem(catalog, 'pois', w.coverPoiId);
    return h('article', {
        className: 'page-content walk-detail'
    }, h(Picture, {
        src: cover?.cover,
        alt: w.title,
        label: '路线玩法'
    }), h('div', {
        className: 'page-intro'
    }, h('h1', null, w.title), h('p', null, w.subtitle)), h('div', {
        className: 'facts'
    }, h('div', null, h('strong', null, w.duration), h('small', null, '建议游览时长')), h('div', null, h('strong', null, w.bestTime), h('small', null, '建议时段，非运营时刻'))), h('div', {
        className: 'panel'
    }, h('h2', null, '这条路线为什么值得走'), h('p', null, w.story), h('p', {
        className: 'route-overview'
    }, w.routeLine), h('p', null, '适合：', w.audience)), h(Section, {
        title: '照着这样走'
    }, w.steps.map((s, i) => {
        const p = findItem(catalog, 'pois', s.poiId);
        return h('section', {
            className: 'walk-step',
            key: `${w.id}-${i}`
        }, h(Picture, {
            src: p?.cover,
            alt: s.title
        }), h('div', {
            className: 'card-body'
        }, h('span', {
            className: 'step-no'
        }, String(i + 1).padStart(2, '0')), h('h2', null, s.title), h('p', {
            className: 'meta'
        }, s.stay), h('p', null, s.intro), h('aside', {
            className: 'local-tip'
        }, h('strong', null, '像当地人一点'), h('p', null, s.localTip)), p && h(NavigationButton, {
            poi: p
        }), h(Narration, {
            item: s
        }), p && h('button', {
            className: 'button secondary full',
            onClick: () => go(`poi/${p.id}`)
        }, '查看地点详情')));
    })), h('div', {
        className: 'panel'
    }, h('h2', null, '出发前知道这些'), w.practical.map(t => h('p', {
        key: t
    }, t))));
}
export function PoiPage({ catalog, id, favorites }) {
    const p = findItem(catalog, 'pois', id);
    if (!p)
        return h(NotFound);
    const node = findItem(catalog, 'nodes', p.nodeId);
    return h('article', {
        className: 'page-content'
    }, h(Picture, {
        src: p.cover,
        alt: p.name,
        label: p.category
    }), h('div', {
        className: 'page-intro'
    }, h('h1', null, p.name), h('p', null, p.subcategory, ' · ', node?.name)), h('div', {
        className: 'panel'
    }, h('h2', null, '为什么值得去'), h('p', null, p.description), h('dl', {
        className: 'info-list'
    }, h('dt', null, '地址'), h('dd', null, p.address), h('dt', null, '营业信息'), h('dd', null, p.openingHours || '请向商家或场地确认'), h('dt', null, '消费建议'), h('dd', null, p.priceAdvice || '以现场公示为准'))), h(NavigationButton, {
        poi: p
    }), h(Narration, {
        item: p
    }), h('div', {
        className: 'action-row'
    }, h('button', {
        className: 'button secondary',
        onClick: () => favorites.toggle(p.id)
    }, favorites.ids.includes(p.id) ? '已收藏 · 取消' : '收藏地点'), h('button', {
        className: 'button primary',
        onClick: () => go(`station/${p.nodeId}?from=explore`)
    }, '查看关联站点')), favorites.error && h('p', {
        role: 'alert'
    }, favorites.error));
}

