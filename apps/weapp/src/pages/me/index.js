const { common } = require('../../services/page-base');
const api = require('../../services/api');
const storage = require('../../services/storage');
Page(common('me', {
    data: {
        session: null,
        loginAvailable: false,
        favoriteCount: 0
    },
    afterShow() {
        this.setData({
            session: storage.getSession(),
            favoriteCount: storage.getFavorites().length
        });
        api.capabilities().then(c => this.setData({
            loginAvailable: c.login.wechat
        })).catch(() => {
        });
    },
    methods: {
        login() {
            wx.login({
                success: async (r) => {
                    try {
                        if (!r.code)
                            throw new Error('未取得微信登录凭证');
                        const session = await api.request('/auth/wechat', {
                            method: 'POST',
                            data: {
                                code: r.code
                            }
                        });
                        storage.saveSession(session);
                        await storage.syncFavorites(this.data.catalog || await api.catalog());
                        this.setData({
                            session,
                            favoriteCount: storage.getFavorites().length
                        });
                    }
                    catch (e) {
                        wx.showModal({
                            title: '登录或同步失败',
                            content: e.message,
                            showCancel: false
                        });
                    }
                },
                fail: () => wx.showToast({
                    title: '微信登录未完成',
                    icon: 'none'
                })
            });
        },
        async logout() {
            const session = storage.getSession();
            if (session) {
                try {
                    await api.request('/auth/logout', {
                        method: 'POST',
                        token: session.token
                    });
                }
                catch {
                    wx.showToast({
                        title: '网络异常，本机已退出',
                        icon: 'none'
                    });
                }
            }
            storage.clearSession();
            this.setData({
                session: null
            });
        }
    }
}));

