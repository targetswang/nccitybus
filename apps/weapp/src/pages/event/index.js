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
Page(common('event', {
    data: {
        active: 'me',
        event: null,
        session: null,
        profile: null,
        registration: null,
        note: ''
    },
    populate(c) {
        this.setData({
            event: core.findItem(c, 'events', this.data.id)
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
                const registration = (profile.registrations || []).find(r => r.eventId === this.data.id) || null;
                this.setData({
                    profile,
                    registration
                });
            }
            catch (e) {
                this.setData({
                    error: e.message
                });
            }
        },
        async register() {
            const session = storage.getSession();
            if (!session) {
                this.login();
                return;
            }
            const event = this.data.event;
            if (!event)
                return;
            if (!await confirmDialog('确认报名此免费活动？这不是公交预约。'))
                return;
            try {
                await api.meAction(session.token, 'register', {
                    id: event.id,
                    accepted: true
                });
                api.track('event_register', {
                    page: 'event',
                    objectType: 'event',
                    objectId: event.id
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
        },
        async cancel() {
            const session = storage.getSession();
            const registration = this.data.registration;
            if (!session || !registration)
                return;
            if (!await confirmDialog('确认取消报名？'))
                return;
            try {
                await api.meAction(session.token, 'cancelRegistration', {
                    recordId: registration.id,
                    confirmed: true
                });
                this.setData({
                    note: '取消记录已保存'
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
