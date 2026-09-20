import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
Page(retainPage({ data: { stations: [] as any[], error: '' }, async onShow() {
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            this.setData({ stations: c.nodes || [] });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, open(e: any) { wx.navigateTo({ url: `/pages/station/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); } }, "stations", [], 300000));
