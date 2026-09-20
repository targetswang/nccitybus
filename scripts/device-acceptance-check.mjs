import fs from 'node:fs';
const file=process.env.WECHAT_DEVICE_ACCEPTANCE_FILE||'audit/wechat/device-acceptance.json';
if(!fs.existsSync(file)){console.error(JSON.stringify({status:'blocked',reason:'device acceptance evidence missing',file}));process.exit(2);}
const d=JSON.parse(fs.readFileSync(file,'utf8'));
const required=['ios','android'];const failures=[];
if(!/^wx[a-zA-Z0-9]{16}$/.test(d.appid||''))failures.push('real appid missing');
if(!d.version)failures.push('version missing');
for(const platform of required){const x=d.devices?.[platform];if(!x||x.status!=='passed')failures.push(platform+' not passed');if(!x?.deviceModel)failures.push(platform+' deviceModel missing');if(!x?.osVersion)failures.push(platform+' osVersion missing');if(!Array.isArray(x?.evidence)||x.evidence.length<1)failures.push(platform+' evidence missing');for(const check of ['launch','wechatLogin','phoneAuthorization','contentRead','favoriteRoundTrip','supportRoundTrip','navigation','networkRetry'])if(x?.checks?.[check]!==true)failures.push(platform+' '+check+' missing');}
const result={status:failures.length?'blocked':'passed',failures,appidSuffix:(d.appid||'').slice(-6),version:d.version,verifiedAt:d.verifiedAt||null};console.log(JSON.stringify(result,null,2));process.exitCode=failures.length?2:0;
