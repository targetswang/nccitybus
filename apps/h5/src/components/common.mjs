import { h, React } from '../runtime.mjs';
import { ownerForPage, ROOTS, navigationTarget } from '../model.mjs';
export function Icon({ name = 'bus', size = 24 }) {
    const paths = {
        bus: 'M5 16V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 9h14M5 16h14M7 16v3m10-3v3M8 12h.01M16 12h.01',
        map: 'M21 3 9 9 3 21 15 15 21 3ZM9 9l6 6',
        explore: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4 5-3 6-5 2 3-6 5-2',
        user: 'M8 7a4 4 0 1 1 8 0 4 4 0 0 1-8 0M4 21v-2a8 8 0 0 1 16 0v2',
        pin: 'M12 22s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14ZM9 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
        heart: 'M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8L12 21Z',
        back: 'm15 4-8 8 8 8',
        chevron: 'm9 4 8 8-8 8',
        info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v1m0 3v6',
        audio: 'M4 14V9a8 8 0 0 1 16 0v5M4 10H2v8h5v-8H4m16 0h2v8h-5v-8h3'
    };
    return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
    }, h('path', {
        d: paths[name] || paths.info
    }));
}
export const go = target => {
    window.location.hash = target;
};
export function Header({ route, title }) {
    return h('header', {
        className: 'header'
    }, ROOTS.includes(route.page) ? h('div', {
        className: 'brand-mark'
    }, h(Icon, {
        name: 'bus'
    })) : h('button', {
        'aria-label': '返回',
        className: 'icon-button',
        onClick: () => history.state?.ncInternal ? history.back() : go(ownerForPage(route.page, route.params.from))
    }, h(Icon, {
        name: 'back'
    })), h('div', {
        className: 'header-copy'
    }, h('strong', null, title), h('small', null, '南充城市漫游环线')), h('button', {
        className: 'icon-button',
        'aria-label': '乘车指南',
        onClick: () => go('guide')
    }, h(Icon, {
        name: 'info'
    })));
}
export function BottomNav({ route }) {
    const active = ownerForPage(route.page, route.params.from);
    return h('nav', {
        className: 'bottom-nav',
        'aria-label': '主导航'
    }, [
        [
            'home',
            '首页',
            'bus'
        ],
        [
            'live',
            '实时',
            'map'
        ],
        [
            'explore',
            '漫游',
            'explore'
        ],
        [
            'me',
            '我的',
            'user'
        ]
    ].map(([key, label, icon]) => h('button', {
        key,
        className: active === key ? 'selected' : '',
        'aria-current': active === key ? 'page' : undefined,
        onClick: () => go(key)
    }, h(Icon, {
        name: icon
    }), h('span', null, label))));
}
export function ErrorState({ error, retry }) {
    return h('div', {
        className: 'state-card',
        role: 'alert'
    }, h(Icon, {
        name: 'info',
        size: 36
    }), h('h2', null, '暂时无法读取'), h('p', null, error?.message || '服务暂不可用'), retry && h('button', {
        className: 'button primary',
        onClick: retry
    }, '重新加载'));
}
export function Loading() {
    return h('div', {
        className: 'state-card',
        role: 'status'
    }, '正在读取…');
}
export function NotFound() {
    return h('div', {
        className: 'state-card'
    }, h('h2', null, '内容不存在或已下线'), h('p', null, '请返回列表选择其他内容。'), h('button', {
        className: 'button primary',
        onClick: () => go('explore')
    }, '返回漫游'));
}
export function Section({ title, more, onMore, children }) {
    return h('section', {
        className: 'section'
    }, h('div', {
        className: 'section-heading'
    }, h('h2', null, title), more && h('button', {
        onClick: onMore
    }, more, h(Icon, {
        name: 'chevron',
        size: 16
    }))), children);
}
export function Switch({ value, onChange }) {
    return h('div', {
        className: 'segmented',
        role: 'tablist'
    }, [
        [
            'walks',
            '路线玩法'
        ],
        [
            'places',
            '沿线地点'
        ]
    ].map(([key, label]) => h('button', {
        key,
        role: 'tab',
        'aria-selected': key === value,
        onClick: () => onChange(key),
        className: key === value ? 'selected' : ''
    }, label)));
}
export function Picture({ src, alt, label }) {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => setFailed(false), [
        src
    ]);
    return h('div', {
        className: 'picture'
    }, src && !failed ? h('img', {
        src,
        alt,
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setFailed(true)
    }) : h('div', {
        className: 'picture-fallback'
    }, h(Icon, {
        name: 'pin',
        size: 40
    }), h('span', null, alt)), label && h('span', {
        className: 'picture-label'
    }, label));
}
export function NavigationButton({ poi }) {
    const target = navigationTarget(poi);
    return target ? h('button', {
        className: 'button primary',
        onClick: () => {
            const u = new URL('https://apis.map.qq.com/uri/v1/marker');
            u.searchParams.set('marker', `coord:${target.latitude},${target.longitude};title:${target.name};addr:${target.address}`);
            u.searchParams.set('referer', 'nanchong-city-tour');
            window.open(u, '_blank', 'noopener,noreferrer');
        }
    }, h(Icon, {
        name: 'map'
    }), '地图导航') : h('div', {
        className: 'inline-note'
    }, '暂未确认精确位置，请按地址核实后出行。');
}
export function Narration({ item }) {
    const [open, setOpen] = React.useState(false);
    return item.audioUrl ? h('div', {
        className: 'audio-panel'
    }, h('h3', null, '语音讲解'), h('audio', {
        controls: true,
        src: item.audioUrl,
        preload: 'none'
    }), h('details', null, h('summary', null, '查看讲解文本'), h('p', null, item.narration))) : h('details', {
        className: 'narration',
        open,
        onToggle: e => setOpen(e.currentTarget.open)
    }, h('summary', null, '阅读讲解'), h('p', null, item.narration || item.description));
}
export function TransitCode({ capabilities }) {
    const [open, setOpen] = React.useState(false);
    return h(React.Fragment, null, h('button', {
        className: 'quick-card',
        onClick: () => setOpen(true)
    }, h('span', {
        className: 'quick-icon'
    }, h(Icon, {
        name: 'map',
        size: 32
    })), h('span', null, h('strong', null, '乘车码'), h('small', null, '刷码上车'))), open && h('div', {
        className: 'dialog-mask',
        onClick: e => {
            if (e.target === e.currentTarget)
                setOpen(false);
        }
    }, h('section', {
        role: 'dialog',
        'aria-modal': true,
        'aria-label': '微信乘车码',
        className: 'dialog'
    }, h('h2', null, '微信乘车码'), h('p', null, capabilities?.transitCode?.configured ? '请在微信原生小程序中使用乘车码入口。网页版不伪装原生小程序跳转。' : '乘车码入口尚未完成公交集团授权配置，请使用公交集团现有乘车码。'), h('button', {
        className: 'button primary',
        onClick: () => setOpen(false)
    }, '知道了'))));
}

