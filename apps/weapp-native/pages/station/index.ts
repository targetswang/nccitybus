import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { getTransit } from '../../services/api';
import { stationMatches, navigationTarget } from '../../shared/client-core';
Page(retainPage({ data: { station: null as any, index: 0, pois: [] as any[], stops: [] as any[], error: '', transitError: '' },
    query: {} as any, onLoad(q: any) { this.query = q; }, async onShow() {
        const q = this.query;
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            const i = (c.nodes || []).findIndex((x: any) => x.id === q.id);
            if (i < 0) {
                this.setData({ station: null, stops: [] });
                throw new Error('站点不存在或已下线');
            }
            this.setData({ station: c.nodes[i], index: i, pois: (c.pois || []).filter((p: any) => p.nodeId === q.id) });
            try {
                const s = await getTransit(c.routeId || 'jialing-loop');
                this.setData({ transitError: '', stops: stationMatches(s, q.id).map(s => ({ ...s, canNavigate: !!navigationTarget(s) })) });
            }
            catch (e: any) {
                this.setData({ transitError: e.message });
            }
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    },
    nav(e: any) {
        const target = navigationTarget(this.data.stops[Number(e.currentTarget.dataset.index)]);
        if (target)
            wx.openLocation({ ...target, scale: 16 });
    },
    live() { wx.reLaunch({ url: '/pages/live/index' }); }
}, "station", [], 10000));
