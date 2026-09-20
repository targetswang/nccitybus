import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateCatalog } from '../packages/contracts/index.mjs';

const root = process.cwd();
const result = { kind: 'static-and-build-integrity', status: 'passed', counts: {}, checks: [], limitations: ['This is not the WeChat WXML compiler, a physical-device test or a security certification.'] };
const check = async (name, fn) => {
  try { const detail = await fn(); result.checks.push({ name, status: 'passed', detail: detail ?? null }); }
  catch (error) { result.status = 'failed'; result.checks.push({ name, status: 'failed', reason: error.message }); }
};
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
async function list(dir) {
  const items = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '__pycache__', '.git', 'var'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) items.push(...await list(p)); else items.push(p);
  }
  return items;
}
const files = (await list(root)).map(p => path.relative(root, p));
const sources = files.filter(p => /^(apps|packages|scripts)\//.test(p) && /\.(mjs|js)$/.test(p) && !p.includes('/vendor/'));
result.counts.jsSourceAndGeneratedFiles = sources.length;
await check('JavaScript syntax for source and generated mini-program', async () => {
  const bad = [];
  for (const p of sources) { const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); if (r.status !== 0) bad.push(`${p}: ${r.stderr}`); }
  requireCondition(!bad.length, bad.join('\n')); return sources.length;
});
await check('Actual shared logic build hash', async () => {
  const shared = await fs.readFile('packages/client-core/index.mjs');
  const copied = await fs.readFile('dist/h5/shared/client-core.mjs');
  const manifest = JSON.parse(await fs.readFile('dist/build-manifest.json'));
  requireCondition(shared.equals(copied), 'H5 shared copy differs');
  requireCondition(createHash('sha256').update(shared).digest('hex') === manifest.sharedSha256, 'Shared hash differs');
  const native = await fs.readFile('apps/weapp/dist/shared/client-core.js', 'utf8');
  requireCondition(native.includes(shared.toString().replace(/^export\s+/gm, '')), 'Native CJS is not generated from the same shared source');
  return manifest.sharedSha256;
});
await check('Canonical content references and completeness', async () => {
  const c = validateCatalog(JSON.parse(await fs.readFile('packages/content/catalog.reference.json')));
  result.counts.content = { nodes: c.nodes.length, pois: c.pois.length, walks: c.walks.length, steps: c.walks.reduce((n,w) => n+w.steps.length,0) };
  return result.counts.content;
});
await check('Portable admin build and native TypeScript source', async () => {
  for (const p of ['dist/admin/index.html','dist/admin/src/admin.mjs','dist/admin/src/admin.css','dist/weapp-native/app.json','dist/weapp-native/services/api.ts','dist/weapp-native/pages/login/index.wxml','dist/weapp-native/pages/support/index.wxml']) await fs.access(p);
  const ts=spawnSync('tsc',['-p','apps/weapp-native/tsconfig.json','--noEmit'],{encoding:'utf8'});
  requireCondition(ts.status===0,(ts.stdout||'')+'\n'+(ts.stderr||''));
  const native=JSON.parse(await fs.readFile('dist/weapp-native/app.json','utf8'));
  requireCondition(native.pages.length===19,'Native source must register 19 pages');
  return {admin:true,nativeSourcePages:native.pages.length,typescript:'passed'};
});
await check('Native page registration, four files and component targets', async () => {
  const base = 'apps/weapp/dist', app = JSON.parse(await fs.readFile(`${base}/app.json`));
  const registered = new Set(app.pages);
  requireCondition(registered.size === app.pages.length, 'Duplicate page registration');
  for (const p of app.pages) for (const ext of ['js','json','wxml','wxss']) await fs.access(`${base}/${p}.${ext}`);
  for (const p of files.filter(p => p.startsWith(base+'/') && p.endsWith('.json'))) {
    const config = JSON.parse(await fs.readFile(p));
    for (const target of Object.values(config.usingComponents || {})) {
      requireCondition(!String(target).includes('plugin://'), 'Plugin requires separate verification');
      const resolved = target.startsWith('/') ? path.join(base,target.slice(1)) : path.resolve(path.dirname(p),target);
      for (const ext of ['js','json','wxml','wxss']) await fs.access(`${resolved}.${ext}`);
    }
  }
  for (const item of app.tabBar.list) requireCondition(registered.has(item.pagePath),'Unregistered tab');
  const actual = files.filter(p=>p.startsWith(base+'/pages/') && p.endsWith('/index.json'));
  requireCondition(actual.length===registered.size,'Page directory and registration count differ');
  result.counts.nativePages=registered.size;
  return { pages: registered.size, tabPages: app.tabBar.list.length };
});
await check('Native static route targets and local require graph', async () => {
  const base='apps/weapp/dist', app=JSON.parse(await fs.readFile(base+'/app.json'));
  for(const p of files.filter(p=>p.startsWith(base+'/') && p.endsWith('.js'))) {
    const text=await fs.readFile(p,'utf8');
    for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      const resolved=path.resolve(path.dirname(p),m[1]);
      let exists=false; for(const ext of ['','.js','.json']) { try { await fs.access(resolved+ext); exists=true; break; } catch {} }
      requireCondition(exists,`Unresolved require ${p}: ${m[1]}`);
    }
    for(const m of text.matchAll(/['"]\/pages\/([a-z-]+)\/index(?:\?[^'"]*)?['"]/g))
      requireCondition(app.pages.includes(`pages/${m[1]}/index`),`Bad static route in ${p}`);
  }
  return 'Static paths only; dynamic handlers are covered separately by node tests';
});
await check('No live mock fallbacks or destructive global cache clearing in production source', async () => {
  const forbidden = [ /\bDEMO_POIS\b/, /useDemoDataWhenApiUnavailable/, /const\s+VEHICLES\s*=/, /约8分钟/, /约21分钟/, /localStorage\.clear\s*\(/, /wx\.clearStorage/, /wx\.reLaunch\s*\(/ ];
  const paths=files.filter(p => /^(apps|packages)\//.test(p)&&/\.(mjs|js|wxml|json)$/.test(p)&&!p.includes('/vendor/'));
  for(const p of paths) { const text=await fs.readFile(p,'utf8'); for(const re of forbidden) requireCondition(!re.test(text),`${p}: ${re}`); }
  return 'No matches for explicitly retired production patterns; not a proof of absence of all defects';
});
await check('Compiled design and semantic native template restrictions', async () => {
  for(const p of files.filter(p=>p.startsWith('apps/weapp/dist/')&&/\.(wxml|wxss)$/.test(p))) {
    const text=await fs.readFile(p,'utf8');
    requireCondition(!/__[A-Z_]+__/.test(text),`Uncompiled design token ${p}`);
    requireCondition(!/<\/?(?:div|span|br)(?:\s|\/?>)/.test(text),`Web-only element in ${p}`);
  }
  return 'No unresolved tokens or div/span/br in native output';
});
await check('Self-contained repository entries and local documentation links',async()=>{
  for(const p of ['README.md','docs/ARCHITECTURE.md','docs/API.md','docs/OPERATIONS.md','docs/HANDOFF.md','docs/KNOWN_LIMITATIONS.md','docs/IVY_PROTOCOL.md','docs/CLIENT_PARITY.md','docs/openapi.json','apps/api/main.mjs','apps/transit-worker/main.mjs','apps/h5/src/App.mjs','apps/weapp/dist/app.js','package-lock.json']) await fs.access(p);
  requireCondition(!files.some(p=>p.endsWith('sync-h5-backend.sh')),'Source download dependency remains');
  const api=JSON.parse(await fs.readFile('docs/openapi.json'));requireCondition(api.openapi==='3.1.0','OpenAPI schema missing');
  const apiSource=await fs.readFile('apps/api/server.mjs','utf8');
  for(const m of apiSource.matchAll(/pathname === '(\/api\/v1\/[^']+)'/g))
    requireCondition(Boolean(api.paths[m[1]]),`API contract omits ${m[1]}`);
  for(const p of files.filter(p=>/^(docs\/|README)/.test(p)&&p.endsWith('.md'))) {
    const text=await fs.readFile(p,'utf8');
    for(const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(m[1]))continue;
      await fs.access(path.resolve(path.dirname(p),m[1].split('#')[0]));
    }
  }
  return { rootLock:'no external npm dependencies', productionDriverLock: files.includes('deploy/integrations/package-lock.json')?'present: still requires review':'blocked: not generated, explicitly not fabricated' };
});
await fs.mkdir('audit',{recursive:true});
await fs.writeFile('audit/static-check.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exitCode=result.status==='passed'?0:1;
