import { getMe, logout } from './api';
const KEY = 'nc.visitor.session.v1';
export function readSession() {
  try { const s = wx.getStorageSync(KEY); return s?.expiresAt > Date.now() && typeof s.token === 'string' && s.token.length >= 20 && s.user?.audience === 'user' ? s : null; }
  catch { return null; }
}
export function saveSession(value: any) { if(value?.user?.audience!=='user'||typeof value.token!=='string'||value.token.length<20)throw new Error('登录响应无效'); wx.setStorageSync(KEY, value); }
export function clearSession() { wx.removeStorageSync(KEY); }
export async function readProfile() { const s = readSession(); return s ? getMe(s.token) : null; }


export async function logoutSession() { const s=readSession(); if(s)await logout(s.token); clearSession(); }
