import { CONFIG } from './config';

// Half-screen (embedded) mini-program launch for the transit code.
// Requires base library >= 2.20.1; older clients fall back to a full
// navigation so the entry never dead-ends.
export function openTransitCode() {
  if (!CONFIG.transitMiniProgramAppId) {
    wx.showModal({
      title: '微信乘车码',
      content: '当前为联调版本。正式上线后将直接拉起南充公交微信乘车码。',
      showCancel: false
    });
    return;
  }
  const target = {
    appId: CONFIG.transitMiniProgramAppId,
    path: CONFIG.transitMiniProgramPath || undefined
  };
  const fail = () => wx.showToast({ title: '乘车码暂不可用', icon: 'none' });
  if (typeof wx.openEmbeddedMiniProgram === 'function') {
    wx.openEmbeddedMiniProgram({ ...target, fail });
    return;
  }
  wx.navigateToMiniProgram({ ...target, fail });
}
