import { loadConfig, missingHttp, missingMqtt } from '../../packages/core/config.mjs';
import { openDatabase, migrate } from '../../packages/storage/database.mjs';
import { Repository } from '../../packages/storage/repository.mjs';
import { IvyClient } from '../../packages/ivy/http-client.mjs';
import { AmapConverter } from '../../packages/ivy/coordinates.mjs';
import { synchronizeRoute } from '../../packages/ivy/sync.mjs';
import { connectMqtt } from '../../packages/ivy/mqtt-runner.mjs';
import { log } from '../../packages/core/log.mjs';
const config = loadConfig(), db = await openDatabase(config), repo = new Repository(db);
await migrate(db);
const leaseKey = `ivy:${config.transit.operatorId}`, stateKey = `mqtt:${config.transit.operatorId}`;
let stopped = false, mqtt = null, syncPromise = null, heartbeat = null, syncTimer = null, cleanup = null;
const aborter = new AbortController();
if (!await repo.lease(leaseKey, config.workerId, Date.now(), config.workerLeaseMs)) {
    await db.close();
    throw new Error('A worker already owns this operator lease');
}
function synchronize() {
    if (syncPromise || stopped)
        return syncPromise || Promise.resolve();
    syncPromise = (async () => {
        const client = new IvyClient(config.ivy), converter = new AmapConverter(config.amapKey);
        const requested = await repo.state(`sync-request:${config.transit.operatorId}`);
        let failed = false;
        for (const route of config.transit.routes) {
            if (!route.lineCode || !route.branchCode)
                continue;
            try {
                const data = await synchronizeRoute(client, converter, repo, config.transit.operatorId, route, aborter.signal, { key: leaseKey, owner: config.workerId });
                await repo.setState(`sync:${route.id}`, {
                    state: 'connected',
                    version: data.version
                });
            }
            catch (e) {
                failed = true;
                await repo.setState(`sync:${route.id}`, {
                    state: 'error',
                    reason: e.code || 'SYNC_FAILED'
                });
                log({
                    event: 'sync-failed',
                    routeId: route.id,
                    code: e.code || 'SYNC_FAILED'
                });
            }
        }
        // Compare request timestamps: do not acknowledge a newer request that arrived mid-sync.
        if (!failed && requested?.pending)
            await repo.acknowledgeSync(`sync-request:${config.transit.operatorId}`, requested);
    })().finally(() => {
        syncPromise = null;
    });
    return syncPromise;
}
async function shutdown(code = 0) {
    if (stopped)
        return;
    stopped = true;
    clearInterval(heartbeat);
    clearInterval(syncTimer);
    clearInterval(cleanup);
    aborter.abort();
    const force = setTimeout(() => process.exit(1), 15000);
    force.unref();
    try {
        if (mqtt)
            await mqtt.stop();
        if (syncPromise)
            await syncPromise;
        const lease = await db.query('SELECT owner FROM worker_leases WHERE key=$1', [leaseKey]);
        if (lease[0]?.owner === config.workerId)
            await repo.setState(stateKey, { state: 'stopped', reason: 'WORKER_STOPPED' });
        await repo.releaseLease(leaseKey, config.workerId);
    }
    catch (e) {
        log({
            event: 'shutdown-failed',
            code: e.code || 'SHUTDOWN_FAILED'
        });
        code = 1;
    }
    finally {
        await db.close();
        process.exit(code);
    }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
const httpMissing = missingHttp(config), mqttMissing = missingMqtt(config);
await repo.setState(`worker:${config.transit.operatorId}`, {
    instanceId: config.workerId,
    state: 'running'
});
// Start the lease heartbeat before potentially slow HTTP synchronization.
let beating = false;
heartbeat = setInterval(async () => {
    if (stopped || beating)
        return;
    beating = true;
    try {
        if (!await repo.lease(leaseKey, config.workerId, Date.now(), config.workerLeaseMs))
            return void shutdown(1);
        await repo.setState(`worker:${config.transit.operatorId}`, {
            instanceId: config.workerId,
            state: 'running'
        });
        if (!httpMissing.length && (await repo.state(`sync-request:${config.transit.operatorId}`))?.pending)
            void synchronize().catch(() => shutdown(1));
    }
    catch {
        void shutdown(1);
    }
    finally {
        beating = false;
    }
}, config.workerHeartbeatMs);
try {
    if (httpMissing.length) {
        for (const route of config.transit.routes)
            await repo.setState(`sync:${route.id}`, {
                state: 'not_configured',
                missing: httpMissing
            });
    }
    else
        await synchronize();
    if (mqttMissing.length) {
        await repo.setState(stateKey, {
            state: 'not_configured',
            reason: 'MISSING_CONFIGURATION',
            missing: mqttMissing
        });
        log({
            event: 'worker-idle',
            state: 'not_configured',
            count: mqttMissing.length
        });
    }
    else {
        await repo.setState(stateKey, {
            state: 'connecting',
            reason: 'INITIALIZING'
        });
        if (!stopped)
            mqtt = await connectMqtt(config, repo, new AmapConverter(config.amapKey), {
                onFatal: () => void shutdown(1)
            });
    }
    syncTimer = setInterval(() => {
        if (!httpMissing.length)
            void synchronize().catch(() => shutdown(1));
    }, 5 * 60000);
    cleanup = setInterval(() => repo.housekeeping().catch(() => log({
        event: 'cleanup-failed',
        code: 'DB_ERROR'
    })), 3600000);
    log({
        event: 'worker-started',
        state: mqttMissing.length ? 'not_configured' : 'connecting'
    });
}
catch (e) {
    log({
        event: 'worker-failed',
        code: e.code || 'STARTUP_FAILED'
    });
    await shutdown(1);
}

