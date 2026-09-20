const { common } = require('../../services/page-base');
const api = require('../../services/api');
const storage = require('../../services/storage');
Page(common('messages', {
    data: {
        active: 'me',
        session: null,
        profile: null
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
            if (!session) {
                this.setData({
                    profile: null
                });
                return;
            }
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
        async read(e) {
            const session = storage.getSession();
            if (!session)
                return;
            try {
                await api.meAction(session.token, 'readMessage', {
                    recordId: e.currentTarget.dataset.id
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
