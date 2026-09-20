import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const dir = 'deploy/integrations', locked = fs.existsSync(`${dir}/package-lock.json`);
const args = locked ? [
    'ci',
    '--prefix',
    dir,
    '--ignore-scripts',
    '--no-fund'
] : [
    'install',
    '--prefix',
    dir,
    '--ignore-scripts',
    '--no-fund',
    '--package-lock=true'
];
console.log(locked ? 'Installing the reviewed integration lock.' : 'First resolution: review and commit deploy/integrations/package-lock.json before production release.');
const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit'
});
process.exit(r.status ?? 1);

