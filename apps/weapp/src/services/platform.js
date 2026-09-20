const api = require('./api');
const { navigationTarget } = require('../shared/client-core');
async function openTransitCode() {
    let capabilities;
    try {
        capabilities = getApp().globalData.capabilities || await api.capabilities();
    }
    catch {
        return wx.showModal({
            title: '暂时无法打开',
            content: '无法读取乘车服务配置，请稍后重试。',
            showCancel: false
        });
    }
    const transit = capabilities.transitCode;
    if (!transit || !transit.configured)
        return wx.showModal({
            title: '乘车码接入中',
            content: '公交集团授权配置尚未完成。请使用公交集团现有微信乘车码。',
            showCancel: false
        });
    wx.navigateToMiniProgram({
        appId: transit.appId,
        path: transit.path || '',
        fail() {
            wx.showModal({
                title: '乘车码未打开',
                content: '可能被取消或暂未获得目标小程序授权，请重试。',
                showCancel: false
            });
        }
    });
}
function navigatePoi(poi) {
    const target = navigationTarget(poi);
    if (!target)
        return false;
    wx.openLocation({
        ...target,
        scale: 16,
        fail() {
            wx.showToast({
                title: '地图未打开，请重试',
                icon: 'none'
            });
        }
    });
    return true;
}
function openPage(page, id, from) {
    const allowed = [
        'route',
        'stations',
        'station',
        'walks',
        'walk',
        'poi',
        'guide',
        'favorites',
        'rights',
        'privacy',
        'login',
        'member',
        'events',
        'event',
        'benefit',
        'messages',
        'support'
    ];
    if (!allowed.includes(page))
        return;
    let url = '/pages/' + page + '/index';
    const query = [];
    if (id)
        query.push('id=' + encodeURIComponent(id));
    if (from)
        query.push('from=' + encodeURIComponent(from));
    if (query.length)
        url += '?' + query.join('&');
    wx.navigateTo({
        url,
        fail() {
            wx.showToast({
                title: '页面打开失败',
                icon: 'none'
            });
        }
    });
}
module.exports = {
    openTransitCode,
    navigatePoi,
    openPage
};

