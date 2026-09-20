import { isMapPoint } from '../shared/client-core';
export function openPoiLocation(name: string, lat?: number | null, lng?: number | null) {
    if (isMapPoint({ lat, lng, crs: 'GCJ02' })) {
        wx.openLocation({ latitude: lat, longitude: lng, name, scale: 16 });
        return;
    }
    wx.showToast({ title: '正式坐标待接入', icon: 'none' });
}
