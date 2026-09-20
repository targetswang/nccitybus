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
            await api.request(selected ? '/me/favorites/' + encodeURIComponent(id) : '/me/favorites', {
                method: selected ? 'DELETE' : 'POST',
                data: selected ? undefined : {
                    ids: [
                        id
                    ]
                },
                token: session.token
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
    await api.request('/me/favorites', {
        method: 'POST',
        data: {
            ids: valid
        },
        token: session.token
    });
    const remote = await api.request('/me/favorites', {
        token: session.token
    });
    wx.setStorageSync(KEY, encodeFavorites([
        ...getFavorites(),
        ...remote.ids
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

