import { React } from '../runtime.mjs';
import { request } from '../services/api.mjs';
export function useResource(path, { pollMs = 0 } = {}) {
    const [state, set] = React.useState({
        path,
        data: null,
        error: null,
        loading: true
    });
    const [revision, refresh] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => {
        let stopped = false, timer = null, controller = null, generation = 0;
        set(s => s.path === path ? s : {
            path,
            data: null,
            error: null,
            loading: true
        });
        async function run() {
            if (stopped || document.hidden)
                return;
            const current = ++generation;
            controller?.abort();
            controller = new AbortController();
            set(s => ({
                ...s,
                loading: !s.data,
                error: null
            }));
            try {
                const data = await request(path, {
                    signal: controller.signal
                });
                if (!stopped && current === generation)
                    set({
                        path,
                        data,
                        error: null,
                        loading: false
                    });
            }
            catch (e) {
                if (!stopped && current === generation && e.name !== 'AbortError')
                    set(s => ({
                        ...s,
                        path,
                        error: e,
                        loading: false
                    }));
            }
            finally {
                if (!stopped && current === generation && pollMs && !document.hidden)
                    timer = setTimeout(run, pollMs);
            }
        }
        const visible = () => {
            clearTimeout(timer);
            ++generation;
            controller?.abort();
            if (!document.hidden)
                void run();
        };
        document.addEventListener('visibilitychange', visible);
        void run();
        return () => {
            stopped = true;
            ++generation;
            clearTimeout(timer);
            controller?.abort();
            document.removeEventListener('visibilitychange', visible);
        };
    }, [
        path,
        pollMs,
        revision
    ]);
    return {
        ...(state.path === path ? state : {
            path,
            data: null,
            error: null,
            loading: true
        }),
        retry: () => refresh()
    };
}

