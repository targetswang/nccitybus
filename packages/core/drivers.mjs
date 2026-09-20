import { createRequire } from 'node:module';
import path from 'node:path';
import { DomainError } from '../contracts/index.mjs';
/** Resolve production adapters in one explicit dependency boundary, never silently substitute SQLite. */
export function loadDriver(name, root = process.cwd()) {
    if (![
        'pg',
        'mqtt'
    ].includes(name))
        throw new DomainError('UNSUPPORTED_DRIVER', 'Unsupported driver');
    try {
        return createRequire(path.join(root, 'deploy/integrations/package.json'))(name);
    }
    catch (e) {
        if (e.code === 'MODULE_NOT_FOUND')
            throw new DomainError('DRIVER_NOT_INSTALLED', `${name} is not installed: run the production integration install/lock gate`, 503);
        throw e;
    }
}

