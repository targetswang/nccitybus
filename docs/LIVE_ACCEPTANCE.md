# 真实外部环境验收清单

本文件只记录必须依赖真实账号、Secret、供应商或物理设备才能完成的项目。Mock、fixture、测试码或工具安装成功不能替代下列验收。

## 微信小程序

需要真实 AppID、miniprogram-ci 上传私钥、合法域名/IP 白名单，并完成：
- 官方 preview / upload
- wx.login
- getPhoneNumber 授权、拒绝、重试
- iOS 微信真机
- Android 微信真机
- 乘车码目标 AppID/path（如采用小程序跳转）

## 正式短信

需要正式短信服务商账号、签名、模板及服务端 Secret：
- 向受控测试手机号真实发送验证码
- 人工输入实际收到的验证码
- 确认 production 环境不存在固定测试码

## AI

需要 DeepSeek 或 Kimi 等正式 API Key：
- 后台真实调用模型
- 工具调用只读取授权数据
- 敏感字段脱敏
- AI 只能生成提案/草稿，不能绕过人工确认直接发布

## IVY Bus

需要 IVY 提供的 appKey、appSecret、encodingAESKey、ivy_bus_host，以及事件回调/MQTT配置：
- 初始全量同步
- HTTP 事件
- MQTT 车辆位置
- 进出站事件
- 周期全量校准
- 断线重连、重复/乱序事件处理

## 安全要求

不要把 Secret 粘贴到源码、README、Issue、PR 评论或聊天记录。统一使用部署平台 Secrets、受控密钥文件或组织批准的密钥管理系统。
