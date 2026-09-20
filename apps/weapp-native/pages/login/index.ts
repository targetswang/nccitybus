import { challenge, verify, wechatPhoneLogin, track } from '../../services/api';
import { saveSession } from '../../services/session';
Page({
    data: { phone: '', code: '', challenge: null as any, busy: false, error: '', agreed: false },
    changePhone(e: any) { this.setData({ phone: e.detail.value, challenge: null, error: '' }); },
    changeCode(e: any) { this.setData({ code: e.detail.value }); },
    toggleAgree(e: any) { this.setData({ agreed: e.detail.value.length > 0 }); },
    async getCode() { this.setData({ busy: true, error: '' }); try {
        const c = await challenge(this.data.phone, 'user');
        this.setData({ challenge: c });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    }
    finally {
        this.setData({ busy: false });
    } },
    async submit() { if (!this.data.agreed || !this.data.challenge) {
        this.setData({ error: '请先获取验证码并同意登录说明' });
        return;
    } this.setData({ busy: true, error: '' }); try {
        const s = await verify({ challengeId: this.data.challenge.challengeId, phoneHash: this.data.challenge.phoneHash, code: this.data.code });
        saveSession(s);
        void track('login_success', { page: 'login', properties: { mode: this.data.challenge.mode } });
        wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/me/index' }) });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    }
    finally {
        this.setData({ busy: false });
    } },
    async phoneLogin(e: any) { const phoneCode = e.detail?.code; if (!phoneCode) {
        this.setData({ error: '未授权手机号' });
        return;
    } this.setData({ busy: true, error: '' }); try {
        const login = await new Promise<string>((resolve, reject) => wx.login({ success: r => r.code ? resolve(r.code) : reject(new Error('微信登录凭证为空')), fail: reject }));
        const s = await wechatPhoneLogin(phoneCode, login);
        saveSession(s);
        wx.reLaunch({ url: '/pages/me/index' });
    }
    catch (e: any) {
        this.setData({ error: e.message || '微信手机号能力尚未配置' });
    }
    finally {
        this.setData({ busy: false });
    } }
});
