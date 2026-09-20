const { common } = require('../../services/page-base');
const { filterPois } = require('../../shared/client-core');
Page(common('explore', {
    data: {
        mode: 'walks',
        category: '全部',
        nodeIndex: 0,
        nodeOptions: [],
        pois: [],
        walks: [],
        categories: [
            '全部',
            '吃什么',
            '喝什么',
            '看什么',
            '玩什么',
            '休息'
        ]
    },
    afterShow() {
        const mode = getApp().globalData.discoverMode;
        if (mode)
            this.setData({
                mode
            });
    },
    populate(c) {
        this.setData({
            walks: c.walks.map(w => ({
                ...w,
                cover: (c.pois.find(p => p.id === w.coverPoiId) || {}).cover || ''
            })),
            nodeOptions: [
                {
                    id: 'all',
                    name: '全部站点'
                },
                ...c.nodes
            ]
        });
        this.applyFilter();
    },
    methods: {
        applyFilter() {
            const opt = this.data.nodeOptions[this.data.nodeIndex] || {
                id: 'all'
            };
            this.setData({
                pois: filterPois(this.data.catalog, this.data.category, opt.id)
            });
        },
        modeChange(e) {
            this.setData({
                mode: e.currentTarget.dataset.mode
            });
            getApp().globalData.discoverMode = this.data.mode;
        },
        categoryChange(e) {
            this.setData({
                category: e.currentTarget.dataset.value
            });
            this.applyFilter();
        },
        nodeChange(e) {
            this.setData({
                nodeIndex: Number(e.detail.value)
            });
            this.applyFilter();
        }
    }
}));

