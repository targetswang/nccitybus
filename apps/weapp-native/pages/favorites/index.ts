import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { getFavorites } from '../../services/storage';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({ data: { missing: 0, pois: [] as any[], error: '' }, async onShow() { try {
        const c = await loadContent();
        const s = readSession();
        let ids = getFavorites();
        if (s) {
            const p = await readProfile();
            ids = p?.favorites || [];
        }
        this.setData({ error: '', missing: ids.filter((id: string) => !(c.pois || []).some((p: any) => p.id === id)).length, pois: (c.pois || []).filter((x: any) => ids.includes(x.id)) });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } } }, "favorites", [], 300000));
