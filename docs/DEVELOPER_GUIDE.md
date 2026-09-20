# 研发接手与登录联调指南

更新日期：2026-09-20。适用 PR #1，分支 `release/v4.4.0-rc1`；代码审查基线 `f932e6c4522a08159b929e7b147919db7b368b8a`。

R1～R6 已完成代码修复，回归证据见 [修复验收记录](REVIEW_FIXES_2026-09-20.md)；未配置线上账号、未部署预览。先阅读本指南，再按 [审查问题清单](CODE_REVIEW_2026-09-20.md) 修复和验收。当前仍是候选工程。

## 1. 登录手机号与验证码

| 场景 | 手机号 / 凭据 | 使用条件 |
|---|---|---|
| 用户指定的联调手机号 | `18861822117` | 来自项目沟通；未验证该账号在远程环境的启用状态 |
| 本地及隔离测试验证码 | `246810` | `NODE_ENV` 非 production，`TEST_LOGIN_CODE=246810` |
| H5 游客登录 | 上述手机号；先获取验证码再提交 | audience=user；未注册用户在验证成功后自动创建 |
| 运营后台登录 | 上述手机号；先获取验证码再提交 | audience=admin；还必须配置初始管理员手机号哈希或已有启用的 staff_roles |
| 原生小程序测试码登录 | 上述手机号及测试码 | 与 H5 共用 API；必须先配置可访问的 HTTPS 后端 |
| 原生小程序手机号授权 | 微信实际授权的手机号 | 需真实 AppID/AppSecret、wx.login 和 getPhoneNumber；不使用固定验证码 |
| 正式短信登录 | 用户实际接收短信的手机号、动态验证码 | production 忽略固定测试码，必须配置真实短信网关 |

固定码不代表短信已发送，也不能作为正式短信送达验收。测试环境按手机号格式校验，不是仅允许上述一个号码；后台另有服务端权限校验。不要把包含固定码登录的开发环境作为公开生产服务。

验证码挑战有效期为 5 分钟，同一手机号再次获取需间隔至少 60 秒。代码预期限制输错 5 次，R1 已修复并覆盖并发失败场景。游客会话有效期 7 天，后台 8 小时；二者用途隔离，游客登录不会自动获得后台会话。

**R6 已修复：H5 和正式小程序均读取 token，退出时请求服务端注销。** 若旧部署仍出现登录后 401，请核对已部署提交并重新登录。

## 2. 从干净环境启动 H5 和后台

以下命令在仓库根目录、Bash 或 WSL 中执行。使用 Node.js 22.16.x（项目约束 >=22.16.0 <23）和 npm。Windows 原生 PowerShell 请对应改用环境变量语法，不直接粘贴 export。

```bash
git clone --branch release/v4.4.0-rc1 https://github.com/targetswang/nccitybus.git
cd nccitybus
npm ci --ignore-scripts --no-audit --no-fund

export NODE_ENV=development
export HOST=127.0.0.1
export PORT=3000
export DB_DRIVER=sqlite
export SQLITE_PATH=./var/nanchong.sqlite
export PUBLIC_BASE_URL=http://127.0.0.1:3000
export CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
export TEST_LOGIN_CODE=246810
export INITIAL_ADMIN_PHONE_HASH="$(node --input-type=module -e "import {createHash} from 'node:crypto'; process.stdout.write(createHash('sha256').update('phone:18861822117').digest('hex'))")"

npm run build
npm run db:migrate
node scripts/import-content-model.mjs
npm start
```

程序不会自动加载 `.env`。仅复制 `.env.example` 不会生效；上面使用 shell 环境变量。服务重启后需重新注入配置。

首次导入会填充后台规范化内容表，并发布参考版本。预期 counts：routes=1、nodes=5、pois=21、media=9、walks=4、steps=9。**只执行 npm run content:publish 不会初始化后台规范化表**，可能出现游客端有内容、后台计数为零。

`import-content-model.mjs` 只用于新建、隔离的开发数据库首次初始化；它会覆盖部分内容和首页草稿，不能每次启动执行，也不能直接对生产库执行。

| 入口 | 本地地址 |
|---|---|
| 游客 H5 | http://127.0.0.1:3000/ |
| 运营后台 | http://127.0.0.1:3000/admin/ |
| 内容 API | http://127.0.0.1:3000/api/v1/content |
| 能力状态 API | http://127.0.0.1:3000/api/v1/capabilities |

本地地址仅供运行服务的电脑访问。手机的 127.0.0.1 指向手机自身，不是研发电脑。手机预览需研发另行配置测试域名/局域网访问、监听地址及必要网络权限。

需要调试 Worker 时，在另一终端注入相同的数据库与环境配置，再执行 `npm run worker`。没有 IVY 参数时，not_configured/无车辆数据是预期行为，不可伪造实时车辆。

## 3. 三端登录操作与接口核对

### H5

进入“我的”→“手机号登录”→输入联调手机号→获取验证码→输入 246810→勾选说明→登录。随后验证账户读取、收藏和反馈；仅出现手机号不代表登录链路已验收。

### 运营后台

