export function openPoiLocation(name: string, lat?: number | null, lng?: number | null) {
  if (typeof lat === 'number' && typeof lng === 'number') {
    wx.openLocation({ latitude: lat, longitude: lng, name, scale: 16 });
    return;
  }
  wx.showToast({ title: '正式坐标待接入', icon: 'none' });
}
