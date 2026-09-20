import { getMe } from './api';
const KEY = 'nc.visitor.session.v1';
export function readSession() {
  try { const s = wx.getStorageSync(KEY); return s?.expiresAt > Date.now() && s.user?.audience === 'user' ? s : null; }
  catch { return null; }
}
export function saveSession(value: any) { wx.setStorageSync(KEY, value); }
export function clearSession() { wx.removeStorageSync(KEY); }
export async function readProfile() { const s = readSession(); return s ? getMe(s.token) : null; }
