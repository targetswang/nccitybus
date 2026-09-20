const api = require('./api');
const platform = require('./platform');
function common(page, options = {}) {
    const definition = {
        data: {
            loading: true,
            error: '',
            catalog: null,
            contentVersion: '',
            from: 'home',
            id: '',
            ...options.data
        },
        onLoad(query = {}) {
            this.setData({
                id: query.id || '',
                from: query.from || 'home'
            });
            this._query = query;
            this.load(false);
        },
        onShow() {
            const bar = this.getTabBar && this.getTabBar();
            if (bar)
                bar.setData({
                    active: page
                });
            if (options.afterShow)
                options.afterShow.call(this);
        },
        async load(force = true) {
            this.setData({
                loading: !this.data.catalog,
                error: ''
            });
            try {
                const catalog = await api.catalog(force);
                if (this._destroyed)
                    return;
                this.setData({
                    catalog,
                    contentVersion: catalog.version,
                    loading: false
                });
                if (options.populate)
                    await options.populate.call(this, catalog);
            }
            catch (e) {
                if (!this._destroyed)
                    this.setData({
                        error: e.message,
                        loading: false
                    });
            }
        },
        retry() {
            return this.load(true);
        },
        onPullDownRefresh() {
            this.load(true).finally(() => wx.stopPullDownRefresh());
        },
        onUnload() {
            this._destroyed = true;
        },
        open(e) {
            platform.openPage(e.currentTarget.dataset.page, e.currentTarget.dataset.id, page);
        },
        live() {
            wx.switchTab({
                url: '/pages/live/index'
            });
        },
        explore() {
            wx.switchTab({
                url: '/pages/explore/index'
            });
        },
        transit() {
            return platform.openTransitCode();
        },
        ...options.methods
    };
    return definition;
}
module.exports = {
    common
};

