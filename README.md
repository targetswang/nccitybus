# 南充嘉陵江城市漫游 · 完整工程候选 v4.4.0-rc.1

本仓库是当前统一候选工程：**游客 H5 + 便携式运营后台 + 微信原生小程序 + 统一 `/api/v1` 后端 + PostgreSQL/SQLite 数据层 + Transit Worker + AI 运营助手 + 媒体/POI 运营能力 + 验收门禁**。三个前端共用同一套业务 API 和数据模型。

本版已经完成 4.1～4.4 的主体研发与自动回归，但**仍不是正式生产验收完成版本**。没有真实凭据、微信双端真机、IVY 现场数据的项目保持 blocked，不以模拟结果代替。

## 当前已验证

- 根工程 `npm run build`：通过。
- 根工程 `npm run check`：通过。
- Node 自动测试：**76/76 通过**，证据 `audit/phase44/node-tests.tap`。
- 媒体处理测试：**5/5 通过**，证据 `audit/phase44/media-tests.log`。
- PostgreSQL 16：GitHub CI 真实执行迁移、1/5/21/4/9 内容导入、草稿隔离和发布回读，**通过**；证据 `audit/postgres/result.json`。
- 生产运行依赖：`pg 8.16.3`、`mqtt 5.10.4` 已由 CI 生成完整 lock，并保存在 `deploy/integrations/package-lock.json`。
- 微信官方构建工具：`miniprogram-ci 2.1.31` 已由隔离 CI 安装、锁定和版本检查通过；lock 在 `deploy/wechat-ci/package-lock.json`。

注意：微信官方构建工具链的独立依赖审计仍报告大量传递依赖问题，原始结果保存在 `audit/wechat-toolchain/dependency-audit.json`。它被隔离为**构建工具**，不进入 API/H5/小程序运行时；不能把“工具链可运行”描述为“依赖安全扫描通过”。

## 5 分钟本地启动

已验证 Node.js 22.16.0 / npm 10.9.2。

```bash
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run db:migrate
npm run content:publish
npm start
```

H5：`http://127.0.0.1:3000/`  
运营后台：`http://127.0.0.1:3000/admin/`

另开终端：

```bash
npm run worker
```

没有 IVY 配置时 Worker 保持 `not_configured`，不会伪造车辆、ETA 或站点状态。

## 三端与统一后端

```text
apps/h5/            游客 H5
apps/admin/         运营后台
apps/weapp-native/  正式微信原生小程序源码（19页）
        \              |              /
                 /api/v1
                    |
                 apps/api
                    |
              packages/core
                    |
              packages/storage
                    |
        PostgreSQL（生产）/ SQLite（本地）
```

`apps/weapp/` 仅保留旧兼容基线，不作为正式微信交付入口。

## 4.4 新增运营闭环

### 媒体素材

后台可以查看素材、版权/使用依据、地点匹配状态、审计记录并设置 POI 封面。只有同时满足：

1. `rights_status=confirmed`
2. `match_status=confirmed`
3. 已生成本地 SHA-256 WebP 文件

才能进入地点封面草稿；**仍需显式发布**才影响 H5/小程序。

### POI 自动采集

服务端通过高德 POI 周边搜索产生候选记录。候选只进入 `poi_discovery_candidates`，必须人工审核、映射业务分类、导入草稿，然后显式发布。自动搜索结果不能直接出现在游客端。

### AI / 微信 / 短信真实验收

后台具备真实验证入口：

- AI：调用目标 DeepSeek/Kimi 兼容模型，数据库只记录 provider/model/结果/延迟，不记录 API Key。
- 微信：强制请求官方 access token 验证 AppID/AppSecret，数据库不记录 AppSecret/access token。
- 短信：两段式验证——先向现场手机号发送验证码，再输入**实际收到**的验证码，只有第二步通过才记录 `sms-delivery=passed`。

## 生产 PostgreSQL

正式环境强制 PostgreSQL；不会因为连接失败而静默回退 SQLite。生产运行依赖已锁定：

```bash
cd deploy/integrations
npm ci --ignore-scripts --no-audit --no-fund
```

兼容性验收脚本：

```bash
POSTGRES_ACCEPTANCE_URL='postgresql://...' \
POSTGRES_ACCEPTANCE_CONFIRM='I_UNDERSTAND_THIS_DATABASE_IS_FOR_TESTING' \
npm run accept:postgres
```

不要对生产库直接运行 acceptance 脚本；它会写入验收数据。生产库只通过 release gate 做连接、迁移和验收记录检查。

## 微信正式验收

工具链已锁定，但**真实官方 preview 和真机还没通过**。正式验收需要在安全 CI Secrets 中配置 AppID/代码上传私钥，并设置微信上传 IP 白名单。不要把私钥/AppSecret 发到聊天或提交仓库。

```bash
npm run build
npm run accept:wechat-preview
npm run accept:wechat-device
```

真机要求 iOS + Android 两端均保存可追溯证据，详见 `docs/WECHAT_DEVICE_ACCEPTANCE.md`。

## 发布门禁

```bash
node scripts/release-gate.mjs
```

只有以下条件都满足，门禁才会继续进入供应商/现场验收阶段：

- 生产 pg/mqtt lock 完整；
- PostgreSQL 16 兼容性证据存在；
- 微信官方工具 lock 完整；
- 真实微信 preview 二维码/结果存在；
- iOS + Android 双端真机验收通过；
- 生产配置完整；
- 目标 PostgreSQL 可连接且 migration 004 已应用；
- 最近存在真实 AI、微信、短信送达通过记录。

当前候选包的 release gate **预期为 blocked**，原因是没有真实微信 preview/真机/生产凭据。这是正确行为，不是测试失败。

## 凭据规则

复制 `.env.example` 只作为字段模板。程序不会自动读取 `.env`。生产环境用 Secret Manager、CI Secrets 或服务管理器环境变量；不要提交：`.env`、AppSecret、API Key、数据库密码、微信上传私钥、IVY 密钥。

## 阅读顺序

`docs/DELIVERY_MANIFEST.md` → `docs/ARCHITECTURE.md` → `docs/API.md` → `docs/DATABASE.md` → `docs/CLIENT_PARITY.md` → `docs/OPERATIONS_MEDIA_POI.md` → `docs/IVY_PROTOCOL.md` → `docs/DEPLOYMENT.md` → `docs/SECURITY.md` → `docs/TESTING.md` → `docs/OPERATIONS.md` → `docs/HANDOFF.md` → `docs/KNOWN_LIMITATIONS.md` → `docs/PHASE_4_4_STATUS.md`。
