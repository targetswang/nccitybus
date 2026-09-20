Component({
    properties: {
        active: {
            type: String,
            value: 'home'
        }
    },
    data: {
        tabs: [
            {
                page: 'home',
                label: '首页',
                icon: 'bus'
            },
            {
                page: 'live',
                label: '实时',
                icon: 'map'
            },
            {
                page: 'explore',
                label: '漫游',
                icon: 'explore'
            },
            {
                page: 'me',
                label: '我的',
                icon: 'user'
            }
        ]
    },
    methods: {
        go(e) {
            const page = e.currentTarget.dataset.page;
            if (page === this.properties.active && getCurrentPages().length === 1)
                return;
            wx.switchTab({
                url: '/pages/' + page + '/index',
                fail() {
                    wx.showToast({
                        title: '切换失败，请重试',
                        icon: 'none'
                    });
                }
            });
        }
    }
});

