# v4.4.0-rc.1 交付状态

版本定位：**完整工程候选（Release Candidate）**，用于统一源码、联调、验收和后续生产发布；不是最终生产上线签字版。

## 已进入同一仓库

- 微信原生小程序
- 游客 H5
- 运营管理后台
- 统一 HTTP API
- Transit Worker
- 用户认证 / Session / RBAC
- 内容、线路、站点、POI、攻略、首页、活动、权益、媒体
- 客服/消息/用户服务
- AI 运营提案基础能力
- PostgreSQL / SQLite 持久层及 migration 001～006
- IVY 协议适配
- OpenAPI、部署、运维、测试、审计、交接文档
- GitHub Actions 生产数据库和微信工具链门禁

## 当前代码基线

- Branch：`release/v4.4.0-rc1`
- Version：`4.4.0-rc.1`
- 正式小程序：`apps/weapp-native/`
- H5：`apps/h5/`
- 管理后台：`apps/admin/`
- 后端 API：`apps/api/`
- 实时公交：`apps/transit-worker/`
- 数据库：`packages/storage/`

## 已验证但不可替代现场验收

自动构建、静态检查、Node 测试、PostgreSQL 兼容、生产依赖锁、微信官方工具链均有 CI/审计文件；真实微信上传/真机、正式短信送达、真实 AI Key、IVY 现场接口仍按 `docs/LIVE_ACCEPTANCE.md` 单独验收。

## 交付原则

代码、数据库、文档、测试和 CI 必须对应同一 commit。任何后续修改都应从本分支/合并后的主干继续，不再以旧 zip 或临时站点作为开发基线。
