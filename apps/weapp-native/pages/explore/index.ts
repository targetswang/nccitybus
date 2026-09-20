import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
Page(retainPage({ data: { catalog: null as any, mode: 'walks', walks: [] as any[], pois: [] as any[], stationOptions: [] as any[], categories: ['全部', '吃什么', '喝什么', '看什么', '玩什么', '休息'], stationIndex: 0, stationName: '全部站点', category: '全部', nodeId: 'all', error: '' }, async onShow() {
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            this.setData({ catalog: c, walks: c.walks || [], pois: c.pois || [], stationOptions: [{ id: 'all', name: '全部站点' }, ...(c.nodes || [])] });
            this.apply(this.data.category, this.data.nodeId);
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, switchMode(e: any) { this.setData({ mode: e.currentTarget.dataset.mode }); }, filter(e: any) { this.apply(e.currentTarget.dataset.cat, this.data.nodeId); }, station(e: any) { const index = Number(e.detail.value); const id = this.data.stationOptions?.[index]?.id || 'all'; this.apply(this.data.category, id); }, apply(category: string, nodeId: string) { const c = this.data.catalog; this.setData({ category, nodeId, stationIndex: Math.max(0, this.data.stationOptions.findIndex((n: any) => n.id === nodeId)), stationName: this.data.stationOptions.find((n: any) => n.id === nodeId)?.name || '全部站点', pois: (c?.pois || []).filter((p: any) => (category === '全部' || p.category === category) && (nodeId === 'all' || p.nodeId === nodeId)) }); } }, "explore", ["mode", "category", "nodeId"], 300000));
