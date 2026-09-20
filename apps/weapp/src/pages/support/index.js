const { common } = require('../../services/page-base');
const api = require('../../services/api');
const storage = require('../../services/storage');
Page(common('support', {
    data: {
        active: 'me',
        session: null,
        profile: null,
        categories: ['地点与图片', '站点与车辆', '会员权益', '活动', '隐私请求', '其他建议'],
        category: '地点与图片',
        description: '',
        privacy: false,
        note: ''
    },
    afterShow() {
        this.setData({
            session: storage.getSession()
        });
        this.refreshProfile();
    },
    methods: {
        login() {
            wx.navigateTo({
                url: '/pages/login/index'
            });
        },
        cat(e) {
            this.setData({
                category: e.detail.value
            });
        },
        desc(e) {
            this.setData({
                description: e.detail.value
            });
        },
        privacyToggle(e) {
            this.setData({
                privacy: e.detail.value
            });
        },
        async refreshProfile() {
            const session = storage.getSession();
            this.setData({
                session
            });
            if (!session)
                return;
            try {
                const profile = await storage.readProfile();
                this.setData({
                    profile
                });
            }
            catch (e) {
                this.setData({
                    error: e.message
                });
            }
        },
        async submit() {
            const session = storage.getSession();
            if (!session) {
                this.login();
                return;
            }
            if (this.data.description.trim().length < 3) {
                this.setData({
                    error: '请填写至少3个字的问题说明'
                });
                return;
            }
            try {
                await api.meAction(session.token, this.data.privacy ? 'privacy' : 'ticket', {
                    category: this.data.category,
                    description: this.data.description
                });
                api.track('support_submit', {
                    page: 'support',
                    properties: {
                        privacy: this.data.privacy
                    }
                });
                this.setData({
                    description: '',
                    note: '问题已提交，可在此查看处理结果'
                });
                await this.refreshProfile();
            }
            catch (error) {
                this.setData({
                    error: error.message
                });
            }
        }
    }
}));
