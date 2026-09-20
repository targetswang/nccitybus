# 新团队接手清单与验收口径

## 修复更新（2026-09-20）

R1～R6 已完成代码修复并新增回归测试，详见 [修复验收记录](REVIEW_FIXES_2026-09-20.md)。先前审查结论保留为缺陷基线，不再代表当前代码仍未修复。真实微信双端、供应商接口、正式短信和目标生产部署验收仍需现场完成。


## 2026-09-20 审查与研发接手更新

请先阅读 [研发接手与登录联调指南](DEVELOPER_GUIDE.md) 和 [PR #1 审查修复清单](CODE_REVIEW_2026-09-20.md)。审查基线为 `f932e6c`，现有 CI 通过仍发现 **4 个 P1、2 个 P2**，已完成代码修复。随后已完成 R1～R6 修复；线上账号配置和生产验收仍未完成。

联调手机号、固定测试验证码、后台初始授权、首次数据导入、预览地址核验和验收清单统一在研发指南维护。

> 当前候选：**v4.4.0-rc.1**。正式微信入口 `apps/weapp-native/`，H5 `/`，运营后台 `/admin/`，统一后端 `/api/v1`。

## 无需聊天记录的接手顺序

DEVELOPER_GUIDE → CODE_REVIEW_2026-09-20 → README → ARCHITECTURE → API/OpenAPI → CLIENT_PARITY → OPERATIONS_MEDIA_POI → IVY_PROTOCOL → OPERATIONS → KNOWN_LIMITATIONS → PHASE_4_4_STATUS → audit。

## 当前源码范围

本仓库已经包含：

- H5、运营后台、19 页微信原生小程序源码；
- 统一 API、用户/认证/RBAC、内容、媒体、POI 候选、AI 提案、用户服务；
- PostgreSQL/SQLite 持久层与 001～005 migration；
- IVY HTTP/MQTT Worker 与协议实现；
- `pg 8.16.3`、`mqtt 5.10.4` 生产 lock；
- `miniprogram-ci 2.1.31` 官方微信构建工具 lock；
- 构建、测试、PostgreSQL acceptance、微信 preview、真机证据检查和 release gate；
- 不包含任何真实生产密钥。

## 当前验证层次

| 层次 | 当前真实状态 |
|---|---|
| Build / static check | 通过 |
| Node 业务/API/持久层 | 76/76 通过 |
| 媒体本地处理 | 5/5 通过；不等于版权/地点匹配人工核验 |
| PostgreSQL 16 | GitHub CI 实跑通过：migration + 1/5/21/4/9 + 草稿隔离 + 发布回读 |
| pg/mqtt 生产依赖 | 已生成真实 transitive lock；目标运行环境仍需 `npm ci` |
| 微信官方 toolchain | `miniprogram-ci 2.1.31` 安装/锁定/版本检查通过 |
| 微信官方 preview | **未运行**：缺 AppID/上传私钥/IP 白名单 |
| iOS + Android 真机 | **未运行**：缺真实设备验收证据 |
| AI 真实模型 | 代码具备验证入口；目标密钥尚未配置，未形成 live passed 记录 |
| 正式短信 | 生产适配与“两段式送达”已实现；未用现场手机号形成 live passed 记录 |
| IVY Bus | 协议/Worker/测试已实现；真实 HTTP/MQTT/线路映射/现场未通过 |
| 目标生产 PostgreSQL | PostgreSQL 16 兼容性已证明；客户最终数据库仍需 release gate |

## 三端统一性验收

内容修改必须按下面链路验收，而不是看三个页面“长得一样”：

```text
后台编辑 POI/首页/攻略
  -> normalized DB draft + revision history
  -> 游客发布版本不变化
  -> publisher 显式发布
  -> immutable release 变更
  -> H5 / 微信小程序读取同一 /api/v1/content 版本
```

用户服务也必须端到端：

```text
H5/小程序登录
  -> user/session
  -> 收藏/会员/权益/报名/反馈
  -> 后台用户服务读取
  -> 客服公开回复
  -> 用户端消息/工单回读
```

## 媒体与 POI 运营

媒体不可因为 URL 可访问就自动发布。必须记录使用依据和地点匹配；只有确认且本地化处理后的 SHA-256 WebP 才能设封面。POI 自动采集只生成候选，人工审核→导入草稿→显式发布。

## 每次合并门禁

```bash
npm run build
npm run check
npm test
python tests/media_test.py
```

正式候选增加：

```bash
node scripts/release-gate.mjs
```

release gate 返回 blocked 时必须看具体原因，不能通过删除检查、伪造 JSON 或用测试码来放行。

## 微信真机验收

必须两个平台都通过：iOS + Android。至少覆盖：启动、wx.login、手机号授权、统一内容读取、收藏往返、反馈/客服往返、导航、网络失败/重试。证据格式和模板见 `docs/WECHAT_DEVICE_ACCEPTANCE.md` 与 `deploy/wechat-device-acceptance.template.json`。

## 安全边界

- 微信上传私钥、AppSecret、AI Key、短信 Token、IVY Secret 只进入 Secret 管理设施。
- live verification 数据库记录只保存脱敏结果，不保存 secret/token/验证码。
- 微信 `miniprogram-ci` 是隔离构建工具；当前它的传递依赖审计存在高/严重问题，原始报告已保留，不能把工具链“能跑”解释成“安全扫描通过”。
- 生产 API/H5/小程序运行时不依赖 `miniprogram-ci`。

## GitHub 当前工程事实

隔离分支 `delivery/full-system-20260920` 已真实执行 PostgreSQL 16 acceptance、pg/mqtt lock 验证、微信官方 toolchain 安装/锁定验证。正式发布前仍需把最终候选 commit 与本交接包完全对齐，并由接手团队在目标环境重跑门禁。

