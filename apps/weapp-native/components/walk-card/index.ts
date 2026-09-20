import { track } from '../../services/api';
Component({ properties: { walk: Object }, methods: { open() { const w = (this.properties as any).walk; void track('content_view', { page: 'explore', objectType: 'walk', objectId: w.id }); wx.navigateTo({ url: `/pages/walk/index?id=${encodeURIComponent(w.id)}` }); } } });
