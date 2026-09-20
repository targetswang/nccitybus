import { retainPage } from '../../services/page-state';
import { displayTime } from '../../shared/client-core';
import { getContent, meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({ data: { busy: false, benefits: [] as any[], profile: null as any, session: null as any, error: '', note: '', id: '' }, onLoad(q: any) { this.setData({ id: q.id || '' }); }, async onShow() {
        if (this.data.id !== undefined)
            await this.refresh();
    }, async refresh() {
        const session = readSession();
        this.setData({ session, error: '' });
        try {
            const [c, p] = await Promise.all([getContent(), session ? readProfile() : Promise.resolve(null)]);
            this.setData({ benefits: (c.benefits || []).filter((b: any) => !this.data.id || b.id === this.data.id), profile: p ? { ...p, grants: p.grants.map((g: any) => ({ ...g, expiry: displayTime(g.expiresAt) })) } : null });
            if (this.data.id && !this.data.benefits.length)
                throw new Error('权益不存在或已下线');
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    }, login() { wx.navigateTo({ url: '/pages/login/index' }); }, async claim(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.claimAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async claimAction(e: any) {
        const s = readSession();
        if (!s) {
            this.login();
            return;
        }
        const id = e.currentTarget.dataset.id;
        if (!await confirm('确认按页面规则领取此权益？'))
            return;
        try {
            await meAction(s.token, 'claim', { id, accepted: true });
            void track('benefit_claim', { page: 'rights', objectType: 'benefit', objectId: id });
            this.setData({ note: '领取记录已保存；领取不等于已使用' });
            await this.refresh();
        }
        catch (err: any) {
            this.setData({ error: err.message });
        }
    }, async open(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.openAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async openAction(e: any) {
        const s = readSession();
        if (!s)
            return;
        try {
            const r = await meAction(s.token, 'openBenefit', { recordId: e.currentTarget.dataset.id });
            wx.showModal({ title: '使用说明', content: [r.fulfillment.provider, r.fulfillment.content, r.fulfillment.externalUrl || ''].filter(Boolean).join('\n'), showCancel: /^https:\/\//.test(r.fulfillment.externalUrl || ''), confirmText: /^https:\/\//.test(r.fulfillment.externalUrl || '') ? '复制链接' : '知道了', success: (res: any) => { if (res.confirm && /^https:\/\//.test(r.fulfillment.externalUrl || ''))
                    wx.setClipboardData({ data: r.fulfillment.externalUrl }); } });
        }
        catch (err: any) {
            this.setData({ error: err.message });
        }
    } }, "rights", [], 30000));
function confirm(content: string) { return new Promise<boolean>(resolve => wx.showModal({ title: '请确认', content, success: r => resolve(r.confirm), fail: () => resolve(false) })); }
