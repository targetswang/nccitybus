// Retain presentation state only, never profiles/tokens/content snapshots.
const saved: Record<string, any> = {};
let sharedMode = 'walks';
export function retainPage(options: any, key: string, fields: string[], pollMs = 300000) {
    const show = options.onShow, hide = options.onHide, unload = options.onUnload, scroll = options.onPageScroll, pull = options.onPullDownRefresh;
    function save(page: any) {
        saved[key] = Object.fromEntries(fields.map(field => [field, page.data[field]]));
        saved[key].scrollTop = page._scrollTop || 0;
        if (fields.includes('mode'))
            sharedMode = page.data.mode;
    }
    function stop(page: any) { page._visible = false; clearTimeout(page._contentTimer); save(page); }
    return {
        ...options,
        async onShow() {
            this._visible = true;
            clearTimeout(this._contentTimer);
            const state = saved[key] || {};
            this.setData({ ...Object.fromEntries(fields.filter(f => state[f] !== undefined).map(f => [f, state[f]])), ...(fields.includes('mode') ? { mode: sharedMode } : {}) });
            this._scrollTop = ['home', 'explore', 'live', 'me'].includes(key) ? state.scrollTop || 0 : 0;
            await this.refreshPage();
            if (this._visible && this._scrollTop)
                wx.nextTick(() => wx.pageScrollTo({ scrollTop: this._scrollTop, duration: 0 }));
        },
        async refreshPage() {
            if (this._contentLoading)
                return;
            this._contentLoading = true;
            try {
                await show?.call(this);
                if (!this.data.error)
                    this.setData({ lastLoaded: Date.now() });
            }
            finally {
                this._contentLoading = false;
                clearTimeout(this._contentTimer);
                if (this._visible && pollMs)
                    this._contentTimer = setTimeout(() => this.refreshPage(), pollMs);
            }
        },
        async onPullDownRefresh() { try {
            if (pull)
                await pull.call(this);
            else
                await this.refreshPage();
        }
        finally {
            wx.stopPullDownRefresh();
        } },
        onPageScroll(e: any) { this._scrollTop = e.scrollTop; scroll?.call(this, e); },
        onHide() { stop(this); hide?.call(this); },
        onUnload() { stop(this); unload?.call(this); }
    };
}
