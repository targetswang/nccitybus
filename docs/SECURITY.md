# 安全与 Secret 管理

## 1. 禁止提交的内容

以下内容不得提交 Git：

- `.env`
- 数据库密码
- 微信 AppSecret
- 微信上传私钥
- AI API Key
- 短信 Token / Secret
- IVY appSecret / encodingAESKey / MQTT 密钥

只提交 `.env.example` 和 `deploy/*.example.json` 字段模板。

## 2. 正式 Secret 注入

推荐使用：

- CI Secrets
- Secret Manager
- systemd EnvironmentFile（权限受控）
- 容器平台 Secret

不要通过聊天、README、截图或源码传递真实 Secret。

## 3. AI

AI 助手只能：读取授权业务数据 → 生成提案 → 人工确认 → 保存草稿 → 运营显式发布。

不得让模型响应直接等价于数据库写入成功。审计表不保存 API Key。

## 4. 短信

测试固定验证码只允许测试环境。生产环境必须调用正式短信网关，并通过“发送 → 现场实际收码 → 输入收到验证码确认”的两段式验收。

## 5. 微信

微信 AppID/AppSecret 验收会强制请求官方 token；数据库不保存 AppSecret/access token。代码上传私钥只进入 CI Secret / 临时文件，禁止进入仓库。

## 6. 媒体

媒体只有在版权/使用依据和地点匹配均确认、并生成本地 SHA-256 WebP 后，才能进入 POI 封面草稿；仍需显式 publish。
