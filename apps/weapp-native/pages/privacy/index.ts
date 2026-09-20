import { loadContent } from '../../services/content';
Page({ data: { privacy: '', error: '' }, async onShow() { this.setData({ error: '' }); try {
        const c = await loadContent();
        this.setData({ privacy: c.privacy || '当前未提供补充隐私说明。' });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } } });
