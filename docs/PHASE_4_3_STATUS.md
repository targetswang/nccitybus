# Phase 4.3 实际开发状态 — v4.3.0-rc.1

## 已完成并自动回测

- H5：手机号登录、统一用户档案、云端收藏、会员、权益、活动报名、消息、客服/隐私反馈。
- 微信原生小程序：`apps/weapp-native` 注册 19 个页面，TypeScript 检查通过；统一调用 `/api/v1`。
- 运营后台：四个业务入口 + 设置；内容编辑/显式发布；用户档案、会员/权益/报名、客服工单、站内消息、工作人员 RBAC。
- AI 运营助手：DeepSeek/Kimi 兼容 Chat Completions 工具调用；只能查业务数据、生成待确认提案，不能自动发布；模型密钥只从服务端环境变量读取。
- 后端：迁移 001/002/003、统一 Auth/RBAC、内容、用户服务、客服回复和 AI 提案。
- 内容：干净库迁移仍为 1 条线路 / 5 站 / 21 地点 / 4 攻略 / 9 步骤。

## 自动验证

- `npm run build`：通过。
- `npm run check`：通过，包括 portable admin、19页原生小程序 TypeScript 与路由结构检查。
- `npm test`：68/68 通过。
- 媒体合成测试：独立 Python 测试保留原逻辑；不代表外部图片版权或地点匹配通过。
- 本地 Chromium 访问 localhost 被当前执行环境策略 `ERR_BLOCKED_BY_ADMINISTRATOR` 拦截，因此不能把这次环境写成真实浏览器端到端通过；HTTP API 生命周期由 Node 测试真实启动服务器验证。

## 明确未完成

- 微信官方开发者工具编译与 iOS/Android 真机。
- 正式短信供应商。
- 真实 DeepSeek/Kimi 密钥调用（代码与受控假上游工具调用测试通过，不等于供应商正式验收）。
- IVY Bus 凭证、HTTP/MQTT 现场数据。
- 外部商家图片重新核对版权/地点匹配和正式入库。
- `deploy/integrations/package-lock.json`：本环境 npm registry 请求超时，未伪造 lockfile；生产发布门禁仍应阻止。
