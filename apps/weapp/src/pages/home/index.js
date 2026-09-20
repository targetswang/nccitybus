const { common } = require('../../services/page-base');
Page(common('home', {
    data: {
        mode: 'walks',
        walks: [],
        pois: [],
        routeLine: ''
    },
    populate(c) {
        this.setData({
            walks: c.walks.map(w => ({
                ...w,
                cover: (c.pois.find(p => p.id === w.coverPoiId) || {}).cover || ''
            })),
            pois: c.pois.slice(0, 5),
            routeLine: c.nodes.map(n => n.name.replace(/站$/, '')).join(' → ')
        });
    },
    methods: {
        modeChange(e) {
            this.setData({
                mode: e.currentTarget.dataset.mode
            });
            getApp().globalData.discoverMode = this.data.mode;
        },
        explore() {
            getApp().globalData.discoverMode = this.data.mode;
            wx.switchTab({
                url: '/pages/explore/index'
            });
        }
    }
}));

