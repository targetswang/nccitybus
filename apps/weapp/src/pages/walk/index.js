const { common } = require('../../services/page-base');
const core = require('../../shared/client-core');
const platform = require('../../services/platform');
Page(common('walk', {
    data: {
        active: 'explore',
        walk: null,
        cover: '',
        steps: []
    },
    populate(c) {
        const w = core.findItem(c, 'walks', this.data.id);
        if (!w)
            return this.setData({
                walk: null
            });
        const cover = core.findItem(c, 'pois', w.coverPoiId);
        this.setData({
            walk: w,
            cover: cover?.cover || '',
            steps: w.steps.map((s, i) => {
                const p = core.findItem(c, 'pois', s.poiId);
                return {
                    ...s,
                    key: w.id + '-' + i,
                    poi: p,
                    cover: p?.cover || '',
                    canNavigate: Boolean(core.navigationTarget(p))
                };
            })
        });
    },
    methods: {
        navigateStep(e) {
            platform.navigatePoi(this.data.steps[e.currentTarget.dataset.index].poi);
        }
    }
}));

