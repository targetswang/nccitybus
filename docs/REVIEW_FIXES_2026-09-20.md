# PR #1 六项审查问题修复验收记录

日期：2026-09-20。修复基于文档提交 ce7d137（审查代码基线 f932e6c），提交在 release/v4.4.0-rc1 / PR #1。原始问题及复现保留在 [审查清单](CODE_REVIEW_2026-09-20.md)。

## 已实现

| 问题 | 修复行为 | 自动回归 |
|---|---|---|
| R1 OTP 失败计数 | 在挑战事务提交失败计数后返回错误；并发共享挑战锁，5 次失败后失效 | 并发 8 次错误实际累计 5 次；正确码也拒绝；新挑战可用且不能重放 |
| R2 管理员撤权 | 包括 admin 在内的后台会话逐次读取当前角色和 enabled；已有禁用记录不能通过初始管理员配置恢复 | 原 token 降为 viewer 权限；禁用后拒绝；再次登录不恢复 |
| R3 发布 | 后台需确认整批事实核验及依据，携带精确预览版本；服务端记录审核人/时间，保留媒体校验；禁止 reference 覆盖 approved | HTTP 正式模式发布/读取、旧预览拒绝、缺依据/未授权媒体拒绝、旧版保留、回滚 |
| R4 下架 | 状态独立校验和落库；未提交状态保留原值；后台新增上架/下架选择 | 下架后编辑文本不恢复上架；发布剔除下架 POI；悬空攻略引用拒绝发布 |
| R5 站点版本 | 新增 migration 005，站点 revision 落库递增；旧版本编辑返回 409 | 双编辑者只有一个成功；重复 migrate 无损；004 已有数据升级保留 |
| R6 游客会话 | H5、正式小程序统一使用 token；拒绝无 token 缓存；小程序退出请求服务端注销，失败可重试 | 实际 H5 hook/转译后小程序服务通过 HTTP 完成账户、收藏、反馈、注销；旧 token 失效 |

## 本地结果

使用项目指定 Node.js **22.16.0**，根依赖由 npm ci 安装。

- npm run build：通过。
- npm run check：通过，含正式小程序 TypeScript 和本地文档链接检查。
- Node 全套：**84/84 通过**，含本轮新增 8 项回归。
- python tests/media_test.py：**5/5 通过**。
- 原始证据：[Node TAP](../audit/review-fixes/node22-tests.tap)、[静态检查](../audit/review-fixes/static-check.json)、[媒体测试](../audit/review-fixes/media-tests.json)。

回归源码：tests/review-regressions.test.mjs、tests/review-client-session.test.mjs。

## PostgreSQL 与 CI

PostgreSQL workflow 已增加同一后端回归文件在独立 PostgreSQL 16 验收数据库上的执行，日志随 audit/postgres 上传为 CI artifact。REVIEW_POSTGRES_URL 只允许指向专用测试库；脚本有明确确认环境变量，测试会清理验收表，不能对生产库运行。

本地本轮使用 SQLite。远程 CI 结果以 PR Checks 对应提交为准；文档编写时尚未把远程执行结果当作已通过。旧 004 数据升级的定向用例在 SQLite 执行，PostgreSQL 由真实迁移和业务回归进一步验证。

## 升级和剩余边界

1. 备份数据库，更新源码，运行 npm run db:migrate 应用 005，再构建并重启。不要重复导入参考数据覆盖运营草稿。
2. 后台发布审核是操作者对当前批次内容的明确确认，不会因为构建/测试成功自动审核素材或内容。
3. 联调手机号和验证码见 [研发指南](DEVELOPER_GUIDE.md)，本轮未修改指定测试码 246810，未配置远程账号。
4. 本轮不等于在线部署、微信官方编译/双端真机、正式短信真实送达或 IVY 现场验收。客户端测试使用真实 HTTP 后端及受控的 React/wx 宿主，不能代替浏览器视觉验收或微信真机。
