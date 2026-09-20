import { loadConfig } from '../../packages/core/config.mjs';
import { openDatabase, migrate } from '../../packages/storage/database.mjs';
import { Repository } from '../../packages/storage/repository.mjs';
import { createApi } from './server.mjs';
import { log } from '../../packages/core/log.mjs';
const config = loadConfig(), db = await openDatabase(config);
await migrate(db);
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

