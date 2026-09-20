# PR #1 代码审查与修复验收清单

审查日期：2026-09-20。基线：`f932e6c4522a08159b929e7b147919db7b368b8a`。PR：[Release/v4.4.0 rc1](https://github.com/targetswang/nccitybus/pull/1)。

**建议修改后再合并。本文档不是修复完成报告。** 首轮发现 R1～R5，整理登录指南时补充发现并验证 R6。以下均未在本次文档提交中修复。

## 证据范围

- 基线 PR 含 383 个变更文件；重点审查鉴权、权限、内容编辑/发布、数据层及客户端登录衔接，非全部页面穷尽验收。
- GitHub 基线提交的 4 项 PR CI 成功：Core engineering checks、生产运行依赖验证、PostgreSQL 兼容验收、微信官方工具链验证。
- 本地 Node 24.19.0 / SQLite：既有 tests/unified-platform.test.mjs 的 8 项测试通过，另作定向复现。此环境用于定位，不代替项目规定的 Node 22.16.x 验收。
- 既有仓库记录 76 项 Node / 5 项媒体测试通过；本次没有重新运行完整套件、PostgreSQL 复现或微信真机。
- R1/R2/R4/R5 已通过服务与数据库调用复现；R3 已复现发布结果及审核失败，并核对生产 HTTP 拒绝逻辑；R6 已通过实际 HTTP 请求对照 401/200。
- CI 成功不代表以下业务场景已被覆盖。修复后须增加相应回归证据。

## 问题总表

| ID | 优先级 | 问题 | 建议负责方向 | 状态 |
|---|---|---|---|---|
| R1 | P1 | 验证码错误次数被事务回滚 | 后端 / 认证 | 待修复、待认领 |
| R2 | P1 | 管理员旧会话不受降权/禁用影响 | 后端 / RBAC | 待修复、待认领 |
| R3 | P1 | 后台发布切换为生产不接受的 reference | 后端 / 内容发布 | 待修复、待认领 |
| R4 | P2 | offline 状态丢失，保存为 active | 后端 / 内容编辑 | 待修复、待认领 |
| R5 | P2 | 站点 revision 返回值与数据库不一致 | 后端 / 数据库 | 待修复、待认领 |
| R6 | P1 | 游客客户端 session/token 字段不一致 | H5 + 小程序 + API | 待修复、待认领 |

P1：应优先修复并阻止按当前状态交付生产；P2：影响核心运营正确性，交付前应完成。人员、日期由研发负责人认领后填写。

## R1 · 验证码失败次数未持久化

位置：[auth-unified.mjs](../packages/core/auth-unified.mjs) 基线第 75～78 行；关联 [database.mjs](../packages/storage/database.mjs) 的事务回滚。

触发：对同一有效 challenge 连续提交错误验证码。attempts 增加后在事务内抛 OTP_INVALID，SQLite/PostgreSQL 事务包装器均会回滚整个事务。

复现结果：错误 6 次后 attempts=0；随后正确的 246810 仍被接受。因此不是验证码值有误，而是单挑战 5 次限制失效；接口其他限流不等于该限制有效。

修复建议：在持有挑战锁时记录并提交失败计数，再在事务外返回认证失败；保留并发控制、一次性消费及过期校验。

验收：
- [ ] 第 1～5 次失败均持久化，之后包括正确码也不接受该挑战。
- [ ] 并发错误请求不能绕过次数上限；成功消费后不可重放。
- [ ] SQLite 与 PostgreSQL 均通过；正式短信模式不受测试码影响。

## R2 · 管理员禁用/降权不影响旧会话

位置：[auth-unified.mjs](../packages/core/auth-unified.mjs) 第 98～103 行；[admin-service.mjs](../packages/core/admin-service.mjs) setStaff。

触发：管理员登录后，将其 staff_roles 改为 viewer 或 enabled=false，继续使用原 token。

复现结果：session() 仍返回 admin。代码对 s.role=admin 跳过 staff_roles 复查，旧会话可在剩余有效期（最长 8 小时）保留全部权限。

修复建议：所有后台会话均核验当前角色/启用状态；角色变化时可同时撤销旧会话。另检查初始管理员引导逻辑，避免禁用后因 INITIAL_ADMIN_PHONE_HASH 再次自动恢复管理员。

验收：
- [ ] 降权后原 token 不能执行原管理员操作。
- [ ] 禁用后原 token 访问后台被拒绝。
- [ ] 初始管理员、普通工作人员、游客 audience 分别覆盖。
- [ ] 不能通过重新登录意外恢复已撤销权限。

## R3 · 后台发布破坏生产可读性

位置：[server.mjs](../apps/api/server.mjs) 第 214、363～365 行；[content-service.mjs](../packages/core/content-service.mjs) 第 55～57 行；[repository.mjs](../packages/storage/repository.mjs) publishCatalog。

触发：规范化表有内容，运营人员点击“发布当前内容”。

复现结果：默认发布成功并切换当前快照，但 publication=reference；生产 /api/v1/content 要求 approved，随后返回 503 CONTENT_NOT_APPROVED。直接调用 publish({approved:true}) 也因缺少顶层 approval 而抛 INVALID_PAYLOAD。

修复建议：建立可追溯审核记录并带入 release，完整校验顶层审核、POI/攻略及媒体；验证通过后原子切换当前版本。禁止通过把 production 改 development 或去掉审核校验解决。

验收：
- [ ] 审核不足时发布失败，原 approved 线上版本保持可读。
- [ ] 审核完成后发布成功，H5/小程序读取相同 approved 版本。
- [ ] 回滚后两端读取原版本；发布状态变化不会错误复用不可变版本号。
- [ ] 使用生产配置与 PostgreSQL 复测，不能只验证开发 reference 流程。

## R4 · 下架状态丢失

位置：[content-service.mjs](../packages/core/content-service.mjs) 第 9、42～45 行。

触发：save('pois', id, {status:'offline'}, {expectedRevision})。

复现结果：merge 删除 status，pickStatus(undefined) 返回 active；读取仍为 active。相同状态处理也涉及攻略及其他可编辑内容类型，已有 offline 内容再次编辑也可能恢复为 active。

修复建议：状态独立校验和写入；未传状态时保留数据库原值，避免把 absent 当作 active。

验收：
- [ ] 保存 offline 后数据库为 offline；发布后游客端不再展示。
- [ ] 编辑已下架条目的文本不会自动上架。
- [ ] 下架被攻略引用的 POI 时有明确依赖处理，不能发布悬空引用。

## R5 · 站点版本号未持久化

位置：[content-service.mjs](../packages/core/content-service.mjs) 第 40、44～46 行；[002_unified_platform.sql](../packages/storage/migrations/002_unified_platform.sql) tourism_nodes。

触发：读取站点 revision=1，保存后再次读取。

复现结果：保存返回 revision=2，读取仍为 1。该表没有对应持久化 revision，更新语句也不递增；旧版本提交可能覆盖他人更新，按返回版本提交又可能误报冲突。

修复建议：新增增量迁移为站点提供 revision，统一读取/更新/审计语义；已部署数据库不能只改历史 migration 002。

验收：
- [ ] 保存前后版本一致递增。
- [ ] 两人从相同版本编辑，后提交者得到 409，先提交者结果不丢失。
- [ ] 已存在的 SQLite/PostgreSQL 数据库迁移可升级，保留原数据。

## R6 · 游客登录后发送了空令牌

位置：[visitor.mjs](../apps/h5/src/services/visitor.mjs) refresh/perform/logout；[session.ts](../apps/weapp-native/services/session.ts) readProfile；关联 [api.ts](../apps/weapp-native/services/api.ts) 和 [auth-unified.mjs](../packages/core/auth-unified.mjs) issueSession。

触发：验证码或微信登录返回 {token, expiresAt, user} 后，客户端保存原响应，却读取 session.session 或 s.session 作为 _session。

复现结果：对真实本地 API 发送 {_session:login.session} 得 401；同一登录响应改为 {_session:login.token} 得 200。H5 请求层没有字段转换。后台使用 token，不属于这一游客端字段问题。

影响：账户读取、需登录的用户动作及服务端注销；界面显示已登录不代表请求携带有效令牌。

修复建议：统一两端会话结构为 token，检查所有读取、请求和注销调用；根据需要清理旧缓存。不要仅在登录成功页面做显示修补。

验收：
- [ ] H5 / 原生小程序登录后账户查询成功。
- [ ] 收藏、反馈等用户动作能落库并回读。
- [ ] 退出登录后原 token 被服务端撤销。
- [ ] 不同 audience 及过期 token 仍被拒绝。
- [ ] 验证码登录和微信手机号登录分别覆盖，包含手机端与 PC H5。

## 修复提交记录（接手团队填写）

| ID | 执行人 | 修复 commit | 回归证据 | 复审结果 |
|---|---|---|---|---|
| R1 | 待认领 | — | — | 未关闭 |
| R2 | 待认领 | — | — | 未关闭 |
| R3 | 待认领 | — | — | 未关闭 |
| R4 | 待认领 | — | — | 未关闭 |
| R5 | 待认领 | — | — | 未关闭 |
| R6 | 待认领 | — | — | 未关闭 |

仅在修复提交与相应用例均可追溯时关闭问题。联调账号和启动步骤见 [研发指南](DEVELOPER_GUIDE.md)。
