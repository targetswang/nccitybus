import { CONFIG } from './config';

type Method = 'GET' | 'POST';
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message); this.code = code; this.status = status;
  }
}
export function request(path: string, options: { method?: Method; data?: any } = {}) {
  return new Promise<any>((resolve, reject) => {
    const method = options.method || 'GET';
    const base = CONFIG.apiBaseUrl.replace(/\/$/, '');
    if (!/^https:\/\//.test(base)) return reject(new ApiError('API_NOT_CONFIGURED', '服务地址尚未配置'));
    wx.request({
      url: base + '/api/v1' + path,
      method,
      data: options.data,
      timeout: 15000,
      header: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      success: res => {
        const body: any = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && body && !body.error) return resolve(body);
        reject(new ApiError(body?.error?.code || 'HTTP_ERROR', body?.error?.message || `服务返回 ${res.statusCode}`, res.statusCode));
      },
      fail: err => reject(new ApiError('NETWORK_ERROR', err.errMsg || '网络连接失败'))
    });
  });
}
export const getContent = () => request('/content');
export const getCapabilities = () => request('/capabilities');
export const getTransit = (routeId = 'jialing-loop') => request('/transit/live?routeId=' + encodeURIComponent(routeId));
export const challenge = (phone: string, audience: 'user' | 'admin' = 'user') => request('/auth/challenge', { method: 'POST', data: { phone, audience } });
export const verify = (payload: any) => request('/auth/verify', { method: 'POST', data: payload });
export const getMe = (session: string) => request('/me/query', { method: 'POST', data: { _session: session } });
export const meAction = (session: string, action: string, data: any = {}) => request('/me/action', { method: 'POST', data: { ...data, action, _session: session } });
export const wechatPhoneLogin = (code: string, loginCode: string) => request('/auth/wechat-phone', { method: 'POST', data: { code, loginCode } });
export const track = (event: string, data: any = {}) => request('/analytics/event', { method: 'POST', data: { event, eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, client: 'weapp', page: data.page || '', objectType: data.objectType || '', objectId: data.objectId || '', channelCode: data.channelCode || '', contentVersion: data.contentVersion || '', properties: data.properties || {} } }).catch(() => null);


export const logout = (token: string) => request('/auth/logout', { method: 'POST', data: { _session: token } });
