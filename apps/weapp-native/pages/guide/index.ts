import { loadContent } from '../../services/content';
import { openTransitCode } from '../../services/transit';
Page({ data: { guides: [] as any[], error: '' }, async onShow() { this.setData({ error: '' }); try {
        const c = await loadContent();
        this.setData({ guides: c.guides || [] });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } }, transit() { openTransitCode(); } });
