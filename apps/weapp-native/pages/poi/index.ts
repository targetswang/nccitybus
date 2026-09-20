import { loadContent } from '../../services/content';
import { openPoiLocation } from '../../services/navigation';
import { getFavorites, toggleFavorite } from '../../services/storage';
import { readSession, readProfile } from '../../services/session';
import { meAction, track } from '../../services/api';
Page({ data: { poi: null as any, liked: false, error: '' }, query: {} as any, onLoad(q: any) { this.query = q; }, async onShow() { const q = this.query; this.setData({ error: '', poi: null }); try {
        const c = await loadContent();
        const poi = (c.pois || []).find((x: any) => x.id === q.id);
        if (!poi)
            throw new Error('地点不存在或已下线');
        const s = readSession();
        let liked = getFavorites().includes(poi.id);
        if (s) {
            try {
                const profile: any = await readProfile();
                liked = profile?.favorites?.includes(poi.id) || false;
            }
            catch { }
        }
        this.setData({ poi, liked });
        void track('content_view', { page: 'poi', objectType: 'poi', objectId: poi.id, contentVersion: c.version });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } }, station() { const id = this.data.poi?.nodeId; if (id)
        wx.navigateTo({ url: `/pages/station/index?id=${encodeURIComponent(id)}` }); }, nav() { const p = this.data.poi; if (p?.mapPoint?.crs === 'GCJ02')
        openPoiLocation(p.name, p.mapPoint.lat, p.mapPoint.lng);
    else
        wx.showToast({ title: '精确坐标尚未核验', icon: 'none' }); }, async fav() { const p = this.data.poi, s = readSession(); try {
        if (s) {
            const operation = this.data.liked ? 'remove' : 'add';
            await meAction(s.token, 'favorite', { id: p.id, operation });
            this.setData({ liked: !this.data.liked });
        }
        else {
            const ids = toggleFavorite(p.id);
            this.setData({ liked: ids.includes(p.id) });
        }
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } } });
