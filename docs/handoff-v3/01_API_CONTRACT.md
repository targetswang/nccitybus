# API 契约

Base URL（当前联调）：`https://app-3hu1sz.v2.appdeploy.ai`

## 公共内容

### GET /api/v1/content
唯一游客发布快照。

主要字段：
- `version`
- `home`
- `nodes`
- `pois`
- `walks`
- `banners`
- `announcements`
- `membershipPlans`
- `benefits`
- `events`

### GET /api/v1/capabilities
返回地图、登录、乘车码、线路等能力是否已配置。

### GET /api/v1/transit/live
返回实时公交快照。未接入时必须：
- `integration.state = not_configured`
- `vehicles = []`
- 不生成模拟车辆
- 不生成固定 ETA

### POST /api/v1/analytics/event
只接受白名单行为事件。统计失败不得阻断游客核心功能。

## 登录

### POST /api/v1/auth/challenge
```json
{"phone":"手机号","audience":"user"}
```

联调环境返回测试 challenge，不发送短信。

### POST /api/v1/auth/verify
```json
{"challengeId":"...","phoneHash":"...","code":"..."}
```

### POST /api/v1/auth/wechat-phone
微信原生小程序一键手机号登录：

```json
{"code":"getPhoneNumber 返回的一次性 code","loginCode":"wx.login 返回的 code"}
```

服务端才可向微信校验手机号。客户端不得把自行读取/填写的手机号当作微信已验证身份。

依赖服务端 Secrets：
- `WECHAT_MINIPROGRAM_APP_ID`
- `WECHAT_MINIPROGRAM_APP_SECRET`

未配置时返回 `WECHAT_PHONE_NOT_CONFIGURED`。

### POST /api/v1/auth/logout
撤销当前服务端会话。

## 游客账户

### POST /api/v1/me/query
返回：
- 用户概要
- 收藏
- 会员实例
- 已领权益
- 活动报名
- 客服工单
- 消息
- 隐私申请

### POST /api/v1/me/action
支持：
- `favorite`
- `join`
- `leaveMembership`
- `claim`
- `openBenefit`
- `register`
- `cancelRegistration`
- `ticket`
- `privacy`
- `readMessage`

权益领取不等于已使用；活动报名不等于公交预约。

## 管理端 API

所有管理接口使用 admin audience 会话：

- `/admin/schema`
- `/admin/overview`
- `/admin/query`
- `/admin/save`
- `/admin/transition`
- `/admin/preview`
- `/admin/publish`
- `/admin/rollback`
- `/admin/releases`
- `/admin/import/preview`
- `/admin/import/apply`
- `/admin/export`
- `/admin/media/fetch`
- `/admin/media/save`
- `/admin/recommendations/preview`
- `/admin/assistant/status`
- `/admin/assistant/ask`
- `/admin/assistant/apply`
- `/admin/discover`
- `/admin/source/extract`
- `/admin/users/detail`
- `/admin/users/update`
- `/admin/service`
- `/admin/staff`
- `/admin/notify`
- `/admin/diagnostics`
- `/admin/job`
- `/admin/events/cancel`
- `/admin/analytics`

## 并发约束

内容保存：
- `recordId`
- `expectedRevision`

内容发布：
- `expectedPublicationId`
- `previewHash`

冲突必须返回 409，不允许静默覆盖。

## 错误格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "用户可理解的错误信息"
  },
  "requestId": "可选"
}
```

客户端绝不能把失败显示成“保存成功”。
