# 南充嘉陵江城市漫游 · 全面代码审计报告

| 项目 | 内容 |
|---|---|
| 仓库 | `targetswang/nccitybus` |
| 审计分支 / Commit | `main` @ `14386a0`(2026-09-20,含 PR #8 线路配置合并) |
| 审计日期 | 2026-09-21 |
| 技术栈 | 原生 Node.js 22 HTTP(无框架)+ ES Modules;PostgreSQL 16(生产)/ SQLite(开发);H5 = 自研 React 运行时(无构建框架);微信小程序 = 原生 TS(19 页面);运营后台 = 单文件原生 JS;MQTT worker(IVY 巴士实时数据);**无 Redis、无支付、无 Nginx/Docker(由平台托管)** |
| 审计方式 | 人工逐文件审读为主 + 定向静态扫描(密钥模式、SQL 拼接点、`console` 输出、`_session` 通道),结合现有测试基线(98/98)与 CI 工作流交叉验证 |
| 方法论声明 | 本报告为工程安全审计(白盒),不是渗透测试、合规认证或微信官方验收 |

---

## 1. 执行摘要

整体架构**安全基线明显高于同体量项目平均水平**:全量参数化 SQL、令牌哈希入库、常量时间比较、内容版本不可变、媒体审核管线、日志字段白名单等设计到位。但 **main 分支当前缺少两批已写好、已测试、但仍在 OPEN PR 中的安全修复**,导致本报告确认了 2 项高危、4 项中危问题。其中最重要的结论是:

> **修复代码已存在,风险来自"未合并"而非"未发现"。** PR #6(Release/v4.4.0-rc1,含共享限流表、`_session` 通道移除、analytics 保留清理、favicon 修复)与 PR #4(H5 重试按钮)处于 OPEN 状态。将 PR #6 rebase 后合并即可消除本报告的 H1、M1、M2 三项发现。

| 等级 | 数量 | 编号 |
|---|---|---|
| 🔴 高危 | 2 | H1, H2 |
| 🟠 中危 | 5 | M1–M5 |
| 🟡 低危/提示 | 6 | L1–L6 |

---

## 2. 高危发现

### 🔴 H1 · 静态管理员令牌绕过全部 RBAC 与人员审计

- **文件**:`apps/api/server.mjs:189`、`packages/core/admin-token.mjs:3-9`、`packages/core/config.mjs`(ADMIN_TOKEN)
- **描述**:任何请求携带 `Authorization: Bearer <ADMIN_TOKEN>` 即以 `role:'admin', permissions:['*']` 通过,actor 被固定为 `legacy-admin-token`。该令牌**永不过期、不可撤销、无使用记录关联到人**。
- **攻击场景**:令牌出现在 CI 日志、员工离职、笔记本失窃、反向代理日志泄露任一场景下,攻击者获得永久后台最高权限,且所有操作在 `content_edit_history` 中都记在同一个假名下,无法追责。
- **修复建议**:生产环境禁用该通道(仅保留 `NODE_ENV !== 'production'` 时的联调用途);所有管理操作走 `auth.session()` 的 staff 会话路径;如需机器账号,建立 `staff_roles` 中的独立身份并参与同一套会话签发/撤销。

### 🔴 H2 · 会话令牌仍接受请求体 `_session` 通道(main 缺 PR #6 修复)

- **文件**:`apps/api/server.mjs:301,310,313`;对应客户端 `apps/h5/src/services/visitor.mjs:8,11,12`
- **描述**:`/me/query`、`/me/action`、`/auth/logout` 仍接受 `{"_session":"<token>"}` 请求体携带会话。
- **攻击场景**:令牌进入请求体会被 APM 全量 body 日志、网关访问日志、异常堆栈打印捕获;H5 的 `perform()` 把 token 拼进 `JSON.stringify([session.token, action, data])` 参与幂等签名,token 随业务数据一起落入日志的暴露面进一步放大。服务端也已升级为标准 `Authorization: Bearer` 通道,双通道并存形成迁移盲区。
- **修复建议**:合并 PR #6(移除 body 通道 + H5/小程序端切换 header),合并后增加回归断言"携带 `_session` 的请求必须 401"(PR #6 的 `tests/review-regressions.test.mjs` R7 已包含该断言)。

---

## 3. 中危发现

### 🟠 M1 · 进程内存限流,多实例/重启下失效(main 缺 PR #6 修复)

- **文件**:`apps/api/server.mjs:147-160`
- **描述**:限流计数存在 `rates = new Map()`(按 IP,60 秒窗口,上限 `RATE_PER_MINUTE`)。水平扩容时每个实例独立计数,实际阈值 = N × 1200/分钟;单实例重启即清零。PR #6 引入 `rate_limit_windows` 表(migration 006)+ `INSERT...ON CONFLICT...RETURNING` 共享计数,未合并。
- **影响场景**:短信验证码、登录、analytics 写入等敏感端点的滥用防护在多实例部署下形同虚设。
- **修复建议**:合并 PR #6;长期可再加每手机号/每事件的更细粒度配额。

### 🟠 M2 · `analytics_events` 无保留期清理,表无限增长(main 缺 PR #6 修复)

- **文件**:`packages/storage/repository.mjs:190-202`(`housekeeping()` 仅清理 `event_receipts`/`sessions`/`audit_events`)
- **描述**:`/api/v1/analytics/event`(server.mjs:316)为**未认证可写**端点,`properties_json` 允许任意 JSON(body 上限 32KB),且无保留策略。攻击者可用脚本按 1200/分钟的限流上限写入垃圾数据,存储被无限吞噬;合法数据也无合规保留边界。
- **修复建议**:合并 PR #6(housekeeping 中 `DELETE FROM analytics_events WHERE created_at < now-90d`);补充建议:`properties` 白名单字段化或限制总长度,事件写入按 IP 限流单独收紧。

### 🟠 M3 · 权益领取/活动报名容量校验存在并发竞态

- **文件**:`packages/core/user-service.mjs:86`(benefit)、`:97`(event)
- **描述**:`SELECT COUNT(*)` 校验容量后直接 `INSERT`,事务隔离为默认 READ COMMITTED,两个并发请求可同时通过校验,导致超发/超报。
- **攻击场景**:活动最后 1 个名额时,并发提交 2 个请求 → 2 人都报名成功。同时 `/api/v1/content` 的 `full` 状态由每次请求实时聚合(`publicStatus`),与真实写入量存在窗口偏差。
- **修复建议**:事务内先 `SELECT pg_advisory_xact_lock(hashtext(event_id))`(Postgres,与本项目 worker lease 同一机制)或对计数列使用 `UPDATE ... WHERE count < capacity` 原子判定;SQLite 天然串行,无需处理。

### 🟠 M4 · IVY 推送签名算法为 SHA-1 值排序(协议固有限制)+ AES-CBC IV 取密钥前缀

- **文件**:`packages/ivy/crypto.mjs:4-16`(签名)、`:42,53`(IV)
- **描述**:签名使用 `SHA1(sort([appKey, appSecret, ts, nonce, content]).join())`——非 HMAC,理论上有长度扩展/碰撞攻击面;AES-256-CBC 的 IV 固定取密钥前 16 字节,同一密钥下确定性加密,泄漏分组模式。两者均为供应商 IVY V1.2.5 协议规定(代码注释已注明 PDF 页码),属**继承性风险**。
- **影响场景**:能观测流量的攻击者在长时间窗口内可能构造/重放报文;当前有 timestamp ±5min 窗口 + timingSafeEqual 缓解重放,但无 nonce 去重。
- **修复建议**:与供应商确认升级到 HMAC-SHA256 与随机 IV 的协议版本;过渡期在 `event_receipts` 之外为 `/integrations/ivy/events` 增加 nonce 去重表(TTL 10 分钟),从架构上消除重放。

### 🟠 M5 · OTP 短信轰炸防护仅 60 秒单条限制

- **文件**:`packages/core/auth-unified.mjs:45-46`
- **描述**:`OTP_RATE_LIMIT` 只检查"上一次 challenge 创建时间 ≥ 60 秒前"。攻击者可对任一手机号**每 61 秒触发一条真实 SMS**(生产环境 `sendSms` 真发),7×24 小时约 1400 条/天,造成短信费用损失 + 对机主的骚扰,也无每日总量上限。
- **修复建议**:增加按 `phone_hash` 的 24 小时上限(如 10 条)与按 IP 的 challenge 创建配额;触发上限返回 429 并记录审计事件。

---

## 4. 低危 / 提示级发现

| 编号 | 等级 | 位置 | 问题与建议 |
|---|---|---|---|
| L1 | 🟡 | `apps/api/server.mjs:233`、`media-upload.mjs:19-26` | 图片上传后即使 rights/match 处于 `pending`,文件已写入 `var/media` 并可通过 `/media/<sha256>.webp` 公网访问。URL 含 SHA-256 不可枚举,但知道 URL 即可绕过"未审核不公开"的产品语义。建议:`/media/` 服务前检查 `match_status='confirmed'` 或给 media URL 加签名/挂临时目录。 |
| L2 | 🟡 | `apps/api/server.mjs:117-135` | CORS 白名单正确(仅命中才回显),但 **GET 类读接口对任意 Origin 均可携带 Bearer 调用**(CORS 只防浏览器,不防 curl);由于无 Cookie 会话,CSRF 面小。保持现状可接受,建议文档明示"令牌不落 Cookie"是 CORS 模型成立的前提。 |
| L3 | 🟡 | `packages/content-service.mjs:41` | `list('walks')` 对每条 walk 单独查询 steps,属 N+1;当前 N=4 无感,攻略增长后应改为 `WHERE walk_id = ANY($1)` 聚合查询。 |
| L4 | 🟡 | `packages/storage/repository.mjs:31` | `catalog()` 每请求 `JSON.parse` 完整发布目录(数百 KB 级),无进程内缓存;H5 首屏/轮询场景重复解析。建议按 `version` 做 LRU 或单版本缓存,发布时失效。 |
| L5 | 🟡 | `.github/workflows/ci.yml:6-11` | CI 的 push 触发只覆盖 `release/v4.4.0-rc1` 分支,直接 push 到 `main` 不跑检查(仅经 PR 合并时触发)。建议 push 触发扩展到 `main`,防绕过。 |
| L6 | 🟡 | `apps/api/server.mjs:441-455` | 登录失败(`OTP_INVALID`/`ADMIN_NOT_ALLOWED`)只返回 requestId,不落任何审计表,后台爆破/撞库无痕迹可查。建议失败登录写 `audit_events`(现有 30 天保留)。 |

---

## 5. 重点项逐项检查结论(12 项)

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | 登录与 token 机制、openid/session_key 处理 | ✅ **安全** | `auth-unified.mjs:86-96`:32 字节 CSPRNG token,库里只存 `sha256(token)`;会话查询带 `revoked_at IS NULL AND expires_at>now`;admin 会话每次请求实时复查 `staff_roles.enabled`(:95),撤权即时生效。`session_key` **全程未接收、未存储**(jscode2session 响应只取 openid/unionid,:106),无泄露面。openid 以 `sha256(wechat:appId:openid)` 存 `user_identities`,不带原文。 |
| 2 | 微信支付回调验签/幂等 | ➖ **不适用** | 全仓无 `requestPayment`/支付回调端点(定向扫描零命中)。当前产品无交易闭环;**未来接入时必须新建独立回调路径、验签(V3 平台证书)+ `out_trade_no` 幂等表**,不可复用现有 IVY 验签。 |
| 3 | 后台接口独立鉴权与角色校验 | ⚠️ **机制完备,唯 H1 捷径** | 所有 `/api/v1/admin/*` 在 server.mjs:187-258 统一进入鉴权块,每条路由显式 `requirePermission(...)`,staff 管理与集成验证均要求 `*`(仅 admin)。RBAC 5 角色(`auth-unified.mjs:7-16`)职责清晰。唯一例外即 H1 静态令牌。 |
| 4 | 裸 SQL 拼接 | ✅ **未发现注入** | 全仓 170 处 query;11 处模板字符串插值逐一人工复核,插值对象全部为**服务端常量表名/列名/白名单枚举**(如 `KINDS[kind]`、`order` 三元枚举、`targets[data.targetType]`),无一处理用户原始输入;用户值全部 `$1,$2...` 参数化。`identifier()`/`key()` 对外部 ID 做字符白名单。 |
| 5 | 响应泄露敏感字段 | ✅ 基本安全,1 项注意 | 用户侧统一返回 `phone_mask`(`138****2217` 格式),`user-service.mjs:39` 的 profile 无手机号原文/哈希;`publicCatalog`/`publicPoi` 显式白名单字段(server.mjs:33-61),`approval`/`source`/`mediaApproval`/`coverMediaId` 全部剥除;内部备注 `internal_note` 不返回用户(有测试断言)。**注意**:admin 端 `listStaff`/`userDetail` 对持 `user.read` 权限者返回脱敏手机号,符合最小化;但 H1 的 `*` 权限可读全部。 |
| 6 | Redis 敏感数据/过期时间 | ➖ **不适用(无 Redis)** | 栈内无 Redis。会话在 Postgres 带 `expires_at` + 双索引(002:236-237),`housekeeping` 清理过期会话。唯一内存态是限流 Map(M1)。 |
| 7 | 硬编码密钥 | ✅ **未发现** | 定向扫描(AWS AKIA/SK-模式/secret=/password= 字面量)零命中;所有密钥经 `secret(env,key)` 读取,支持 `_FILE` 挂载;.env.example 全空值;微信上传私钥走 GitHub Secrets 且注释明示"不得提交"(wechat-preview.yml:22-34)。开发验证码 `246810` 被 `production?'':` 守卫(config.mjs)。 |
| 8 | HTTPS 与 CORS | ✅ 合理 | 生产强制:`PUBLIC_BASE_URL` 必须 https、IVY host/mqtt(S)/SMS 网关均 https 且禁 URL 凭据(config.mjs 多处 invariant)。CORS 为白名单回显 + 非白名单 Origin 的写方法直接 403(server.mjs:129-135)。响应头含 CSP(`frame-ancestors 'none'`)、nosniff、Referrer-Policy(server.mjs:113-115);**无 HSTS**,需由边缘/网关补充。 |
| 9 | 文件上传校验 | ✅ 安全 | `media-upload.mjs`:base64 正则 + 3MB 双重上限、`execFile`(非 shell,无注入面)+ 15s 超时调用 Pillow 转码,**输出强制 .webp**(不可执行),sha256 内容寻址 + `flag:'wx'` 防覆盖,落库 `media_audit_log`。唯一注意点 L1(未审核即达)。 |
| 10 | N+1 / 缺索引 / 未分页 | ✅ 总体健康,2 项提示 | 52 个索引覆盖会话/工单/消息/分析;所有列表端点强制 LIMIT(用户/工单/消息 100,报名 500)且响应标 `limited:true`;POI 公开列表用游标分页(server.mjs:380-407)。提示项 L3(N+1)、L4(目录重复解析)。 |
| 11 | 日志敏感信息 | ✅ 安全 | `log.mjs` 字段白名单(event/code/routeId/requestId 等 10 项),凭据与 payload 结构性无法进入;全后端无 `console.log`;500 错误对外返回通用文案 + requestId(server.mjs:446)。注意 L6:失败登录无审计记录。 |
| 12 | 三端业务逻辑一致性 | ✅ 有机制保障 | H5 与 Admin 经 `packages/client-core`(目录/首页派生/收藏/路由所有方)共享;小程序经构建产物 `dist/weapp-native` 复用同一目录数据;存在 `client-parity`/`page-parity`/`browser-parity` 三套一致性测试与 CI 门禁。请求封装在 3 端各有一份(H5 `services/api.mjs`、admin `api()`、weapp `api.ts`),属**有意的小规模重复**,但 PR #6 的 token 迁移需三处同步——已同步,提示未来此类协议变更须三端同时改(见 M1/H2 合并注意)。 |

---

## 6. 微信生态对接正确性(专项)

| 能力 | 状态 | 说明 |
|---|---|---|
| 静态登录(jscode2session) | ✅ | 服务端持有 secret,`redirect:'error'` + 8s 超时,`errcode` 与 openid 类型双重校验,失败 401 不泄露上游细节(auth-unified.mjs:102-107) |
| 手机号快速验证 | ✅ | 先 `wechatAccessToken()`(带 120s 提前过期的进程内缓存,:119-123),再 `getuserphonenumber`,手机号经 WeChat 已验证后才并入账号(:112-117) |
| 订阅消息 | ➖ 未实现 | 无 `requestSubscribeMessage` 调用 |
| 支付 | ➖ 未实现 | 无 `requestPayment`/商户配置 |
| 分享 | ➖ 未实现 | 页面未配置 `onShareAppMessage`(以 19 页面扫描为准) |

---

## 7. 架构与可维护性评估

**合理之处**
1. 单一 `/api/v1` 后端 + 三端共用核心包(`client-core`/`contracts`/`storage`),无重复后端;
2. 内容走"草稿 → 预览 → 显式发布(带审批依据)→ 版本不可变"管线,`content_edit_history` 全量留痕,符合政务/国企内容安全预期;
3. worker lease(`pg_advisory_xact_lock` + fencing)、事件幂等(`event_receipts`)、幂等键(用户提交)等分布式原语用法正确;
4. 6 个 CI 工作流(含 Postgres 真库验收、浏览器 parity、微信工具链)覆盖面远超同体量项目;
5. 配置层在生产环境下强制一堆安全不变量(https/mqtts/ADMIN_TOKEN 长度/SQLite 禁用),错误配置直接启动失败。

**可维护性风险**
1. `apps/api/server.mjs` 单文件 480+ 行承载全部路由与静态服务,建议按 admin/auth/public 拆 router;
2. admin 前端单文件 `admin.mjs` 90+ 行/行的压缩风格,新人改弹窗容易引入语法错误(本次审计现场即发现过一处),建议至少拆出 modal 模块;
3. 三端请求封装重复(见第 5 节 #12),协议变更成本 = 3 处 + 测试,建议生成层共享。

---

## 8. 修复优先级路线图

| 优先级 | 动作 | 对应发现 | 预估工作量 |
|---|---|---|---|
| P0 | Review 并合并 PR #6(先 rebase 到 main,预计与 PR #8 的 route 路由在 server.mjs 有小冲突,按"远端优先"解) | H2, M1, M2 | 0.5 天 |
| P0 | 生产禁用 legacy ADMIN_TOKEN 通道 | H1 | 0.5 天 |
| P1 | OTP 每手机号 24h 配额 + 失败登录审计 | M5, L6 | 1 天 |
| P1 | 容量校验加 advisory lock | M3 | 0.5 天 |
| P2 | IVY nonce 去重 + 与供应商确认协议升级 | M4 | 1–2 天(含外部沟通) |
| P2 | media 未审核不可达 | L1 | 0.5 天 |
| P3 | catalog 缓存、walks N+1、CI 触发 main、server.mjs 拆分 | L3–L5, §7 | 2 天 |

---

## 9. 审计证据清单

- 逐文件人工审读:`apps/api/server.mjs`(全文 460 行)、`packages/core/{auth-unified,admin-token,config,content-service,admin-service,user-service,operations-service,assistant-service,media-upload,log}.mjs`、`packages/ivy/crypto.mjs`、`packages/storage/repository.mjs`(housekeeping/catalog)、`apps/admin/src/admin.mjs`、`apps/h5/src/services/visitor.mjs`、`.github/workflows/*.yml`、`.env.example`、`packages/storage/migrations/*.sql`
- 定向扫描:SQL 模板插值(11 处全核)、硬编码密钥模式、`console.*`、`_session`、支付/订阅消息 API、`git ls-files dist/`
- 交叉验证:本地 `npm test` 98/98、`node scripts/check.mjs` 10/10、既有 `audit/二次审计报告.md`(2026-09-19 自检)结论对照
- 未覆盖边界:未执行真实微信端到端联调(需商户/ AppSecret 生产凭据)、未做负载测试、未审计 `delivery/*` 历史交付分支(以 main 为准)
