# 研发交接清单

当前状态统一见 [STATUS](STATUS.md)，启动与登录见 [研发指南](DEVELOPER_GUIDE.md)。原始审查及六项修复记录保留用于追溯，不重复维护测试总数。

| 接手动作 | 完成标准 |
|---|---|
| 核对代码 | 记录 PR / 分支 / commit；仅维护 apps/weapp-native 正式小程序 |
| 启动本地环境 | Node 22.16.0；迁移通过；仅新开发库首次导入参考内容 |
| 配置登录 | 测试码仅非生产；后台角色正确；注销后会话不可用 |
| 构建三端 | npm run build/check/test 和媒体测试通过；核对构建清单 |
| 发布内容 | 草稿隔离、精确审核版本、下架和冲突处理；刷新两端核对 version |
| 用户业务 | 按 CLIENT_PARITY 执行跨端账户动作、客服回复及消息回读 |
| 小程序环境 | CLIENT_CONFIG 注入 HTTPS API、实际 AppID；开发者工具导入 dist/weapp-native |
| 正式验收 | 微信官方 preview、iOS/Android、短信真实送达、公交及其他目标集成证据 |
| 上线交付 | 部署地址对应精确 commit；目标数据库备份和 migration 005；release gate 通过 |

尚未执行的现场项目必须如实保留，不以测试码、浏览器截图、工具链安装结果替代。角色与负责人由项目团队实际指定。
