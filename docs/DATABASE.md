# 数据库与迁移

## 1. 数据库策略

- 正式环境：PostgreSQL 16。
- 本地开发 / 自动测试：SQLite。
- 正式 PostgreSQL 连接失败时禁止静默回退 SQLite。

## 2. 迁移顺序

1. `packages/storage/schema.sql`：基础内容版本、公交事件、账户、会话、审计。
2. `002_unified_platform.sql`：统一用户、RBAC、会员权益、客服、线路/站点/POI/攻略、内容历史。
3. `003_ai_operations.sql`：AI 任务与人工确认提案。
4. `004_operations_media_discovery.sql`：POI 候选池、媒体审计、外部集成验收记录。

`schema_migrations` 记录已应用版本。

## 3. 内容事实来源

游客端最终发布内容通过统一后端和数据库读取。`packages/content/catalog.reference.json` 是迁移/验收基线，不应被前端当作线上隐藏 fallback。

## 4. 内容发布语义

后台编辑首先进入草稿；草稿不应泄露到游客端。只有显式 publish 后公共 `/api/v1/content` 才变化。

PostgreSQL 16 CI 已验证：

- migration 成功；
- 5/21/4/9 基线导入成功；
- 草稿隔离成功；
- 发布后读回成功。

证据：`audit/postgres/result.json` 与 `audit/phase44/ci-evidence.json`。

## 5. 并发与幂等

- 内容编辑使用 revision 乐观锁。
- 公交事件使用 digest、防重、乱序处理和 lease。
- PostgreSQL 使用事务和 advisory lock；SQLite 仅用于本地/测试。


## 审查修复 migration 005

005_node_revision.sql 为已有 tourism_nodes 增加 revision INTEGER NOT NULL DEFAULT 1。编辑及重新导入节点会递增 revision，旧版本编辑返回 409。升级先备份再执行 npm run db:migrate，不修改已应用的 002。
