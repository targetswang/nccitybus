import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { openTransitCode } from '../../services/transit';
Page(retainPage({ data: { guides: [] as any[], error: '' }, async onShow() {
        this.setData({ error: '' });
        try {
            const c = await loadContent();
            this.setData({ guides: c.guides || [] });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, transit() { openTransitCode(); } }, "guide", [], 300000));
