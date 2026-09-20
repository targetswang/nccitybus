import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root=process.cwd();
const appid=process.env.WECHAT_MINIPROGRAM_APP_ID||'';
const privateKeyPath=process.env.WECHAT_UPLOAD_PRIVATE_KEY_FILE||'';
const robot=Number(process.env.WECHAT_CI_ROBOT||1);
const projectPath=path.resolve(root,process.env.WECHAT_PROJECT_PATH||'dist/weapp-native');
const output=path.resolve(root,process.env.WECHAT_QR_OUTPUT||'audit/wechat/preview.jpg');
if(!/^wx[a-zA-Z0-9]{16}$/.test(appid))throw new Error('WECHAT_MINIPROGRAM_APP_ID missing or invalid');
if(!privateKeyPath||!fs.existsSync(privateKeyPath))throw new Error('WECHAT_UPLOAD_PRIVATE_KEY_FILE missing');
if(!fs.existsSync(path.join(projectPath,'project.config.json')))throw new Error('Built native mini-program project not found; run npm run build first');
const builtProject=JSON.parse(fs.readFileSync(path.join(projectPath,'project.config.json'),'utf8'));
if(builtProject.appid!==appid)throw new Error('Build AppID differs from preview AppID; rebuild with WECHAT_MINIPROGRAM_APP_ID');
const builtConfig=vm.runInNewContext(fs.readFileSync(path.join(projectPath,'services/config.js'),'utf8')+';exports.CONFIG', {exports:{}});
if(!/^https:\/\//.test(builtConfig.apiBaseUrl))throw new Error('Rebuild with WECHAT_API_BASE_URL before preview');
if(!Number.isInteger(robot)||robot<1||robot>30)throw new Error('WECHAT_CI_ROBOT must be 1-30');
fs.mkdirSync(path.dirname(output),{recursive:true});
const require=createRequire(path.join(root,'deploy/wechat-ci/package.json'));
let ci;try{ci=require('miniprogram-ci');}catch{throw new Error('Official miniprogram-ci is not installed. Run npm ci --prefix deploy/wechat-ci first.');}
const report={status:'running',appidSuffix:appid.slice(-6),robot,projectPath:path.relative(root,projectPath),startedAt:new Date().toISOString(),qrcode:path.relative(root,output)};
try{
  const project=new ci.Project({appid,type:'miniProgram',projectPath,privateKeyPath,ignores:['node_modules/**/*','audit/**/*']});
  const result=await ci.preview({project,desc:'南充城市漫游正式候选预览',setting:{es6:true,es7:true,minify:true,autoPrefixWXSS:true},qrcodeFormat:'image',qrcodeOutputDest:output,robot,onProgressUpdate:x=>{if(process.env.CI_VERBOSE==='1')console.log(x);}});
  report.status='passed';report.completedAt=new Date().toISOString();report.subPackageInfo=result?.subPackageInfo||[];report.pluginInfo=result?.pluginInfo||[];
}catch(e){report.status='failed';report.completedAt=new Date().toISOString();report.error=String(e?.message||e).slice(0,500);fs.mkdirSync(path.join(root,'audit/wechat'),{recursive:true});fs.writeFileSync(path.join(root,'audit/wechat/preview-result.json'),JSON.stringify(report,null,2)+'\n');throw e;}
fs.writeFileSync(path.join(root,'audit/wechat/preview-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
