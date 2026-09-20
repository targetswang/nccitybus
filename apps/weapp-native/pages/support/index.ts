import { retainPage } from '../../services/page-state';
import { displayTime } from '../../shared/client-core';
import { meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({ data: { busy: false, session: null as any, profile: null as any, categories: ['地点与图片', '站点与车辆', '会员权益', '活动', '隐私请求', '其他建议'], category: '地点与图片', description: '', privacy: false, error: '', note: '' }, async onShow() {
        const session = readSession();
        this.setData({ session, error: '' });
        if (session)
            try {
                this.setData({ profile: await readProfile().then((p: any) => ({ ...p, tickets: p.tickets.map((t: any) => ({ ...t, time: displayTime(t.updatedAt || t.createdAt) })), privacyRequests: p.privacyRequests.map((t: any) => ({ ...t, time: displayTime(t.updatedAt || t.createdAt) })) })) });
            }
            catch (e: any) {
                this.setData({ error: e.message });
            }
    }, login() { wx.navigateTo({ url: '/pages/login/index' }); }, cat(e: any) { this.setData({ category: this.data.categories[Number(e.detail.value)] || this.data.categories[0] }); }, desc(e: any) { this.setData({ description: e.detail.value }); }, privacy(e: any) { this.setData({ privacy: e.detail.value }); }, async submit(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.submitAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async submitAction() {
        const s = readSession();
        if (!s) {
            this.login();
            return;
        }
        if (this.data.description.trim().length < 3) {
            this.setData({ error: '请填写至少3个字的问题说明' });
            return;
        }
        try {
            await meAction(s.token, this.data.privacy ? 'privacy' : 'ticket', { category: this.data.category, description: this.data.description });
            void track('support_submit', { page: 'support', properties: { privacy: this.data.privacy } });
            this.setData({ description: '', note: '问题已提交，可在此查看处理结果' });
            await this.refreshPage();
        }
        catch (e: any) {
            this.setData({ error: e.message });
        }
    } }, "support", [], 300000));
