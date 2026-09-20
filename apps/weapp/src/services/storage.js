const { decodeFavorites, encodeFavorites } = require('../shared/client-core');
const api = require('./api');
const KEY = 'nc.favorites.v2';
function getFavorites() {
    try {
        return decodeFavorites(wx.getStorageSync(KEY) || wx.getStorageSync('nc-tour-favorites'));
    }
    catch {
        return [];
    }
}
function getSession() {
    try {
        return wx.getStorageSync('nc.session.v2') || null;
    }
    catch {
        return null;
    }
}
function saveSession(session) {
    wx.setStorageSync('nc.session.v2', session);
}
function clearSession() {
    wx.removeStorageSync('nc.session.v2');
}
async function toggleFavorite(id) {
    const old = getFavorites(), selected = old.includes(id), ids = selected ? old.filter(x => x !== id) : old.concat([
        id
    ]);
    wx.setStorageSync(KEY, encodeFavorites(ids));
    const session = getSession();
    if (session) {
        try {
            // 与 H5 统一：收藏走 /me/action 的 favorite 动作，不再使用旧的 REST 收藏端点。
            await api.meAction(session.token, 'favorite', {
                id,
                operation: selected ? 'remove' : 'add'
            });
        }
        catch (error) {
            if (error.status === 401)
                clearSession();
            return {
                ids,
                syncError: '已保存到本机，账号同步失败'
            };
        }
    }
    return {
        ids,
        syncError: null
    };
}
async function readProfile() {
    const session = getSession();
    if (!session)
        return null;
    return api.meQuery(session.token);
}
async function syncFavorites(catalog) {
    const session = getSession();
    if (!session)
        return;
    const valid = getFavorites().filter(id => catalog.pois.some(p => p.id === id));
    // 与 H5 统一：合并与读取都走 /me/action 的 favorite 动作 / /me/query。
    await api.meAction(session.token, 'favorite', {
        operation: 'merge',
        ids: valid
    });
    const profile = await api.meQuery(session.token);
    wx.setStorageSync(KEY, encodeFavorites([
        ...getFavorites(),
        ...(profile.favorites || [])
    ]));
}
module.exports = {
    getFavorites,
    toggleFavorite,
    getSession,
    saveSession,
    clearSession,
    readProfile,
    syncFavorites
};

