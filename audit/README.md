# 验收证据索引

历史报告只证明其记录的提交与环境，不能直接当作当前代码的通过结果。

- `review-fixes/`：R1～R6 审查修复的历史回归与 CI 证据。
- `postgres/`：PostgreSQL 兼容性记录；发布门禁仍使用此路径。
- `wechat-toolchain/`、`integration-runtime/`：隔离依赖及工具链验证资料，不等于现场运行已通过。
- `phase*` 及根目录旧快照：保留历史追溯；当前工程状态见 `docs/STATUS.md`。
- `local/`：本地重跑报告，忽略提交；最终提交结果见对应 commit 的 GitHub Actions。
- 正式微信 `preview-result.json`、二维码和设备结果只允许真实验收生成，未完成时不补造证据。
