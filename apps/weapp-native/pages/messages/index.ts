import { retainPage } from '../../services/page-state';
import { displayTime } from '../../shared/client-core';
import { meAction } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page(retainPage({ data: { busy: false, session: null as any, profile: null as any, error: '', loading: true }, async onShow() { const session = readSession(); this.setData({ session, loading: true, error: '' }); if (!session) {
        this.setData({ profile: null, loading: false });
        return;
    } try {
        this.setData({ profile: await readProfile().then((p: any) => ({ ...p, messages: p.messages.map((m: any) => ({ ...m, time: displayTime(m.createdAt) })) })) });
    }
    catch (e: any) {
        this.setData({ error: e.message });
    }
    finally {
        this.setData({ loading: false });
    } }, login() { wx.navigateTo({ url: '/pages/login/index' }); }, async read(...args: any[]) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        return await this.readAction(...args);
    }
    finally {
        this.setData({ busy: false });
    } }, async readAction(e: any) { const s = readSession(); if (!s)
        return; try {
        await meAction(s.token, 'readMessage', { recordId: e.currentTarget.dataset.id });
        await this.refreshPage();
    }
    catch (err: any) {
        this.setData({ error: err.message });
    } } }, "messages", [], 300000));
