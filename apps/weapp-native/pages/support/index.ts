import { meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page({ data: { session: null as any, profile: null as any, categories: ['地点与图片', '站点与车辆', '会员权益', '活动', '隐私请求', '其他建议'], category: '地点与图片', description: '', privacy: false, error: '', note: '' }, async onShow() { const session = readSession(); this.setData({ session, error: '' }); if (session)
        try {
            this.setData({ profile: await readProfile() });
        }
        catch (e: any) {
            this.setData({ error: e.message });
        } }, login() { wx.navigateTo({ url: '/pages/login/index' }); }, cat(e: any) { this.setData({ category: this.data.categories[Number(e.detail.value)] || this.data.categories[0] }); }, desc(e: any) { this.setData({ description: e.detail.value }); }, privacy(e: any) { this.setData({ privacy: e.detail.value }); }, async submit() { const s = readSession(); if (!s) {
        this.login();
        return;
    } if (this.data.description.trim().length < 3) {
        this.setData({ error: '请填写至少3个字的问题说明' });
        return;
    } try {
        await meAction(s.token, this.data.privacy ? 'privacy' : 'ticket', { category: this.data.category, description: this.data.description });
        void track('support_submit', { page: 'support', properties: { privacy: this.data.privacy } });
        this.setData({ description: '', note: '问题已提交，可在此查看处理结果' });
        await this.onShow();
    }
    catch (e: any) {
        this.setData({ error: e.message });
    } } });
