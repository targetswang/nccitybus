const { common } = require('../../services/page-base');
Page(common('walks', {
    data: {
        active: 'explore',
        walks: []
    },
    populate(c) {
        this.setData({
            walks: c.walks.map(w => ({
                ...w,
                cover: (c.pois.find(p => p.id === w.coverPoiId) || {}).cover || ''
            }))
        });
    }
}));

