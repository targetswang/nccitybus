# 版本发布流程(RELEASING)

本仓库的发版规范。目标:团队协作尽量简单(单人也能走完),但安全和质量门禁不省略。

---

## 1. 分支管理规则

采用**主干开发(trunk-based)+ 短生命周期修复分支**模式,不设长期 develop 分支:

| 分支 | 用途 | 生命周期 |
|---|---|---|
| `main` | 唯一主干,始终可发布。所有合并经 PR + CI 全绿 | 永久 |
| `feat/*`、`fix/*`、`chore/*` | 功能/修复/杂务分支,从 `main` 拉出 | 合并即删 |
| `release/vX.Y.Z-rc.N` | 预发布候选分支(可选)。用于 rc 冻结期串行修复;修复合回 `main` 后 cherry-pick 或合并进来 | 发版后删除 |
| `hotfix/vX.Y.Z+1` | 生产紧急修复,从 `main` 拉出,改完直接 PR 回 `main` 并打补丁 tag | 合并即删 |

**规则:**
1. `main` 禁止直接 push(仓库 Settings → Branches 开启保护:要求 PR + CI 通过)。
2. 任何 PR 合并前必须:**冲突解决**(把最新 `main` 合回分支,而不是坐等 GitHub 自动合并)+ **CI 全绿**。
3. 长期分支(release/*)合并回 main 前,必须先把最新 main 合并进来解决冲突——2026-09-21 PR #6 合并时已在 `packages/storage/repository.mjs` 踩过一次(409 文案 vs `hydrateCatalog`,两边都保留)。

---

## 2. 版本号规则(SemVer)

格式:`vMAJOR.MINOR.PATCH`,可带预发布后缀:`-rc.N` / `-beta.N`。

- **MAJOR**(X.0.0):不兼容的数据/接口变更。本项目对应:数据库迁移删除字段、`/api/v1` 响应字段移除或改名、微信端 `App.json` 页面路径不兼容调整。
- **MINOR**(X.Y.0):向后兼容的新功能。例:新增内容类型、新增后台 Tab、新增公开接口。
- **PATCH**(X.Y.Z):向后兼容的问题修复。例:安全修复、UI 回归修复、文案修正。
- **rc**(X.Y.Z-rc.N):发布候选,冻结功能只修缺陷;N 递增,转正时去掉后缀(如 `4.5.0-rc.2` → `4.5.0`)。

**版本号唯一来源是仓库根部的 `VERSION` 文件**(`package.json` 的 `version` 与之保持一致,由发版脚本同步)。`npm version` 不直接使用,统一走 §4 的发版步骤。

---

## 3. Git Tag 规范

- 命名:`v<VERSION>`,例如 `v4.4.0-rc.1`、`v4.5.0`。**不使用** `v4.4.0-rc1`(缺点号,非 SemVer)。
- Tag 一律打在 `main` 上的**合并提交**(merge commit),不挂在 feature 分支。
- 使用 **annotated tag**,附一句话说明,由 CI 自动创建(见 §6),本地手动打 tag 仅作紧急兜底:

  ```bash
  VER=$(cat VERSION)
  git tag -a "v${VER}" -m "Release v${VER}"
  git push origin "v${VER}"
  ```

- Tag 一经发布**不可删除重打**;发错内容用 `vX.Y.Z+1` 补丁版本,不用 `force` 覆盖。

---

## 4. CHANGELOG 维护方式

- 文件:仓库根目录 `CHANGELOG.md`,人工维护(不自动生成——本项目提交信息混合中英文,自动生成噪音大)。
- 格式:[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) + SemVer 标题。
- 每个版本一节,发布该版本的 PR 中同步写好;**发版 PR 不允许出现"空 CHANGELOG"**。

```markdown
## [4.5.0] - 2026-09-25

### Added
- 运营后台「线路信息」Tab,线路级文案(routeName/description/guides/privacy)可后台编辑(#8)

### Security
- 关闭 `_session` body 会话通道,统一 Bearer header(#6,审计 H2)
- 新增共享限流表 rate_limit_windows,多实例限流生效(#6,审计 M1)
```

- 类别固定五项:`Added` / `Changed` / `Fixed` / `Security` / `Known Issues`。安全项必须注明对应审计编号(见 `audit/CODE_AUDIT_REPORT_2026-09-21.md`)。

---

## 5. 发布前检查清单

发版 PR 合并前逐项确认(勾选写进 PR 描述):

- [ ] `npm run audit:local`(= build + check + test)本地全绿
- [ ] `VERSION`、`package.json` 两处版本号一致
- [ ] `CHANGELOG.md` 已写入本版本条目,Security 项标注审计编号
- [ ] **密钥扫描通过**(CI 内 gitleaks 零高危;`.env.example` 无真实密钥)
- [ ] **依赖审计**:根目录 + `deploy/integrations` 的 `npm audit` 无 high/critical(或高风险已评估并记录豁免理由)
- [ ] 审计报告(`audit/`)中标记 P0/P1 的问题已修复,或在本版本 Known Issues 中列明遗留与缓解措施
- [ ] 数据库迁移可在空库与带数据旧库上各自跑通(`npm run db:migrate` + `npm run accept:postgres`)
- [ ] 预发布(rc)版本:走完 `npm run accept:wechat-preview`(微信预览验收);正式版:补真机验收记录

---

## 6. 发布步骤

常规发布(功能/修复上线):

1. **准备发版 PR**:从 `main` 拉分支 `chore/release-vX.Y.Z`,改 `VERSION` + `package.json` + `CHANGELOG.md`,开 PR。
2. **CI 门禁自动执行**(见 §7):build、check、测试、gitleaks、npm audit。任何一步红即停。
3. **合并**发版 PR 到 `main`。
4. **打 tag 触发发布**:在合并提交上创建 annotated tag `vX.Y.Z` 并推送。
5. **CI 自动发布**:`release.yml` 检测到 `v*` tag,自动创建 GitHub Release,附上源码包 + SHA256 + Release Notes(取自 CHANGELOG 对应小节)。
6. **部署**:测试环境由 CI 自动部署(merge 后);生产部署沿用现有托管平台流程,以 Release 产物为准。

紧急补丁(hotfix):

1. 从 `main` 拉 `hotfix/vX.Y.Z+1`,修复 + 更新 VERSION/PATCH 位 + CHANGELOG。
2. PR 合并(可走简化评审,但 CI 门禁不豁免)。
3. 打 tag `vX.Y.Z+1`,CI 自动发 Release。
4. **补丁必须在 24h 内回写 CHANGELOG 的 Known Issues 区**(若有未覆盖的影响面)。

---

## 7. CI/CD 门禁(自动化配置)

现有 7 个 workflow 保留,**补齐**以下缺口(不推翻):

| Workflow | 现状 | 本轮改动 |
|---|---|---|
| `ci.yml` | 只在 `release/v4.4.0-rc1` push 时触发 | **加 `main` push 触发**;加入 gitleaks 密钥扫描步骤;加入根目录 `npm audit` 门禁 |
| `release-package.yml` | 手动/分支触发打包源码 | **保留**作为手动打包工具;tag 触发的正式发布由新建 `release.yml` 接管 |
| `dependency-verification.yml` | 校验 `deploy/integrations` 运行时依赖 | **保留**;根目录审计已前移到 `ci.yml` 门禁,本 workflow 继续负责生产依赖版本锁定证据 |
| `browser-parity.yml` / `postgres-acceptance.yml` / `wechat-*.yml` | 正常 | 不动 |
| `release.yml` | 不存在 | **新建**:tag → SemVer/VERSION 校验 → 门禁 → Release Notes(取自 CHANGELOG)+ 源码包发布 |

门禁失败 = 发布流程终止,不允许手动跳过。

---

## 8. 回滚方案

- **代码回滚**:`git revert <merge-commit>`(不用 `reset`),重新走 PR + CI + tag `vX.Y.Z+1`。已发布 tag 不删。
- **内容回滚**:后台「版本与差异」Tab → 指定历史版本回滚(内容版本不可变机制保证可安全回退);CLI 兜底:`npm run content:publish -- --rollback <version>`。
- **数据库回滚**:迁移只向前;错误迁移写**反向迁移脚本**并在下一版本修回,禁止手工改生产库。
- **小程序回滚**:微信后台提交旧的审核通过版本;`dist/weapp-native` 由 tag 源码包重建。
- 回滚后必须:更新 CHANGELOG Known Issues + 在审计报告追加记录。

---

## 9. 与代码审计的联动(2026-09-21 报告)

审计编号 → 发版动作映射:

| 审计项 | 等级 | 纳入发版环节的方式 |
|---|---|---|
| H1 静态 ADMIN_TOKEN | 高 | 发版清单第 5 项:确认生产环境已禁用 legacy token 通道(设置 `ADMIN_TOKEN=` 为空即关闭);未禁用则 Known Issues 必须写明 |
| H2 `_session` 通道 | 高 | 已在 v4.4.0-rc.1 修复(PR #6);后续发版清单第 6 项验证:`grep -c _session apps/api/server.mjs` 应为 0 |
| M1 内存限流 | 中 | 同上,已修复;回归测试 `tests/review-regressions.test.mjs` 覆盖 |
| M2 analytics 无限增长 | 中 | 同上,`housekeeping()` 90 天保留已生效 |
| M3 容量竞态 | 中 | 待修复;修复版本号规划为 `4.4.1`(PATCH 位,见 §10) |
| M4 IVY SHA-1/CBC | 中 | 供应商协议限制,无法单方升级;在 Known Issues 持续列明 |
| M5 OTP 短信配额 | 中 | 待修复;修复版本 `4.4.1` |
| 低危 6 项 | 低 | 随下一 MINOR 版本统一处理 |

---

## 10. 补丁版本规划(基于审计)

| 目标版本 | 内容 | 触发条件 |
|---|---|---|
| `4.4.1`(PATCH) | 修复 M3(容量 TOCTOU)、M5(OTP 配额);低危 L1(媒体未审核可达) | 本周内 |
| `4.5.0`(MINOR) | 低危 L2-L6(含 walks N+1、catalog 缓存、CI main 触发、登录失败审计) | 下一功能窗口 |
| `5.0.0`(MAJOR) | 若需更换 IVY 协议或升级 Postgres 大版本 | 供应商协商后 |
