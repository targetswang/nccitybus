const { common } = require('../../services/page-base');
const api = require('../../services/api');
const core = require('../../shared/client-core');
const platform = require('../../services/platform');
Page(common('station', {
    data: {
        node: null,
        pois: [],
        official: [],
        active: 'home'
    },
    async populate(c) {
        const node = core.findItem(c, 'nodes', this.data.id);
        this.setData({
            node,
            pois: node ? c.pois.filter(p => p.nodeId === node.id) : [],
            active: this.data.from
        });
        if (!node)
            return;
        try {
            const live = await api.request('/transit/live?routeId=' + c.routeId);
            this.setData({
                official: core.stationMatches(live, node.id).map(s => ({
                    ...s,
                    canNavigate: core.isMapPoint(s.mapPoint)
                }))
            });
        }
        catch {
            this.setData({
                official: []
            });
        }
    },
    methods: {
        navigateStation(e) {
            platform.navigatePoi(this.data.official[e.currentTarget.dataset.index]);
        }
    }
}));

