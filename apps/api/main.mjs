import { ContentService } from '../../packages/core/content-service.mjs';
import { loadConfig } from '../../packages/core/config.mjs';
import { openDatabase, migrate } from '../../packages/storage/database.mjs';
import { Repository } from '../../packages/storage/repository.mjs';
import { createApi } from './server.mjs';
import { log } from '../../packages/core/log.mjs';
const config = loadConfig(), db = await openDatabase(config);
await migrate(db);
const reconciliation=await new ContentService(db,new Repository(db)).reconcilePublished({actorUserId:'startup-migration'});
log({event:'content-reconciled',version:reconciliation.version,inserted:reconciliation.inserted,preserved:reconciliation.preserved,mediaConflicts:reconciliation.mediaConflicts.length});
const server = createApi({
    config,
    repository: new Repository(db)
});
server.listen(config.port, config.host, () => log({
    event: 'api-started',
    state: 'ready'
}));
let closing = false;
async function close() {
    if (closing)
        return;
    closing = true;
    server.close(async () => {
        await db.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);

