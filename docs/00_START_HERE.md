# 00 · 先读这里（项目负责人 / 新研发团队）

## 修复更新（2026-09-20）

R1～R6 已完成代码修复并新增回归测试，详见 [修复验收记录](REVIEW_FIXES_2026-09-20.md)。先前审查结论保留为缺陷基线，不再代表当前代码仍未修复。真实微信双端、供应商接口、正式短信和目标生产部署验收仍需现场完成。


## 2026-09-20 审查与研发接手更新

请先阅读 [研发接手与登录联调指南](DEVELOPER_GUIDE.md) 和 [PR #1 审查修复清单](CODE_REVIEW_2026-09-20.md)。审查基线为 `f932e6c`，现有 CI 通过仍发现 **4 个 P1、2 个 P2**，已完成代码修复。随后已完成 R1～R6 修复；线上账号配置和生产验收仍未完成。

联调手机号、固定测试验证码、后台初始授权、首次数据导入、预览地址核验和验收清单统一在研发指南维护。

当前统一候选版本：**v4.4.0-rc.1**。

这是一个完整的城市旅游巴士数字化产品工程，不是单独 H5，也不是单独后台。正式组成如下：

| 模块 | 正式目录 | 作用 |
|---|---|---|
| 微信原生小程序 | `apps/weapp-native/` | 游客微信端，19 个原生页面 |
| 游客 H5 | `apps/h5/` | 游客浏览器端 |
| 运营管理后台 | `apps/admin/` | 内容、用户、媒体、POI、AI 运营 |
| 统一 API | `apps/api/` | 三端统一 `/api/v1` 服务 |
| 公交常驻 Worker | `apps/transit-worker/` | IVY HTTP/MQTT 同步与实时数据处理 |
| 业务核心 | `packages/core/` | 用户、内容、发布、AI、运营、公交业务规则 |
| 数据库 | `packages/storage/` | PostgreSQL/SQLite 适配、Repository、001～005 migration |
| API 契约 | `packages/contracts/` | 三端共享的接口契约与类型 |
| 内容基线 | `packages/content/` | 已迁移的参考内容模型 |
| IVY 协议 | `packages/ivy/` | 签名、AES、事件、MQTT、同步 |
| 部署配置 | `deploy/` | PostgreSQL/MQTT 运行依赖、微信官方工具链、Nginx/Systemd 示例 |
| 自动化脚本 | `scripts/` | build/check/migrate/publish/release gate/验收 |
| 测试 | `tests/` | API、业务、持久层、微信、媒体、IVY 测试 |
| 说明文档 | `docs/` | 架构、接口、三端映射、运维、交接、已知限制 |
| 验收证据 | `audit/` | 自动测试与真实 PostgreSQL/微信工具链证据 |

## 一句话架构

```text
微信原生小程序 ─┐
游客 H5        ├──> /api/v1 ──> Core Services ──> PostgreSQL
运营后台       ┘                         │
                                        └──> Transit Worker ──> IVY HTTP/MQTT
```

三个前端不应各自维护业务数据；正式数据以统一后端和 PostgreSQL 为事实来源。

## 已经真实验证的部分

- `npm run build`：通过。
- `npm run check`：通过。
- Node 自动回归：**76/76 通过**。
- 媒体处理：**5/5 通过**。
- PostgreSQL 16 CI：真实执行 migration、1/5/21/4/9 内容导入、草稿隔离和发布回读，**通过**。
- 生产运行依赖：`pg 8.16.3`、`mqtt 5.10.4` 已锁定。
- 微信官方工具：`miniprogram-ci 2.1.31` 已在 GitHub CI 安装、锁定、版本检查通过。

## 仍然需要现场/真实凭据完成的部分

以下项目**不能用模拟结果替代**：

1. 微信真实 AppID + 上传私钥 + 官方 IP 白名单后的 preview/upload；
2. iOS + Android 微信真机；
3. 正式短信网关的真实手机收码；
4. DeepSeek/Kimi 真实 Key 的模型调用；
5. IVY Bus 正式 appKey/appSecret/encodingAESKey/host/MQTT/线路映射；
6. 客户最终生产 PostgreSQL 环境的 release gate。

## 推荐阅读顺序

1. `README.md`
2. `docs/00_START_HERE.md`
3. `docs/REPOSITORY_STRUCTURE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/API.md` / `docs/openapi.json`
6. `docs/CLIENT_PARITY.md`
7. `docs/OPERATIONS_MEDIA_POI.md`
8. `docs/OPERATIONS.md`
9. `docs/HANDOFF.md`
10. `docs/KNOWN_LIMITATIONS.md`
11. `docs/PHASE_4_4_STATUS.md`

## 正式入口约定

- 小程序：**只认 `apps/weapp-native/`**。
- H5：`apps/h5/`。
- 管理后台：`apps/admin/`。
- 后端：`apps/api/` + `packages/core/` + `packages/storage/`。
- 实时公交采集：`apps/transit-worker/` + `packages/ivy/`。

旧 `apps/weapp/` 仅是历史兼容基线，不属于本 release 分支的正式交付入口；新团队不要在它上面继续开发。

