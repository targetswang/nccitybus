const { common } = require('../../services/page-base');
const storage = require('../../services/storage');
Page(common('favorites', {
    data: {
        active: 'me',
        pois: [],
        missingCount: 0
    },
    populate(c) {
        this.apply(c);
    },
    afterShow() {
        if (this.data.catalog)
            this.apply(this.data.catalog);
    },
    methods: {
        apply(c) {
            const ids = storage.getFavorites();
            this.setData({
                pois: c.pois.filter(p => ids.includes(p.id)),
                missingCount: ids.filter(id => !c.pois.some(p => p.id === id)).length
            });
        }
    }
}));

