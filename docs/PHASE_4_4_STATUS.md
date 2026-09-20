# Phase 4.4 实际开发状态 — v4.4.0-rc.1

## 本轮新增

- 媒体素材可视化后台：预览、版权/授权状态、地点匹配状态、使用地点、审核依据、审计日志、设为地点封面草稿。
- 媒体发布约束：只有 `rights_status=confirmed`、`match_status=confirmed` 且存在本地 SHA-256 WebP `storage_path` 的素材才能设为正式封面；保存后仍需显式发布。
- POI 自动采集：服务端调用高德 POI 2.0 周边搜索，结果只进入 `poi_discovery_candidates` 候选池；人工映射“吃什么/喝什么/看什么/玩什么/休息”并审核后才能导入地点草稿；导入后仍需显式发布。
- 正式短信适配：生产 OTP 改为调用服务端 HTTPS 短信网关，不再存在生产固定验证码；另有“两段式送达验收”，必须输入手机实际收到的验证码才记录 `sms-delivery=passed`。
- 外部集成验收：AI、微信 AppID/AppSecret、短信真实送达的验收记录只保存供应商、结果、延迟和脱敏信息，不持久化 API Key、AppSecret、access token 或验证码。
- 微信官方工具链：`miniprogram-ci` 2.1.31 已在隔离 GitHub CI 中成功解析、锁定并运行版本检查。工具链依赖审计原始结果保留在 `audit/wechat-toolchain/`；该工具只用于构建，不进入后端/H5/小程序运行时。
- PostgreSQL：PostgreSQL 16 CI 已真实执行迁移、1/5/21/4/9 内容导入、草稿隔离和发布回读，结果见 `audit/postgres/result.json`。
- 发布门禁：连接目标 PostgreSQL 后要求 migration 004 存在，并要求最近的 AI、微信、短信送达真实通过记录；同时要求官方微信预览二维码和 iOS/Android 双端真机证据。

## 本轮自动验证

- `npm run build`：通过。
- `npm run check`：通过。
- `npm test`：需以本包最终 `audit/phase44/node-tests.tap` 为准。
- `python tests/media_test.py`：5/5 通过；仅验证本地处理链，不代表第三方图片版权或地点匹配已经人工确认。
- PostgreSQL 16 GitHub Actions：通过；证据已带回包内。
- 微信 `miniprogram-ci` 工具链 GitHub Actions：通过“安装/锁定/版本检查”；**没有真实 AppID/上传私钥/IP 白名单，因此官方 preview 尚未执行。**

## 仍然 blocked 的真实外部验收

1. 真实 DeepSeek/Kimi 密钥调用：代码和受控模拟上游通过；必须在目标环境用后台“真实调用验证”形成数据库记录。
2. 正式短信实际送达：生产适配与两段式验收已实现；必须配置真实短信网关并由现场手机收码确认。
3. 微信官方 preview：需要真实 AppID、代码上传私钥和 CI 出口 IP 白名单；凭证不得发到聊天或提交仓库。
4. iOS + Android 真机：必须按 `docs/WECHAT_DEVICE_ACCEPTANCE.md` 完成双端，并保存证据文件。
5. 目标生产 PostgreSQL：兼容性已在 PostgreSQL 16 CI 验证；正式目标数据库仍需运行 release gate 连接检查。
6. IVY Bus：仍缺供应商真实凭证、MQTT、线路映射和现场数据。
