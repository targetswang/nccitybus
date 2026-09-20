import { track } from '../../services/api';
Component({
    properties: { poi: Object }, data: { failed: false },
    observers: { 'poi.cover'() { this.setData({ failed: false }); } },
    methods: { imageError() { this.setData({ failed: true }); }, open() { const p = (this.properties as any).poi; void track('content_view', { page: 'explore', objectType: 'poi', objectId: p.id }); wx.navigateTo({ url: `/pages/poi/index?id=${encodeURIComponent(p.id)}` }); } }
});
