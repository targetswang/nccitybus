const { common } = require('../../services/page-base');
const api = require('../../services/api');
const storage = require('../../services/storage');
function confirmDialog(content) {
    return new Promise(resolve => wx.showModal({
        title: '请确认',
        content,
        success: r => resolve(r.confirm),
        fail: () => resolve(false)
    }));
}
Page(common('member', {
    data: {
        active: 'me',
        session: null,
        plans: [],
        profile: null,
        note: ''
    },
    populate(c) {
        this.setData({
            plans: (c && c.membershipPlans) || []
        });
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
        async join(e) {
            const session = storage.getSession();
            if (!session) {
                this.login();
                return;
            }
            const id = e.currentTarget.dataset.id;
            if (!await confirmDialog('确认自愿加入该免费会员方案并同意规则？'))
                return;
            try {
                await api.meAction(session.token, 'join', {
                    id,
                    accepted: true
                });
                api.track('member_join', {
                    page: 'member',
                    objectType: 'membershipPlan',
                    objectId: id
                });
                this.setData({
                    note: '会员记录已保存'
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
