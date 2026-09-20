import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
Page(retainPage({ data: { routeName: '', stations: [] as any[], error: '' }, async onShow() {
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            this.setData({ routeName: c.routeName, stations: c.nodes || [] });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, station(e: any) { wx.navigateTo({ url: `/pages/station/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); }, live() { wx.reLaunch({ url: '/pages/live/index' }); } }, "route", [], 300000));
