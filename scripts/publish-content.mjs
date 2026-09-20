import fs from 'node:fs';
import { loadConfig } from '../packages/core/config.mjs';
import { openDatabase, migrate } from '../packages/storage/database.mjs';
import { Repository } from '../packages/storage/repository.mjs';
import { invariant } from '../packages/contracts/index.mjs';
const config = loadConfig(), db = await openDatabase(config);
await migrate(db);
const repo = new Repository(db);
try {
    const args = process.argv.slice(2);
    if (args[0] === '--rollback') {
        await repo.rollbackCatalog(args[1]);
        console.log('Content rollback completed');
    }
    else {
        const file = args[0] || 'packages/content/catalog.reference.json', catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
        invariant(!config.production || catalog.publication === 'approved', 'CONTENT_NOT_APPROVED', 'Production requires an approved content release');
        console.log('Published', await repo.publishCatalog(catalog));
    }
}
finally {
    await db.close();
}

