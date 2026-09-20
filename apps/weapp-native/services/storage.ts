const FAVORITES_KEY = 'nc-tour-favorites';

export function getFavorites(): string[] {
  try { return wx.getStorageSync(FAVORITES_KEY) || []; } catch { return []; }
}
export function setFavorites(ids: string[]) {
  wx.setStorageSync(FAVORITES_KEY, ids);
}
export function toggleFavorite(id: string) {
  const current = getFavorites();
  const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  setFavorites(next);
  return next;
}
