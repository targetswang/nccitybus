import { loadDriver } from '../core/drivers.mjs';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/** SQL is limited to a common subset. Production PostgreSQL uses pg; local SQLite is never an automatic failover. */
export async function openDatabase(config) {
    let tail = Promise.resolve();
    const serialize = async (fn) => {
        const before = tail;
        let release;
        tail = new Promise(r => release = r);
        await before;
        try { return await fn(); }
        finally { release(); }
    };
    if (config.dbDriver === 'postgres') {
        const { Pool } = loadDriver('pg', config.root);
        const pool = new Pool({
            connectionString: config.databaseUrl,
            max: 8,
            connectionTimeoutMillis: 5000,
            ssl: config.databaseCaFile ? { ca: readFileSync(config.databaseCaFile, 'utf8'), rejectUnauthorized: true } : undefined
        });
        const exec = async (sql, params = []) => (await pool.query(sql, params)).rows;
        return {
            driver: 'postgres',
            query: exec,
            exec: async (sql) => { await pool.query(sql); },
            transaction: async (key, fn) => {
                const c = await pool.connect();
                try {
                    await c.query('BEGIN');
                    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
                    const tx = {
                        query: async (sql, p = []) => (await c.query(sql, p)).rows,
                        exec: async (sql) => { await c.query(sql); }
                    };
                    const r = await fn(tx);
                    await c.query('COMMIT');
                    return r;
                } catch (e) {
                    await c.query('ROLLBACK');
                    throw e;
                } finally { c.release(); }
            },
            close: () => pool.end()
        };
    }
    const { DatabaseSync } = await import('node:sqlite');
    if (config.sqlitePath !== ':memory:') mkdirSync(dirname(config.sqlitePath), { recursive: true });
    const db = new DatabaseSync(config.sqlitePath, { timeout: 5000 });
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const query = async (sql, params = []) => {
        const bound = [];
        const rewritten = sql.replace(/\$(\d+)/g, (_, n) => { bound.push(params[Number(n) - 1]); return '?'; });
        const st = db.prepare(rewritten);
        return st.all(...bound);
    };
    return {
        driver: 'sqlite',
        query: (s, p) => serialize(() => query(s, p)),
        exec: sql => serialize(() => db.exec(sql)),
        transaction: (key, fn) => serialize(async () => {
            db.exec('BEGIN IMMEDIATE');
            try {
                const result = await fn({ query, exec: async (sql) => db.exec(sql) });
                db.exec('COMMIT');
                return result;
            } catch (e) {
                db.exec('ROLLBACK');
                throw e;
            }
        }),
        close: async () => db.close()
    };
}
export async function migrate(db) {
    const migrations = [
        ['001', fileURLToPath(new URL('./schema.sql', import.meta.url))],
        ['002', fileURLToPath(new URL('./migrations/002_unified_platform.sql', import.meta.url))],
        ['003', fileURLToPath(new URL('./migrations/003_ai_operations.sql', import.meta.url))],
        ['004', fileURLToPath(new URL('./migrations/004_operations_media_discovery.sql', import.meta.url))],
    ];
    for (const [version, file] of migrations) {
        if (!existsSync(file)) continue;
        const applied = await db.query('SELECT version FROM schema_migrations WHERE version=$1', [version]).catch(() => []);
        if (applied.length) continue;
        const sql = readFileSync(file, 'utf8');
        await db.transaction('schema-migration:' + version, async (tx) => {
            await tx.exec(sql);
            await tx.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2) ON CONFLICT(version) DO NOTHING', [version, Date.now()]);
        });
    }
}
