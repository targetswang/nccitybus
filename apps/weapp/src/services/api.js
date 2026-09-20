const CONFIG = require('../shared/config');
function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        if (!CONFIG.apiBaseUrl)
            return reject(Object.assign(new Error('服务地址尚未配置'), {
                code: 'API_NOT_CONFIGURED'
            }));
        const token = options.token || '';
        wx.request({
            url: CONFIG.apiBaseUrl.replace(/\/$/, '') + '/api/v1' + path,
            method: options.method || 'GET',
            data: options.data,
            header: {
                'Content-Type': 'application/json',
                ...(token ? {
                    Authorization: 'Bearer ' + token
                } : {})
            },
            timeout: 10000,
            success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300 && res.data && !res.data.error)
                    resolve(res.data);
                else
                    reject(Object.assign(new Error(res.data && res.data.error ? res.data.error.message : '服务返回错误'), {
                        code: res.data && res.data.error ? res.data.error.code : 'SERVER_ERROR',
                        status: res.statusCode
                    }));
            },
            fail() {
                reject(Object.assign(new Error('网络连接失败，请重试'), {
                    code: 'NETWORK_ERROR'
                }));
            }
        });
    });
}
async function catalog(force = false) {
    const app = getApp();
    if (!force && app.globalData.catalog)
        return app.globalData.catalog;
    const value = await request('/content');
    if (!value.version || !Array.isArray(value.pois) || !Array.isArray(value.walks) || !Array.isArray(value.nodes))
        throw new Error('内容格式错误');
    app.globalData.catalog = value;
    return value;
}
async function capabilities() {
    const value = await request('/capabilities');
    getApp().globalData.capabilities = value;
    return value;
}
function challenge(phone, audience = 'user') {
    return request('/auth/challenge', {
        method: 'POST',
        data: {
            phone,
            audience
        }
    });
}
function verify(payload) {
    return request('/auth/verify', {
        method: 'POST',
        data: payload
    });
}
function wechatPhoneLogin(code, loginCode) {
    return request('/auth/wechat-phone', {
        method: 'POST',
        data: {
            code,
            loginCode
        }
    });
}
function meQuery(session) {
    return request('/me/query', {
        method: 'POST',
        data: {
            _session: session
        }
    });
}
function meAction(session, action, data = {}) {
    return request('/me/action', {
        method: 'POST',
        data: {
            ...data,
            action,
            _session: session
        }
    });
}
function track(event, data = {}) {
    return request('/analytics/event', {
        method: 'POST',
        data: {
            event,
            eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            client: 'weapp',
            page: data.page || '',
            objectType: data.objectType || '',
            objectId: data.objectId || '',
            channelCode: data.channelCode || '',
            contentVersion: data.contentVersion || '',
            properties: data.properties || {}
        }
    }).catch(() => null);
}
module.exports = {
    request,
    catalog,
    capabilities,
    challenge,
    verify,
    wechatPhoneLogin,
    meQuery,
    meAction,
    track
};

