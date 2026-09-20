import { h } from '../runtime.mjs';
import { Section, Switch, TransitCode, Icon, go } from '../components/common.mjs';
import { PoiCard, WalkCard } from '../components/cards.mjs';
export default function HomePage({ catalog, capabilities, mode, setMode }) {
    return h('div', {
        className: 'home-page'
    }, h('div', {
        className: 'hero'
    }, h('span', {
        className: 'tag'
    }, '城市漫游环线'), h('h1', null, '把南充，', h('br'), '坐成一段风景。'), h('p', null, '沿着嘉陵江，慢慢看这座城。'), h('svg', {
        className: 'hero-scene',
        viewBox: '0 0 460 210',
        'aria-hidden': true
    }, h('path', {
        d: 'M0 150Q110 60 240 130T460 130V210H0Z',
        fill: '#356d60'
    }), h('path', {
        d: 'M0 190Q160 105 278 166T460 163V220H0Z',
        fill: '#89b4a0'
    }), h('circle', {
        cx: 384,
        cy: 53,
        r: 29,
        fill: '#e4c681'
    }), h('g', {
        transform: 'translate(235 145) rotate(-7)'
    }, h('rect', {
        width: 165,
        height: 48,
        rx: 11,
        fill: '#efbd77'
    }), h('rect', {
        x: 12,
        y: 9,
        width: 91,
        height: 19,
        rx: 4,
        fill: '#215049'
    }), h('rect', {
        x: 118,
        y: 9,
        width: 34,
        height: 19,
        rx: 4,
        fill: '#215049'
    }), h('circle', {
        cx: 30,
        cy: 48,
        r: 11,
        fill: '#193e36'
    }), h('circle', {
        cx: 134,
        cy: 48,
        r: 11,
        fill: '#193e36'
    })))), h('div', {
        className: 'quick-actions'
    }, h(TransitCode, {
        capabilities
    }), h('button', {
        className: 'quick-card',
        onClick: () => go('live')
    }, h('span', {
        className: 'quick-icon gold'
    }, h(Icon, {
        name: 'bus',
        size: 32
    })), h('span', null, h('strong', null, '实时查车'), h('small', null, '车辆与站点')))), h('button', {
        className: 'notice',
        onClick: () => go('guide')
    }, h(Icon, {
        name: 'info',
        size: 18
    }), catalog.notice), h(Section, {
        title: '一条线，慢游南充',
        more: '线路总览',
        onMore: () => go('route')
    }, h('button', {
        className: 'route-card',
        onClick: () => go('route')
    }, h('div', {
        className: 'route-cover'
    }, h('strong', null, '01'), h('span', null, h('small', null, 'CITY LOOP'), h('b', null, '嘉陵江畔 · 城市漫游')), h(Icon, {
        name: 'bus',
        size: 42
    })), h('div', {
        className: 'card-body'
    }, h('h3', null, catalog.routeName), h('p', null, catalog.nodes.map(x => x.name.replace(/站$/, '')).join(' → ')), h('span', {
        className: 'tag'
    }, '随到随上 · 随站下车')))), h(Section, {
        title: '漫游精选',
        more: '查看更多',
        onMore: () => go('explore')
    }, h(Switch, {
        value: mode,
        onChange: setMode
    }), h('div', {
        className: 'horizontal-cards'
    }, mode === 'walks' ? catalog.walks.map(w => h(WalkCard, {
        key: w.id,
        walk: w,
        catalog,
        compact: true
    })) : catalog.pois.slice(0, 5).map(p => h(PoiCard, {
        key: p.id,
        poi: p,
        compact: true,
        nodeName: catalog.nodes.find(n => n.id === p.nodeId)?.name
    })))), h(Section, {
        title: '出发前，先看这里'
    }, h('div', {
        className: 'panel menu-list'
    }, [
        [
            'stations',
            '全部环线站点',
            '候车信息与周边内容'
        ],
        [
            'guide',
            '乘车指南',
            '乘车码与环线规则'
        ],
        [
            'privacy',
            '数据与隐私',
            '定位、收藏与账号说明'
        ]
    ].map(([page, title, sub]) => h('button', {
        key: page,
        onClick: () => go(page)
    }, h(Icon, {
        name: page === 'stations' ? 'pin' : 'info'
    }), h('span', {
        className: 'grow'
    }, h('strong', null, title), h('small', null, sub)), h(Icon, {
        name: 'chevron'
    }))))), h('p', {
        className: 'brand-footer'
    }, '一江风景 · 一城故事'));
}

