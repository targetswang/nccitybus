# 南充嘉陵江城市漫游 · v4.4.0-rc.1

统一工程：游客 H5、运营后台、19 页微信原生小程序，共用 `/api/v1`、业务规则和数据库。当前为候选版本，代码回归与生产现场验收分别记录。

## 研发入口

- [研发指南](docs/DEVELOPER_GUIDE.md)：启动、联调手机号 `18861822117`、开发验证码 `246810`、管理员授权、小程序配置。
- [三端一致性](docs/CLIENT_PARITY.md)：后台发布到两端、用户服务往返、平台差异和验收边界。
- [目录与责任边界](docs/REPOSITORY_STRUCTURE.md)：代码入口、共享逻辑、已删除旧代码。
- [当前状态](docs/STATUS.md)：验证结果及未完成的现场验收。
- [文档索引](docs/00_START_HERE.md)：接口、数据库、部署和运维说明。

固定验证码只用于显式配置的非生产环境。正式短信使用实际收到的验证码；后台还需服务端角色授权。

## 本地启动

使用 Node.js **22.16.0**。先按研发指南注入环境变量，再执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run db:migrate
node scripts/import-content-model.mjs
npm start
```

参考内容导入仅用于新建开发数据库首次初始化；已有数据库升级只执行迁移，不重复导入。

H5：`http://127.0.0.1:3000/`；后台：`http://127.0.0.1:3000/admin/`。这是本机地址，未提供已经验证的在线预览。没有 IVY 配置时显示未接入，不生成模拟车辆。

## 正式代码入口

| 目录 | 责任 |
|---|---|
| apps/h5 | React 游客页面 |
| apps/admin | 草稿编辑、审核发布、客服和运营 |
| apps/weapp-native | 唯一正式小程序源码，构建到 dist/weapp-native |
| apps/api、packages/core | HTTP、认证、内容发布和用户业务规则 |
| apps/transit-worker、packages/ivy | 公交同步及实时事件 |
| packages/storage | PostgreSQL / SQLite、迁移 001～005 |
| packages/client-core | 两端共用的首页、地图、坐标与路由纯函数 |

## 提交前检查

```bash
npm run build
npm run check
npm test
python tests/media_test.py
```

最终验收以对应 commit 的 GitHub Actions 和 [测试说明](docs/TESTING.md) 为准。微信工具链安装成功不代表官方预览或真机已通过；正式发布仍需 `node scripts/release-gate.mjs` 放行。
