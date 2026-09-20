import { retainPage } from '../../services/page-state';
import { loadContent } from '../../services/content';
import { getTransit, getCapabilities, track } from '../../services/api';
import { openTransitCode } from '../../services/transit';
import { mapScene, transitMessage } from '../../shared/client-core';
Page(retainPage({
    data: { catalog: null as any, snapshot: null as any, routeId: 'jialing-loop', routes: [] as any[], routeIndex: 0, layer: 'vehicles', layers: [{ key: 'vehicles', label: '车辆' }, { key: 'stations', label: '站点' }, { key: 'sights', label: '景点' }, { key: 'food', label: '美食' }, { key: 'shopping', label: '商业' }], mapLat: 30.777329, mapLng: 106.083909, scale: 13, mapPositioned: false, markers: [] as any[], polyline: [] as any[], items: [] as any[], message: '正在读取公交信息', error: '' },
    timer: null as any, visible: false, generation: 0,
    onShow() { this.visible = true; void this.refresh(); this.timer = setInterval(() => { void this.refresh(); }, 10000); },
    onHide() { this.stop(); }, onUnload() { this.stop(); },
    stop() { this.visible = false; this.generation++; clearInterval(this.timer); this.pendingRoute = null; },
    async onPullDownRefresh() {
        try {
            await this.refresh();
        }
        finally {
            wx.stopPullDownRefresh();
        }
    },
    async refresh() {
        if (this.pendingRoute === this.data.routeId)
            return;
        this.pendingRoute = this.data.routeId;
        const generation = ++this.generation;
        try {
            const [catalog, snapshot, capabilities] = await Promise.all([loadContent(), getTransit(this.data.routeId), getCapabilities()]);
            if (!this.visible || generation !== this.generation)
                return;
            this.setData({ catalog, snapshot, routes: capabilities.routes || [], error: '', message: transitMessage(snapshot) });
            this.build(this.data.layer);
        }
        catch (e: any) {
            if (this.visible && generation === this.generation)
                this.setData({ error: e.message, message: transitMessage(null, true), markers: [], polyline: [], items: [] });
        }
        finally {
            if (generation === this.generation)
                this.pendingRoute = null;
        }
    },
    routeChange(e: any) {
        const index = Number(e.detail.value), route = this.data.routes[index];
        if (!route)
            return;
        this.setData({ routeId: route.id, routeIndex: index, snapshot: null, markers: [], polyline: [], items: [] });
        void this.refresh();
    },
    switchLayer(e: any) { const layer = e.currentTarget.dataset.key; this.setData({ layer }); this.build(layer); },
    build(layer: string) {
        const scene = mapScene(layer, this.data.snapshot, this.data.catalog);
        const markers = scene.markers.map((m: any) => ({ id: m.id, latitude: m.point.lat, longitude: m.point.lng, title: m.name, width: 28, height: 28, alpha: m.stale ? 0.5 : 1 }));
        const polyline = scene.polylines.map((p: any) => ({ points: p.points.map((p: any) => ({ latitude: p.lat, longitude: p.lng })), color: '#28745e', width: 5 }));
        this.setData({ markers, polyline, items: scene.items, ...(!this.data.mapPositioned && markers[0] ? { mapLat: markers[0].latitude, mapLng: markers[0].longitude, mapPositioned: true } : {}) });
    },
    stationsPage() { wx.navigateTo({ url: '/pages/stations/index' }); },
    transit() { void track('transit_code_click', { page: 'live' }); openTransitCode(); },
    regionChange(e: any) { if ((e.detail?.type || e.type) === 'end' && (e.detail?.causedBy || e.causedBy) === 'gesture') {
        const map = wx.createMapContext('live-map', this);
        map.getCenterLocation({ success: (p: any) => this.setData({ mapLat: p.latitude, mapLng: p.longitude, mapPositioned: true }) });
        map.getScale({ success: (p: any) => this.setData({ scale: p.scale }) });
    } },
    markerTap(e: any) { const scene = mapScene(this.data.layer, this.data.snapshot, this.data.catalog); const m = scene.markers.find((m: any) => m.id === Number(e.detail.markerId)); if (m)
        this.openItem({ currentTarget: { dataset: { id: m.entityId } } }); },
    openItem(e: any) {
        const item = this.data.items.find((i: any) => i.id === e.currentTarget.dataset.id);
        if (!item)
            return;
        if (item.kind === 'station') {
            if (item.tourismNodeId)
                wx.navigateTo({ url: `/pages/station/index?id=${encodeURIComponent(item.tourismNodeId)}` });
            else
                wx.showToast({ title: '该公交站暂无漫游内容', icon: 'none' });
        }
        else if (item.kind === 'poi')
            wx.navigateTo({ url: `/pages/poi/index?id=${encodeURIComponent(item.id)}` });
    }
}, "live", ["layer", "routeId", "routeIndex", "mapLat", "mapLng", "scale", "mapPositioned"], 0));
