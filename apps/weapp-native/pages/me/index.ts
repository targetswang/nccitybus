import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { getFavorites } from '../../services/storage';
import { readProfile, readSession, logoutSession } from '../../services/session';
Page(retainPage({
    data: { stationCount: 0, anonymousCount: 0, session: null as any, profile: null as any, loading: false, error: '' },
    async onShow() { try {
        const c = await loadContent();
        this.setData({ stationCount: c.nodes.length, anonymousCount: getFavorites().length });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } const session = readSession(); this.setData({ session, loading: !!session, error: '' }); if (session) {
        try {
            this.setData({ profile: await readProfile() });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
        finally {
            this.setData({ loading: false });
        }
    }
    else
        this.setData({ profile: null }); },
    login() { wx.navigateTo({ url: '/pages/login/index' }); }, favorites() { wx.navigateTo({ url: '/pages/favorites/index' }); }, stations() { wx.navigateTo({ url: '/pages/stations/index' }); }, guide() { wx.navigateTo({ url: '/pages/guide/index' }); }, rights() { wx.navigateTo({ url: '/pages/rights/index' }); }, privacy() { wx.navigateTo({ url: '/pages/privacy/index' }); }, member() { wx.navigateTo({ url: '/pages/member/index' }); }, events() { wx.navigateTo({ url: '/pages/events/index' }); }, messages() { wx.navigateTo({ url: '/pages/messages/index' }); }, support() { wx.navigateTo({ url: '/pages/support/index' }); }, async logout() { try {
        await logoutSession();
        this.setData({ session: null, profile: null, error: '' });
    }
    catch (e: any) {
        this.setData({ error: e.message || '退出失败，请重试' });
    } }
}, "me", [], 300000));
