const api = require('../../services/api');
const storage = require('../../services/storage');
Page({
    data: {
        phone: '',
        code: '',
        challenge: null,
        busy: false,
        error: '',
        agreed: false
    },
    changePhone(e) {
        this.setData({
            phone: e.detail.value,
            challenge: null,
            error: ''
        });
    },
    changeCode(e) {
        this.setData({
            code: e.detail.value
        });
    },
    toggleAgree(e) {
        this.setData({
            agreed: e.detail.value.length > 0
        });
    },
    async getCode() {
        this.setData({
            busy: true,
            error: ''
        });
        try {
            const challenge = await api.challenge(this.data.phone, 'user');
            this.setData({
                challenge
            });
        }
        catch (e) {
            this.setData({
                error: e.message
            });
        }
        finally {
            this.setData({
                busy: false
            });
        }
    },
    backToMe() {
        wx.navigateBack({
            fail: () => wx.switchTab({
                url: '/pages/me/index'
            })
        });
    },
    async submit() {
        if (!this.data.agreed || !this.data.challenge) {
            this.setData({
                error: '请先获取测试码并确认测试身份说明'
            });
            return;
        }
        this.setData({
            busy: true,
            error: ''
        });
        try {
            const session = await api.verify({
                challengeId: this.data.challenge.challengeId,
                phoneHash: this.data.challenge.phoneHash,
                code: this.data.code,
                clientType: 'weapp'
            });
            storage.saveSession(session);
            api.track('login_success', { page: 'login', properties: { mode: 'test' } });
            this.backToMe();
        }
        catch (e) {
            this.setData({
                error: e.message
            });
        }
        finally {
            this.setData({
                busy: false
            });
        }
    },
    async phoneLogin(e) {
        const phoneCode = e.detail && e.detail.code;
        if (!phoneCode) {
            this.setData({
                error: '未授权手机号'
            });
            return;
        }
        this.setData({
            busy: true,
            error: ''
        });
        try {
            const loginCode = await new Promise((resolve, reject) => wx.login({
                success: r => r.code ? resolve(r.code) : reject(new Error('微信登录凭证为空')),
                fail: reject
            }));
            const session = await api.wechatPhoneLogin(phoneCode, loginCode);
            storage.saveSession(session);
            this.backToMe();
        }
        catch (e) {
            this.setData({
                error: e.message || '微信手机号能力尚未配置'
            });
        }
        finally {
            this.setData({
                busy: false
            });
        }
    }
});
