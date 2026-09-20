import { h, React } from './runtime.mjs';
import { parseRoute, ROOTS } from './model.mjs';
import { useResource } from './hooks/resource.mjs';
import { useFavorites } from './hooks/favorites.mjs';
import { Header, BottomNav, Loading, ErrorState, NotFound } from './components/common.mjs';
import HomePage from './pages/HomePage.mjs';
import ExplorePage from './pages/ExplorePage.mjs';
import LivePage from './pages/LivePage.mjs';
import { RoutePage, StationsPage, StationPage, WalksPage, WalkPage, PoiPage } from './pages/ContentPages.mjs';
import { FavoritesPage, GuidePage, PrivacyPage } from './pages/ProfilePages.mjs';
import { AccountPage, LoginPage, MemberPage, RightsPage, EventsPage, MessagesPage, SupportPage } from './pages/ServicePages.mjs';
import { useVisitor } from './services/visitor.mjs';
const TITLES = {
    home: '嘉陵江城市漫游',
    live: '漫游地图',
    explore: '沿线漫游',
    me: '我的漫游',
    route: '线路总览',
    stations: '全部环线站点',
    station: '站点详情',
    walks: '城市玩法',
    walk: '路线详情',
    poi: '地点详情',
    guide: '乘车指南',
    favorites: '我的收藏',
    rights: '我的权益',
    privacy: '数据与隐私',
    login: '手机号登录',
    member: '会员服务',
    events: '城市活动',
    event: '活动详情',
    benefit: '权益详情',
    messages: '我的消息',
    support: '客服与反馈'
};
export default function App() {
    const [route, setRoute] = React.useState(() => parseRoute(location.hash)), [mode, setMode] = React.useState('walks'), [category, setCategory] = React.useState('全部'), [nodeId, setNodeId] = React.useState('all'), [layer, setLayer] = React.useState('vehicles'), [liveRouteId, setLiveRouteId] = React.useState('jialing-loop');
    const content = useResource('/content', {
        pollMs: ['member','events','event','rights','benefit'].includes(route.page)?30000:300000
    }), caps = useResource('/capabilities'), visitor = useVisitor(), favorites = useFavorites(visitor), catalog = content.data;
    const scroller = React.useRef(null), positions = React.useRef({}), previous = React.useRef(route.page);
    React.useEffect(() => {
        const changed = () => {
            positions.current[previous.current] = scroller.current?.scrollTop || 0;
            const next = parseRoute(location.hash);
            setRoute(next);
            previous.current = next.page;
            history.replaceState({
                ncInternal: true
            }, '');
        };
        window.addEventListener('hashchange', changed);
        return () => window.removeEventListener('hashchange', changed);
    }, []);
    React.useEffect(() => {
        if (scroller.current)
            scroller.current.scrollTop = ROOTS.includes(route.page) ? positions.current[route.page] || 0 : 0;
    }, [
        route.page,
        route.id
    ]);
    React.useEffect(()=>{content.retry();if(visitor.session)void visitor.refresh();},[route.page,route.id]);
    let page;
    if (route.page === 'live')
        page = h(LivePage, {
            catalog,
            capabilities: caps.data,
            liveRouteId,
            setLiveRouteId,
            layer,
            setLayer
        });
    else if (route.page === 'not-found')
        page = h(NotFound);
    else if (!catalog)
        page = content.error ? h(ErrorState, {
            error: content.error,
            retry: content.retry
        }) : h(Loading);
    else
        switch (route.page) {
            case 'home':
                page = h(HomePage, {
                    catalog,
                    capabilities: caps.data,
                    mode,
                    setMode
                });
                break;
            case 'explore':
                page = h(ExplorePage, {
                    catalog,
                    mode,
                    setMode,
                    category,
                    setCategory,
                    nodeId,
                    setNodeId
                });
                break;
            case 'me':
                page = h(AccountPage, { favorites, visitor });
                break;
            case 'route':
                page = h(RoutePage, {
                    catalog,
                    from: route.params.from
                });
                break;
            case 'stations':
                page = h(StationsPage, {
                    catalog,
                    from: route.params.from
                });
                break;
            case 'station':
                page = h(StationPage, {
                    catalog,
                    id: route.id,
                    from: route.params.from
                });
                break;
            case 'walks':
                page = h(WalksPage, {
                    catalog
                });
                break;
            case 'walk':
                page = h(WalkPage, {
                    catalog,
                    id: route.id
                });
                break;
            case 'poi':
                page = h(PoiPage, {
                    catalog,
                    id: route.id,
                    favorites
                });
                break;
            case 'favorites':
                page = h(FavoritesPage, {
                    catalog,
                    favorites
                });
                break;
            case 'guide':
                page = h(GuidePage, {
                    catalog,
                    capabilities: caps.data
                });
                break;
            case 'rights':
                page = h(RightsPage, { catalog, visitor });
                break;
            case 'login':
                page = h(LoginPage, { visitor, returnTo: route.params.return || 'me' });
                break;
            case 'member':
                page = h(MemberPage, { catalog, visitor });
                break;
            case 'events':
            case 'event':
                page = h(EventsPage, { catalog, visitor, id: route.id });
                break;
            case 'benefit':
                page = h(RightsPage, { catalog, visitor, id: route.id });
                break;
            case 'messages':
                page = h(MessagesPage, { visitor });
                break;
            case 'support':
                page = h(SupportPage, { visitor });
                break;
            case 'privacy':
                page = h(PrivacyPage, {
                    catalog
                });
                break;
            default: page = h(NotFound);
        }
    return h('div', {
        className: 'app-shell'
    }, h(Header, {
        route,
        title: TITLES[route.page] || '页面不存在'
    }), h('main', {
        ref: scroller,
        className: 'app-scroll'
    }, route.page!=='live'&&h('button',{className:'text-button',onClick:content.retry,disabled:content.loading},'刷新内容'), content.error && catalog && h('p', {
        className: 'inline-note',
        role: 'alert'
    }, '内容刷新失败，当前仍显示此前读取的版本。'), page), h(BottomNav, {
        route
    }));
}

