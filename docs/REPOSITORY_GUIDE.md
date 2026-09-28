# v4.4 仓库导航

这是南充嘉陵江城市漫游的单仓库交付。正式开发只认本分支及其后续合并版本，不再从历史 zip / AppDeploy 页面猜代码基线。

## 三端

| 产品端 | 正式目录 | 说明 |
|---|---|---|
| 微信原生小程序 | `apps/weapp-native/` | 唯一正式小程序源码，TypeScript + WXML + WXSS |
| 游客 H5 | `apps/h5/` | 游客 Web/H5，统一读取 `/api/v1` |
| 运营管理后台 | `apps/admin/` | 内容、活动、媒体、用户服务、审核发布、RBAC |

`apps/weapp/` 只保留历史兼容资产，不再作为正式开发入口。

## 后端

| 模块 | 目录 | 责任 |
|---|---|---|
| 统一 HTTP API | `apps/api/` | 三端接口、鉴权、内容发布、用户业务 |
| 实时公交 Worker | `apps/transit-worker/` | IVY HTTP/MQTT 同步和实时状态 |
| 核心业务 | `packages/core/` | Auth、用户、内容、AI、运营业务规则 |
| API 契约 | `packages/contracts/` | 运行时校验、共享接口契约 |
| 数据持久层 | `packages/storage/` | PostgreSQL/SQLite、migration、repository |
| IVY 适配 | `packages/ivy/` | 签名、AES、HTTP/MQTT、同步 |
| 共享前端规则 | `packages/client-core/` | H5/小程序共用路由、首页、地图纯函数 |

## 数据库

数据库源码唯一维护在 `packages/storage/`，不要再复制第二份 schema。快速入口见根目录 `database/README.md`。

## 部署/依赖

- `deploy/integrations/`：生产 PostgreSQL / MQTT 固定依赖
- `deploy/wechat-ci/`：官方 miniprogram-ci 工具链
- `.github/workflows/`：构建、PostgreSQL、微信 preview/toolchain、release package 等 CI
- `.env.example`：环境变量模板，不含任何真实 Secret

## 文档阅读顺序

1. `README.md`
2. `docs/00_START_HERE.md`
3. 本文件
4. `docs/ARCHITECTURE.md`
5. `docs/API.md`
6. `docs/DATABASE.md`
7. `docs/DEPLOYMENT.md`
8. `docs/HANDOFF.md`
9. `docs/LIVE_ACCEPTANCE.md`

## 版本原则

- `release/v4.4.0-rc1` 是当前完整候选分支。
- 未经过 release gate 和真实外部验收，不称“生产上线完成”。
- 任何 Secret、私钥、短信 AccessKey、微信 AppSecret 均不得提交仓库。
