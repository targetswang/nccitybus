import { h } from '../runtime.mjs';
import { go, Icon, TransitCode } from '../components/common.mjs';
import { PoiCard } from '../components/cards.mjs';
export function MePage({ favorites }) {
    return h('div', {
        className: 'page-content'
    }, h('div', {
        className: 'profile'
    }, h('div', {
        className: 'avatar'
    }, h(Icon, {
        name: 'user',
        size: 36
    })), h('div', null, h('h1', null, '我的漫游'), h('p', null, '收藏保存在当前浏览器'))), h('div', {
        className: 'facts'
    }, h('button', {
        onClick: () => go('favorites')
    }, h('strong', null, favorites.ids.length), h('small', null, '我的收藏')), h('button', {
        onClick: () => go('stations')
    }, h('strong', null, '站点'), h('small', null, '候车与游览'))), h('div', {
        className: 'panel menu-list'
    }, [
        [
            'favorites',
            '我的收藏',
            'heart'
        ],
        [
            'rights',
            '我的权益',
            'info'
        ],
        [
            'guide',
            '乘车指南',
            'bus'
        ],
        [
            'privacy',
            '数据与隐私',
            'info'
        ]
    ].map(([page, label, icon]) => h('button', {
        key: page,
        onClick: () => go(page)
    }, h(Icon, {
        name: icon
    }), h('strong', {
        className: 'grow'
    }, label), h(Icon, {
        name: 'chevron'
    })))));
}
export function FavoritesPage({ catalog, favorites }) {
    const saved = catalog.pois.filter(p => favorites.ids.includes(p.id)), missing = favorites.ids.filter(id => !catalog.pois.some(p => p.id === id));
    return h('div', {
        className: 'page-content'
    }, h('h1', null, '我的收藏'), saved.map(p => h(PoiCard, {
        key: p.id,
        poi: p
    })), !saved.length && h('p', {
        className: 'panel'
    }, '还没有可显示的收藏，去漫游看看。'), missing.length > 0 && h('p', {
        className: 'inline-note'
    }, `${missing.length}项收藏内容已不可用，原收藏标识仍被保留。`));
}
export function GuidePage({ catalog, capabilities }) {
    return h('div', {
        className: 'page-content'
    }, h('h1', null, '乘车指南'), catalog.guides.map((q, i) => h('section', {
        className: 'panel',
        key: q.title
    }, h('span', {
        className: 'step-no'
    }, String(i + 1).padStart(2, '0')), h('h2', null, q.title), h('p', null, q.body))), h(TransitCode, {
        capabilities
    }));
}
export function RightsPage() {
    return h('div', {
        className: 'page-content'
    }, h('h1', null, '我的权益'), h('div', {
        className: 'panel'
    }, h('h2', null, '暂无已发布活动'), h('p', null, '这里仅显示已开放的游客活动，不影响日常乘车与漫游服务。')));
}
export function PrivacyPage({ catalog }) {
    return h('div', {
        className: 'page-content'
    }, h('h1', null, '数据与隐私'), h('div', {
        className: 'panel'
    }, h('h2', null, '浏览与收藏'), h('p', null, catalog.privacy)), h('div', {
        className: 'panel'
    }, h('h2',null,'定位与公交'),h('p',null,'定位仅在相关功能实际启用并授权后使用。公交实时信息与用户身份不自动关联。'),h('h2', null, '内容与图片'), h('p', null, '路线文字是游览建议，并非实时营业、发车或门票信息。未核实的营业时间和消费金额不作为事实展示。')));
}

