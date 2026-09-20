import { CONFIG } from './config';

export function openTransitCode() {
  if (!CONFIG.transitMiniProgramAppId) {
    wx.showModal({
      title: '微信乘车码',
      content: '当前为联调版本。正式上线后将直接拉起南充公交微信乘车码。',
      showCancel: false
    });
    return;
  }
  wx.navigateToMiniProgram({
    appId: CONFIG.transitMiniProgramAppId,
    path: CONFIG.transitMiniProgramPath || undefined,
    fail: () => wx.showToast({ title: '乘车码暂不可用', icon: 'none' })
  });
}
