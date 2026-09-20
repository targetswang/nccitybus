import { retainPage } from '../../services/page-state';
import { displayTime } from '../../shared/client-core';
import { getContent, meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({
    data: { busy: false, plans: [] as any[], profile: null as any, session: null as any, loading: true, error: '', note: '' },
    async onShow() {
        const session = readSession();
        this.setData({ session, loading: true, error: '' });
        try {
            const [content, profile] = await Promise.all([getContent(), session ? readProfile() : Promise.resolve(null)]);
            this.setData({ plans: (content.membershipPlans || []).map((p: any) => { const m = profile?.memberships?.find((m: any) => m.planId === p.id && m.status === 'active' && (!m.expiresAt || m.expiresAt > Date.now())); return { ...p, membership: m, expiry: displayTime(m?.expiresAt) }; }), profile });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    async leave(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.leaveAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async leaveAction(e: any) {
        const s = readSession();
        if (!s)
            return this.login();
        if (!await confirm('确认退出该会员方案？'))
            return;
        try {
            await meAction(s.token, 'leaveMembership', { recordId: e.currentTarget.dataset.id, confirmed: true });
            await this.refreshPage();
            this.setData({ note: '退出已保存' });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    },
    login() { wx.navigateTo({ url: '/pages/login/index' }); },
    async join(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.joinAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async joinAction(e: any) {
        const session = readSession();
        if (!session) {
            this.login();
            return;
        }
        const id = e.currentTarget.dataset.id;
        if (!await confirm('确认自愿加入该免费会员方案并同意规则？'))
            return;
        try {
            await meAction(session.token, 'join', { id, accepted: true });
            void track('member_join', { page: 'member', objectType: 'membershipPlan', objectId: id });
            this.setData({ note: '会员记录已保存' });
            await this.refreshPage();
        }
        catch (err: any) {
            this.setData({ error: err.message });
        }
    }
}, "member", [], 30000));
function confirm(content: string) { return new Promise<boolean>(resolve => wx.showModal({ title: '请确认', content, success: r => resolve(r.confirm), fail: () => resolve(false) })); }
