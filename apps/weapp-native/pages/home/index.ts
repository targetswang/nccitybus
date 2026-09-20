import { retainPage } from '../../services/page-state';
import { homeContent } from '../../shared/client-core';
import { loadContent } from '../../services/content';
import { openTransitCode } from '../../services/transit';
import { track } from '../../services/api';
Page(retainPage({
    data: { catalog: null as any, home: null as any, mode: 'walks', walks: [] as any[], pois: [] as any[], error: '', loading: true },
    async onShow() { await this.refresh(); },
    async onPullDownRefresh() { await this.refresh(true); wx.stopPullDownRefresh(); },
    async refresh(force = false) {
        this.setData({ loading: true, error: '' });
        try {
            const c = await loadContent(force);
            const home = homeContent(c);
            this.setData({ catalog: c, home, walks: home.walks, pois: home.pois });
            void track('content_view', { page: 'home', contentVersion: c.version });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    stations() { wx.navigateTo({ url: '/pages/stations/index' }); }, privacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
    transit() { void track('transit_code_click', { page: 'home' }); openTransitCode(); }, live() { wx.reLaunch({ url: '/pages/live/index' }); }, guide() { wx.navigateTo({ url: '/pages/guide/index' }); }, route() { wx.navigateTo({ url: '/pages/route/index' }); }, explore() { wx.reLaunch({ url: '/pages/explore/index' }); }, switchMode(e: any) { this.setData({ mode: e.currentTarget.dataset.mode }); }, banner(e: any) {
        const b = e.currentTarget.dataset.banner;
        void track('banner_click', { page: 'home', objectType: 'banner', objectId: b.id, contentVersion: this.data.catalog?.version, properties: { targetType: b.targetType } });
        const map: any = { event: '/pages/events/index', walk: '/pages/walk/index', poi: '/pages/poi/index', station: '/pages/station/index', benefit: '/pages/rights/index', guide: '/pages/guide/index' };
        const base = map[b.targetType];
        if (base)
            wx.navigateTo({ url: base + (b.targetType === 'guide' ? '' : `?id=${encodeURIComponent(b.targetId)}`) });
    }
}, "home", ["mode"], 300000));
