import { loadConfig } from '../packages/core/config.mjs';
import { openDatabase, migrate } from '../packages/storage/database.mjs';
const db = await openDatabase(loadConfig());
try {
    await migrate(db);
    console.log('Database migration 001 applied');
}
finally {
    await db.close();
}

