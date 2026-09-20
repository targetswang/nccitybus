import { getContent } from './api';
// Coalesce concurrent requests only. A later page entry must see newly published content.
let loading: Promise<any> | null = null;
export async function loadContent(_force = false) {
    if (loading)
        return loading;
    loading = getContent().finally(() => { loading = null; });
    return loading;
}
