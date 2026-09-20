import { retainPage } from '../../services/page-state';
import { getContent, meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({
    data: { busy: false, events: [] as any[], profile: null as any, session: null as any, loading: true, error: '', note: '' },
    eventId: '',
    onLoad(q: any) { this.eventId = q.id || ''; },
    async onShow() {
        const session = readSession();
        this.setData({ session, loading: true, error: '' });
        try {
            const [content, profile] = await Promise.all([getContent(), session ? readProfile() : Promise.resolve(null)]);
            const events = (content.events || []).filter((e: any) => !this.eventId || e.id === this.eventId);
            this.setData({ events, profile });
            if (this.eventId && !events.length)
                throw new Error('活动不存在或已下线');
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    async cancel(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.cancelAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async cancelAction(e: any) {
        const s = readSession();
        if (!s)
            return this.login();
        if (!await confirm('确认取消报名？'))
            return;
        try {
            await meAction(s.token, 'cancelRegistration', { recordId: e.currentTarget.dataset.id, confirmed: true });
            await this.refreshPage();
            this.setData({ note: '取消记录已保存' });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    },
    login() { wx.navigateTo({ url: '/pages/login/index' }); },
    async register(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.registerAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async registerAction(e: any) {
        const session = readSession();
        if (!session) {
            this.login();
            return;
        }
        const id = e.currentTarget.dataset.id;
        if (!await confirm('确认报名此免费活动？这不是公交预约。'))
            return;
        try {
            await meAction(session.token, 'register', { id, accepted: true });
            void track('event_register', { page: 'events', objectType: 'event', objectId: id });
            this.setData({ note: '活动报名已保存' });
            await this.refreshPage();
        }
        catch (err: any) {
            this.setData({ error: err.message });
        }
    }
}, "events", [], 30000));
function confirm(content: string) { return new Promise<boolean>(resolve => wx.showModal({ title: '请确认', content, success: r => resolve(r.confirm), fail: () => resolve(false) })); }
