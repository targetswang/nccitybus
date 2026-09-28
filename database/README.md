# 数据库入口说明

业务数据库源码的**唯一维护位置**是 `packages/storage/`。本目录仅作为项目导航入口，避免出现两套 schema 漂移。

- 主 Schema：`packages/storage/schema.sql`
- Migration：`packages/storage/migrations/`
- 数据库驱动/事务：`packages/storage/database.mjs`
- Repository：`packages/storage/repository.mjs`
- 迁移命令：`npm run db:migrate`
- PostgreSQL 验收：`npm run accept:postgres`
- 详细说明：`docs/DATABASE.md`

开发环境可使用 SQLite；生产配置必须使用 PostgreSQL，禁止失败后静默降级到 SQLite。已有生产/测试数据库升级只执行 migration，不重复导入参考内容。
