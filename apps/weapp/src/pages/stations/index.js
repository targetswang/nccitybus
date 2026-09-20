const { common } = require('../../services/page-base');
Page(common('stations', {
    data: {
        active: 'home'
    },
    populate() {
        this.setData({
            active: this.data.from
        });
    }
}));

