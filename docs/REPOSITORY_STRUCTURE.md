# GitHub 仓库结构与责任边界

## 1. applications

### `apps/weapp-native/` — 微信原生小程序

正式微信游客端。使用微信原生页面、WXML/WXSS/TypeScript，统一通过 `services/api.ts` 访问 `/api/v1`。微信登录、手机号能力、收藏、会员、权益、活动、消息、反馈都在此端完成展示和用户交互。

### `apps/h5/` — 游客 H5

浏览器游客端。负责首页、实时公交、漫游内容、地点/攻略、账户与用户服务。H5 不保留另一套业务内容；正式内容来自同一 `/api/v1/content`。

### `apps/admin/` — 运营管理后台

面向运营人员。当前覆盖工作台、内容管理、用户服务、会员权益、活动、媒体素材、POI 候选、AI 运营提案、人员角色等能力。后台编辑写入草稿，发布动作单独执行。

### `apps/api/` — 统一后端入口

三端统一 HTTP API。自身尽量保持薄层，业务规则下沉 `packages/core/`，数据库下沉 `packages/storage/`。

### `apps/transit-worker/` — 常驻公交采集服务

独立常驻进程。负责 IVY 基础数据同步、MQTT 实时事件消费、租约、防重、线路发布等。没有 IVY 凭据时应处于 `not_configured`，禁止伪造车辆/ETA。

## 2. packages

### `packages/core/`

核心业务服务：认证、用户、后台、内容发布、AI 助手、媒体/POI 运营、集成验证、公交状态。

### `packages/storage/`

事实数据层：

- PostgreSQL：正式环境；
- SQLite：本地/自动测试；
- `schema.sql` + `migrations/002..005`；
- repository / transaction / locking。

正式环境 PostgreSQL 连接失败时不得静默降级 SQLite。

### `packages/contracts/`

API/运行时契约、校验与类型定义。用于避免 H5、小程序和后端形成三套字段解释。

### `packages/content/`

当前迁移后的参考内容模型。它是迁移/验收来源，不是前端隐藏 fallback。

### `packages/ivy/`

IVY Bus 接入协议实现：签名、AES、HTTP、MQTT、事件、坐标、同步。

### `packages/client-core/` / `packages/design/`

client-core 的纯函数生成 H5 ESM 和正式微信 CJS（首页、地图、坐标、站点匹配）。design 令牌生成 H5 CSS；原生 WXSS 独立维护。

## 3. deploy

- `deploy/integrations/`：生产 `pg` / `mqtt` 的独立依赖与 lock；
- `deploy/wechat-ci/`：官方微信 `miniprogram-ci` 隔离工具链；
- `deploy/systemd/`：API/Worker 服务示例；
- `deploy/nginx.conf.example`：反向代理示例；
- `deploy/*.example.json`：不含真实密钥的配置模板。

## 4. scripts

工程动作均脚本化，包括：build、check、migration、内容发布、PostgreSQL acceptance、微信 preview、真机证据检查、release gate。

## 5. tests / audit

`tests/` 是可重复执行的验证逻辑；`audit/` 是当前候选版本产生的证据。两者不能混为一谈：测试代码存在不代表测试已运行，真实通过结果应在 audit/CI 中可追溯。

## 6. 文档与所有权

- 架构决定：`docs/ARCHITECTURE.md`
- 接口：`docs/API.md`、`docs/openapi.json`
- 三端映射：`docs/CLIENT_PARITY.md`
- 媒体/POI：`docs/OPERATIONS_MEDIA_POI.md`
- 微信真机：`docs/WECHAT_DEVICE_ACCEPTANCE.md`
- 运维：`docs/OPERATIONS.md`
- 交接：`docs/HANDOFF.md`
- 限制：`docs/KNOWN_LIMITATIONS.md`

## 7. Git 分支约定

当前统一候选：`release/v4.4.0-rc1`。

该 release 分支用于“可交接的同一版本”而非日常实验。新的功能开发应使用 feature 分支，经过 build/check/test/验收后再合并。不得把生产 secret、微信上传私钥、短信 token、AI key、IVY secret 提交到任何分支。

## 8. 清理范围

旧 apps/weapp 客户端、其专用样式编译器、未引用的旧 AuthService 和重复交接材料已删除。只维护 apps/weapp-native 的 19 页正式入口。已有数据库迁移和历史表保留，升级不删除业务数据。dist 由构建重建，不提交；本地检查写入 audit/local，最终结果以对应 commit 的 CI 为准。
