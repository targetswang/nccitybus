/** Deliberately accepts only allowlisted diagnostic fields, never raw credentials or payloads. */
const ALLOWED = new Set([
    'event',
    'code',
    'routeId',
    'operatorId',
    'count',
    'durationMs',
    'requestId',
    'state',
    'retryMs',
    'version'
]);
export function log(fields) {
    const output = {
        at: new Date().toISOString()
    };
    for (const [key, value] of Object.entries(fields))
        if (ALLOWED.has(key))
            output[key] = value;
    process.stdout.write(JSON.stringify(output) + '\n');
}

