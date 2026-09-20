# 部署说明

## 1. 运行角色

生产环境至少包含两个 Node 进程：

- API：`node apps/api/main.mjs`
- Transit Worker：`node apps/transit-worker/main.mjs`

H5 与后台由构建结果静态托管；微信小程序通过官方开发者工具 / `miniprogram-ci` 进行 preview/upload。

## 2. 环境要求

- Node.js 22.16.x
- PostgreSQL 16（正式环境）
- Nginx（建议）
- systemd 或等价进程管理器

生产运行依赖单独安装：

```bash
cd deploy/integrations
npm ci --ignore-scripts --no-audit --no-fund
```

## 3. 构建

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run check
npm test
```

正式环境还必须执行 production configuration / release gate，不得只凭本地 build 成功上线。

## 4. 数据库

```bash
npm run db:migrate
```

正式环境必须显式配置 PostgreSQL。连接失败不得降级 SQLite。

PostgreSQL compatibility acceptance 仅用于专用测试库：

```bash
POSTGRES_ACCEPTANCE_URL='postgresql://...' \
POSTGRES_ACCEPTANCE_CONFIRM='I_UNDERSTAND_THIS_DATABASE_IS_FOR_TESTING' \
npm run accept:postgres
```

不要对正式生产库运行 acceptance 脚本。

## 5. Nginx / systemd

参考：

- `deploy/nginx.conf.example`
- `deploy/systemd/nanchong-api.service`
- `deploy/systemd/nanchong-worker.service`

部署时根据实际域名、目录、Linux 用户和 Secret 注入方式调整。

## 6. 微信

官方构建工具在 `deploy/wechat-ci/`，真实 preview 需要：

- AppID
- 上传私钥
- 微信后台允许的 CI 出口 IP

密钥不得提交仓库。完成 preview 后还需要 iOS/Android 双端真机验收。

## 7. 发布前门禁

```bash
node scripts/release-gate.mjs
```

门禁 blocked 不等于代码构建失败；当真实凭据/设备尚未完成时，blocked 是正确状态。