打开 /admin/，输入联调手机号，先获取验证码，再填写 246810 登录。若返回 ADMIN_NOT_ALLOWED，核对 INITIAL_ADMIN_PHONE_HASH 的算法和服务环境变量；普通游客账号不会自动成为管理员。首次后台登录成功才会为匹配哈希的手机号建立初始管理员角色。

配置哈希必须为 SHA-256(`phone:` + 完整手机号)，不是裸手机号哈希。更换角色应使用后台工作人员权限功能；R2 已修复：旧会话复查实时角色，禁用后不会被初始管理员配置自动恢复。

### API 调试约定

1. POST /api/v1/auth/challenge，JSON 为 `{"phone":"18861822117","audience":"user"}`；后台改为 admin。
2. 保留响应的 challengeId 和 phoneHash。
3. POST /api/v1/auth/verify，提交 challengeId、phoneHash、code（246810）和 clientType（h5 / admin / weapp）。
4. 响应是 `{token, expiresAt, user}`。后续使用 `Authorization: Bearer <token>`，或游客接口支持的请求体 `{"_session":"<token>"}`。
5. POST /api/v1/me/query 读取账户；后台令牌用于 /api/v1/admin/content/counts。不要混用 audience。
6. POST /api/v1/auth/logout 注销当前 token，随后受保护请求应返回 401。

phoneHash 是挑战标识的一部分，不是登录令牌；不要将测试过程中生成的 token 写进文档或日志。

### 微信原生小程序

正式源目录是 apps/weapp-native，构建复制到 dist/weapp-native。旧 apps/weapp 不作为正式入口。

当前正式客户端在 apps/weapp-native/services/config.ts 中读取 apiBaseUrl，并强制 HTTPS；构建脚本不会用 deploy/client.example.json 自动覆盖这个正式客户端配置。切换环境时先修改正式客户端 config.ts，再构建并核对产物配置，避免继续请求旧服务。

源码中现有地址为 https://app-3hu1sz.v2.appdeploy.ai 。这是**待核验的历史配置地址**，本次未能验证其可访问性及部署版本，不能直接认定为本 PR 的在线预览。接手人员需记录目标地址、实际部署 commit 和健康检查结果。

## 4. 常见问题定位

| 现象 | 优先检查 |
|---|---|
| TEST_AUTH_NOT_CONFIGURED / 测试码不接受 | NODE_ENV、TEST_LOGIN_CODE 是否实际注入进程 |
| ADMIN_NOT_ALLOWED | 初始管理员哈希、staff_roles、使用的 audience |
| OTP_RATE_LIMIT | 上次获取挑战是否距今不足 60 秒 |
| OTP_EXPIRED | 是否超过 5 分钟或挑战已成功使用 |
| 登录后账户操作仍 401 | R6：客户端应发送响应中的 token |
| H5 有内容但后台为空 | 是否只发布快照，未首次导入规范化表 |
| 后台发布后生产内容 503 | 先核对是否部署 R3 修复；现要求审核依据和精确草稿版本 |
| 内容下架无效 | 先核对是否部署 R4 修复；状态应在文本编辑后继续保留 |
| 小程序服务地址错误 | 正式 config.ts 和 dist/weapp-native，不是仅改 legacy CLIENT_CONFIG |
| 实时车辆为空 | IVY 配置、Worker 心跳、线路映射、设备时间；未接入时无数据是正确结果 |

## 5. 接手验收与证据

修复记录统一填在 [审查问题清单](CODE_REVIEW_2026-09-20.md)，不要只修改“通过”文字。

| 验收项 | 必须保留的证据 | 当前状态 |
|---|---|---|
| 本地启动与首批内容 | commit、Node 版本、启动日志、后台计数 | 步骤已按脚本核对；本轮未重跑完整构建 |
| 六项审查问题 | 修复 commit、回归用例、运行结果 | 代码修复及本地自动回归已完成，见修复验收记录 |
| 三端用户闭环 | 登录→账户→收藏/反馈→后台回复→用户回读 | R6 自动 HTTP 往返通过；浏览器与真机现场验收待完成 |
| 正式内容发布 | 草稿隔离、审核、发布、双端版本、回滚 | R3/R4/R5 自动回归通过；目标生产发布待验收 |
| 在线 H5 | 可访问 URL、部署 commit、手机/PC 检查记录 | 未验证 |
| 外部集成 | 微信双端真机、短信真实收码、AI、IVY、目标 PostgreSQL | 见 KNOWN_LIMITATIONS，不能以测试码替代 |

执行顺序：核对本次修复提交与回归结果 → 三端实际联调 → 外部凭据和设备验收 → 发布门禁。研发负责人分配实际执行人；当前文档不虚构人员认领或截止时间。


## 6. 升级本次修复

更新源码后，备份目标数据库，运行 npm run db:migrate 应用新增 005_node_revision.sql，再构建并重启 API；既有数据库不要重跑参考内容导入。站点 revision 使用增量迁移，原始 002 不变。发布门禁现在要求 migration 005。

后台“发布当前内容”需要确认整批内容事实核验并填写审核依据；后台会提交预览版本号，草稿变化会拒绝发布并提示重新审核。图片/音频授权校验保持有效。不能用 reference 替换已 approved 的线上版本。内容编辑增加上架/下架选择；被攻略引用的 POI 下架时需同步调整关联攻略，校验失败不会影响原发布版本。
