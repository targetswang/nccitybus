const api = require('../../services/api');
const platform = require('../../services/platform');
const core = require('../../shared/client-core');
Page({
    data: {
        loading: true,
        error: '',
        layer: 'vehicles',
        snapshot: null,
        catalog: null,
        routeId: 'jialing-loop',
        routeIndex: 0,
        routes: [],
        layers: [
            {
                key: 'vehicles',
                label: '车辆'
            },
            {
                key: 'stations',
                label: '站点'
            },
            {
                key: 'sights',
                label: '景点'
            },
            {
                key: 'food',
                label: '美食'
            },
            {
                key: 'shopping',
                label: '商业'
            }
        ],
        statusText: '正在读取公交信息',
        items: [],
        markers: [],
        polylines: [],
        center: {
            latitude: 0,
            longitude: 0
        },
        hasGeometry: false,
        showLocation: false
    },
    onLoad() {
        api.catalog().then(c => {
            this.setData({
                catalog: c
            });
            this.rebuild();
        }).catch(() => {
        });
        api.capabilities().then(c => this.setData({
            routes: c.routes || []
        })).catch(() => {
        });
    },
    onShow() {
        this.hidden = false;
        const bar = this.getTabBar && this.getTabBar();
        if (bar)
            bar.setData({
                active: 'live'
            });
        this.refresh();
    },
    onHide() {
        this.hidden = true;
        this.generation = (this.generation || 0) + 1;
        clearTimeout(this.timer);
    },
    onUnload() {
        this.hidden = true;
        this.destroyed = true;
        clearTimeout(this.timer);
    },
    async refresh() {
        if (this.destroyed || this.hidden)
            return;
        clearTimeout(this.timer);
        const routeId = this.data.routeId;
        const generation = (this.generation || 0) + 1;
        this.generation = generation;
        this.fetching = true;
        try {
            const snapshot = await api.request('/transit/live?routeId=' + encodeURIComponent(routeId));
            if (!this.destroyed && generation === this.generation)
                this.setData({
                    snapshot,
                    error: '',
                    loading: false,
                    statusText: core.transitMessage(snapshot)
                });
        }
        catch (e) {
            if (!this.destroyed && generation === this.generation)
                this.setData({
                    error: e.message,
                    loading: false,
                    statusText: core.transitMessage(this.data.snapshot, true)
                });
        }
        finally {
            if (generation === this.generation) {
                this.fetching = false;
                if (!this.destroyed)
                    this.rebuild();
                if (!this.hidden && !this.destroyed)
                    this.timer = setTimeout(() => this.refresh(), 10000);
            }
        }
    },
    retry() {
        this.refresh();
    },
    onPullDownRefresh() {
        this.refresh().finally(() => wx.stopPullDownRefresh());
    },
    rebuild() {
        const scene = core.mapScene(this.data.layer, this.data.snapshot, this.data.catalog);
        this.scene = scene;
        const markers = scene.markers.map(m => ({
            id: m.id,
            latitude: m.point.lat,
            longitude: m.point.lng,
            iconPath: '/assets/' + (m.kind === 'vehicle' ? 'bus' : 'pin') + '.png',
            width: 30,
            height: 30,
            alpha: m.stale ? 0.5 : 1,
            callout: {
                content: m.name,
                display: 'BYCLICK',
                padding: 8,
                borderRadius: 8
            }
        }));
        const polylines = scene.polylines.map(l => ({
            points: l.points.map(p => ({
                latitude: p.lat,
                longitude: p.lng
            })),
            color: '#28745e',
            width: 5
        }));
        const first = scene.markers[0]?.point || scene.polylines[0]?.points[0];
        const shouldCenter = first && !this.centered;
        const center = shouldCenter ? {
            latitude: first.lat,
            longitude: first.lng
        } : this.data.center;
        if (first)
            this.centered = true;
        this.setData({
            markers,
            polylines,
            items: scene.items,
            hasGeometry: scene.hasGeometry || this.data.showLocation,
            center
        });
    },
    layerChange(e) {
        this.setData({
            layer: e.currentTarget.dataset.layer
        });
        this.rebuild();
    },
    routeChange(e) {
        const index = Number(e.detail.value);
        this.centered = false;
        this.setData({
            routeIndex: index,
            routeId: this.data.routes[index].id,
            snapshot: null
        });
        this.refresh();
    },
    markerTap(e) {
        const m = this.scene.markers.find(x => x.id === e.detail.markerId);
        if (m)
            this.select(m);
    },
    itemTap(e) {
        this.select(this.data.items[e.currentTarget.dataset.index]);
    },
    select(item) {
        if (item.kind === 'poi')
            platform.openPage('poi', item.entityId || item.id, 'live');
        else if (item.kind === 'station' && item.tourismNodeId)
            platform.openPage('station', item.tourismNodeId, 'live');
    },
    stations() {
        platform.openPage('stations', null, 'live');
    },
    locate() {
        wx.getLocation({
            type: 'gcj02',
            success: p => this.setData({
                showLocation: true,
                hasGeometry: true,
                center: {
                    latitude: p.latitude,
                    longitude: p.longitude
                }
            }),
            fail: () => wx.showModal({
                title: '未获取位置',
                content: '定位没有授权或暂不可用；仍可查看线路和地点列表。',
                showCancel: false
            })
        });
    }
});

