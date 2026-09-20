import fs from 'node:fs/promises';
const document = JSON.parse(await fs.readFile('docs/openapi.json','utf8'));
function type(s) {
  if (s.$ref) return s.$ref.split('/').at(-1);
  if (s.oneOf) return s.oneOf.map(type).join(' | ');
  if ('const' in s) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(v=>JSON.stringify(v)).join(' | ');
  if (Array.isArray(s.type)) return s.type.map(t=>type({...s,type:t})).join(' | ');
  if (s.type==='array') return `Array<${type(s.items || {})}>`;
  if (s.type==='object') {
    const fields=Object.entries(s.properties||{}).map(([key,v])=>`  ${JSON.stringify(key)}${(s.required||[]).includes(key)?'':'?'}: ${type(v)};`);
    return fields.length?`{\n${fields.join('\n')}\n}`:'Record<string, unknown>';
  }
  return ({string:'string',number:'number',integer:'number',boolean:'boolean',null:'null'})[s.type] || 'unknown';
}
const text='// Generated from docs/openapi.json by scripts/generate-types.mjs. Do not edit.\n'+Object.entries(document.components.schemas).map(([name,s])=>`export type ${name==='Error'?'ApiErrorEnvelope':name} = ${type(s)};`).join('\n\n')+'\n';
await fs.writeFile('packages/contracts/api-types.d.ts',text);
console.log(JSON.stringify({generated:'packages/contracts/api-types.d.ts',schemas:Object.keys(document.components.schemas).length}));
