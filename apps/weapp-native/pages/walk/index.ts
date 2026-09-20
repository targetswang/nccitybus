import { loadContent } from '../../services/content';
import { openPoiLocation } from '../../services/navigation';
Page({ data: { walk: null as any, pois: {} as any, error: '' }, query: {} as any, onLoad(q: any) { this.query = q; }, async onShow() { const q = this.query; this.setData({ error: '', walk: null }); try {
        const c = await loadContent();
        const walk = (c.walks || []).find((x: any) => x.id === q.id);
        if (!walk)
            throw new Error('路线不存在或已下线');
        this.setData({ walk, pois: Object.fromEntries((c.pois || []).map((p: any) => [p.id, p])) });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } }, nav(e: any) { const p = this.data.pois[e.currentTarget.dataset.id]; if (p?.mapPoint?.crs === 'GCJ02')
        openPoiLocation(p.name, p.mapPoint.lat, p.mapPoint.lng);
    else
        wx.showToast({ title: '精确坐标尚未核验', icon: 'none' }); }, poi(e: any) { wx.navigateTo({ url: `/pages/poi/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); } });
