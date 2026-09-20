import { getContent } from './api';
let current: any = null;
let loading: Promise<any> | null = null;
export async function loadContent(force = false) {
  if (!force && current) return current;
  if (!force && loading) return loading;
  loading = getContent().then(data => { current = data; return data; }).finally(() => { loading = null; });
  return loading;
}
export function cachedContent() { return current; }
