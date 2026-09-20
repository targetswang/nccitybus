const { common } = require('../../services/page-base');
const core = require('../../shared/client-core');
const platform = require('../../services/platform');
const storage = require('../../services/storage');
Page(common('poi', {
    data: {
        active: 'explore',
        poi: null,
        nodeName: '',
        liked: false,
        canNavigate: false,
        syncError: ''
    },
    populate(c) {
        const p = core.findItem(c, 'pois', this.data.id), node = p ? core.findItem(c, 'nodes', p.nodeId) : null;
        this.setData({
            poi: p,
            nodeName: node?.name || '',
            liked: storage.getFavorites().includes(this.data.id),
            canNavigate: Boolean(core.navigationTarget(p))
        });
    },
    methods: {
        navigatePoi() {
            platform.navigatePoi(this.data.poi);
        },
        async favorite() {
            try {
                const result = await storage.toggleFavorite(this.data.id);
                this.setData({
                    liked: result.ids.includes(this.data.id),
                    syncError: result.syncError || ''
                });
            }
            catch {
                this.setData({
                    syncError: '本机存储失败，请检查设备空间。'
                });
            }
        }
    }
}));

