const { common } = require('../../services/page-base');
const api = require('../../services/api');
const core = require('../../shared/client-core');
const storage = require('../../services/storage');
function confirmDialog(content) {
    return new Promise(resolve => wx.showModal({
        title: '请确认',
        content,
        success: r => resolve(r.confirm),
        fail: () => resolve(false)
    }));
}
Page(common('benefit', {
    data: {
        active: 'me',
        benefit: null,
        session: null,
        profile: null,
        grant: null,
        fulfillment: null,
        note: ''
    },
    populate(c) {
        this.setData({
            benefit: core.findItem(c, 'benefits', this.data.id)
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
                const grant = (profile.grants || []).find(g => g.benefitId === this.data.id) || null;
                this.setData({
                    profile,
                    grant
                });
            }
            catch (e) {
                this.setData({
                    error: e.message
                });
            }
        },
        async claim() {
            const session = storage.getSession();
            if (!session) {
                this.login();
                return;
            }
            const benefit = this.data.benefit;
            if (!benefit)
                return;
            if (!await confirmDialog('确认领取此权益？'))
                return;
            try {
                await api.meAction(session.token, 'claim', {
                    id: benefit.id,
                    accepted: true
                });
                api.track('benefit_claim', {
                    page: 'benefit',
                    objectType: 'benefit',
                    objectId: benefit.id
                });
                this.setData({
                    note: '领取记录已保存；领取不等于已使用'
                });
                await this.refreshProfile();
            }
            catch (error) {
                this.setData({
                    error: error.message
                });
            }
        },
        async open() {
            const session = storage.getSession();
            const grant = this.data.grant;
            if (!session || !grant)
                return;
            try {
                const result = await api.meAction(session.token, 'openBenefit', {
                    recordId: grant.id
                });
                this.setData({
                    fulfillment: result.fulfillment,
                    note: '使用说明已读取；不代表已经核销'
                });
            }
            catch (error) {
                this.setData({
                    error: error.message
                });
            }
        }
    }
}));
