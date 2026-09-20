# v4.4.0-rc.1 交付清单

本文件定义本 release 分支的正式交付边界。缺少下列任一正式模块，都不能称为完整工程交付。

## 1. 正式客户端

| 客户端 | 目录 | 说明 | 正式性 |
|---|---|---|---|
| 微信原生小程序 | `apps/weapp-native/` | 19 个原生页面，统一调用 `/api/v1` | 正式 |
| 游客 H5 | `apps/h5/` | 首页、实时公交、漫游、地点、攻略、用户中心 | 正式 |
| 运营管理后台 | `apps/admin/` | 内容、用户、会员权益、媒体、POI、AI、角色 | 正式 |
| 历史微信基线 | `apps/weapp/` | 仅用于历史兼容和回归对照 | 非正式入口 |

## 2. 服务端

| 服务 | 目录 | 说明 |
|---|---|---|
| 统一 API | `apps/api/` | H5 / 小程序 / 后台统一 HTTP 入口 |
| 公交 Worker | `apps/transit-worker/` | IVY HTTP/MQTT 同步、事件消费、租约、防重 |
| 核心业务 | `packages/core/` | Auth、User、Content、Admin、AI、Operations、Transit |
| 数据层 | `packages/storage/` | PostgreSQL/SQLite、migration、repository、事务 |
| 接口契约 | `packages/contracts/` | API 契约、校验和共享类型 |
| IVY 协议 | `packages/ivy/` | 签名、AES、HTTP、MQTT、坐标、同步 |

## 3. 数据库与内容

- `packages/storage/schema.sql`
- `packages/storage/migrations/002_unified_platform.sql`
- `packages/storage/migrations/003_ai_operations.sql`
- `packages/storage/migrations/004_operations_media_discovery.sql`
- `packages/content/catalog.reference.json`

当前 PostgreSQL 16 验收基线：1 条线路、5 个站点、21 个 POI、4 条攻略、9 个攻略步骤。

## 4. 部署与生产依赖

- `deploy/integrations/`：`pg 8.16.3` + `mqtt 5.10.4` 独立 lock。
- `deploy/wechat-ci/`：`miniprogram-ci 2.1.31` 隔离工具链及 lock。
- `deploy/systemd/`：API / Worker systemd 示例。
- `deploy/nginx.conf.example`：Nginx 示例。
- `.env.example` / `deploy/*.example.json`：仅字段模板，不含密钥。

## 5. 工程与验收

- `scripts/`：build、check、migration、publish、PostgreSQL acceptance、微信 preview、真机证据检查、release gate。
- `tests/`：Node 业务/API/存储/IVY/微信测试 + Python 媒体处理测试。
- `audit/`：当前候选版本实际运行的验收证据。
- `.github/workflows/`：CI、PostgreSQL 16、微信工具链、微信 preview 门禁。

## 6. 当前外部阻塞

以下项目需要真实凭据或设备，不能用模拟结果替代：

1. 微信真实 AppID + 上传私钥 + IP 白名单后的官方 preview/upload；
2. iOS / Android 微信真机；
3. 正式短信实际送达；
4. DeepSeek/Kimi 真实 Key 调用；
5. IVY Bus 正式 appKey/appSecret/encodingAESKey/host/MQTT/线路映射；
6. 目标生产 PostgreSQL 的最终 release gate。
