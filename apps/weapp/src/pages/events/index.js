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
Page(common('events', {
    data: {
        active: 'me',
        session: null,
        events: [],
        profile: null,
        note: ''
    },
    populate(c) {
        this.setData({
            events: (c && c.events) || []
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
        async register(e) {
            const session = storage.getSession();
            if (!session) {
                this.login();
                return;
            }
            const id = e.currentTarget.dataset.id;
            if (!await confirmDialog('确认报名此免费活动？这不是公交预约。'))
                return;
            try {
                await api.meAction(session.token, 'register', {
                    id,
                    accepted: true
                });
                api.track('event_register', {
                    page: 'events',
                    objectType: 'event',
                    objectId: id
                });
                this.setData({
                    note: '活动报名已保存'
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
