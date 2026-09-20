import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
Page(retainPage({ data: { catalog: null as any, walks: [] as any[], error: '' }, async onShow() {
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            this.setData({ catalog: c, walks: c.walks || [] });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    } }, "walks", [], 300000));
