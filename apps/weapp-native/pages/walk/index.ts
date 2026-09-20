import { navigationTarget } from '../../shared/client-core';
import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { openPoiLocation } from '../../services/navigation';
Page(retainPage({ data: { walk: null as any, pois: {} as any, error: '' }, query: {} as any, onLoad(q: any) { this.query = q; }, async onShow() {
        const q = this.query;
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            const walk = (c.walks || []).find((x: any) => x.id === q.id);
            if (!walk) {
                this.setData({ walk: null });
                throw new Error('路线不存在或已下线');
            }
            this.setData({ walk, cover: c.pois.find((p: any) => p.id === walk.coverPoiId)?.cover || null, pois: Object.fromEntries((c.pois || []).map((p: any) => [p.id, { ...p, canNavigate: !!navigationTarget(p) }])) });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, nav(e: any) {
        const p = this.data.pois[e.currentTarget.dataset.id];
        if (p?.mapPoint?.crs === 'GCJ02')
            openPoiLocation(p.name, p.mapPoint.lat, p.mapPoint.lng);
        else
            wx.showToast({ title: '精确坐标尚未核验', icon: 'none' });
    }, poi(e: any) { wx.navigateTo({ url: `/pages/poi/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); } }, "walk", [], 300000));
