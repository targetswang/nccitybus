import './generate-types.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { validateCatalog } from '../packages/contracts/index.mjs';

const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const catalog = validateCatalog(await read('packages/content/catalog.reference.json'));
const tokens = await read('packages/design/tokens.json');
const client = await read(process.env.CLIENT_CONFIG || 'deploy/client.example.json');
const appid = process.env.WECHAT_MINIPROGRAM_APP_ID || client.appid;
const apiBaseUrl = process.env.WECHAT_API_BASE_URL || client.apiBaseUrl || '';
if (apiBaseUrl && !/^https:\/\//.test(apiBaseUrl)) throw new Error('Native API origin must use HTTPS');
if (client.environment === 'production' && (!/^wx[a-zA-Z0-9]{16}$/.test(appid) || !apiBaseUrl)) {
  throw new Error('Production build requires a real WeChat AppID and HTTPS API origin');
}
const h5 = 'dist/h5', admin = 'dist/admin', native = 'dist/weapp-native';
for (const dir of [h5, admin, native]) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}
await fs.cp('apps/h5/src', `${h5}/src`, { recursive: true });
await fs.cp('apps/h5/public', h5, { recursive: true });
await fs.copyFile('apps/h5/index.html', `${h5}/index.html`);
await fs.cp('apps/admin/src', `${admin}/src`, { recursive: true });
await fs.copyFile('apps/admin/index.html', `${admin}/index.html`);

// Ship only executable native resources, never source docs or stale audit snapshots.
async function compileNative(dir, relative = '') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name), source = path.join(dir, entry.name);
    if (entry.isDirectory()) { await compileNative(source, rel); continue; }
    if (entry.name.endsWith('.d.ts') || entry.name === 'tsconfig.json') continue;
    if (!/\.(ts|json|wxml|wxss)$/.test(entry.name)) continue;
    const target = path.join(native, rel.replace(/\.ts$/, '.js'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (entry.name.endsWith('.ts')) {
      const result = ts.transpileModule(await fs.readFile(source, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: source,
      });
      await fs.writeFile(target, result.outputText);
    } else await fs.copyFile(source, target);
  }
}
await compileNative('apps/weapp-native');
const shared = await fs.readFile('packages/client-core/index.mjs', 'utf8');
const exports = [...shared.matchAll(/^export\s+(?:function|const)\s+(\w+)/gm)].map(x => x[1]);
if (!exports.length || /^import\s/m.test(shared) || /export\s+default/.test(shared)) throw new Error('Shared core must have pure named exports');
await fs.mkdir(`${h5}/shared`, { recursive: true });
await fs.writeFile(`${h5}/shared/client-core.mjs`, shared);
await fs.mkdir(`${native}/shared`, { recursive: true });
await fs.writeFile(`${native}/shared/client-core.js`, `// Generated from packages/client-core/index.mjs\n${shared.replace(/^export\s+/gm, '')}\nmodule.exports = { ${exports.join(', ')} };\n`);
await fs.writeFile(`${native}/services/config.js`, `exports.CONFIG = ${JSON.stringify({ apiBaseUrl, environment: client.environment, transitMiniProgramAppId: client.transitMiniProgramAppId || '', transitMiniProgramPath: client.transitMiniProgramPath || '' }, null, 2)};\n`);
const project = await read('apps/weapp-native/project.config.json');
project.appid = appid; project.setting.urlCheck = client.environment === 'production';
await fs.writeFile(`${native}/project.config.json`, JSON.stringify(project, null, 2) + '\n');
const css = Object.entries(tokens).map(([k,v]) => `  --${k}: ${typeof v === 'number' ? v+'px' : v};`).join('\n');
await fs.writeFile(`${h5}/tokens.css`, `:root {\n${css}\n}\n`);
const digest = value => createHash('sha256').update(value).digest('hex');
const manifest = { version: (await fs.readFile('VERSION','utf8')).trim(), contentVersion: catalog.version, sharedSha256: digest(shared), tokensSha256: digest(JSON.stringify(tokens)), clients: ['h5','admin','weapp-native'], nativePages: (await read(`${native}/app.json`)).pages.length, production: client.environment === 'production', nativeApiConfigured: Boolean(apiBaseUrl) };
await fs.writeFile('dist/build-manifest.json', JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({build:'passed',...manifest}));
