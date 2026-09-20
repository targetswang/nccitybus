# 南充嘉陵江城市漫游｜微信原生小程序研发交接

## 当前架构
本小程序不维护独立业务内容。默认联调 API 为 `https://app-3hu1sz.v2.appdeploy.ai`，正式上线改为项目正式 API 域名。

统一接口：
- GET `/api/v1/content`：与 H5 相同的已发布内容版本
- GET `/api/v1/capabilities`
- GET `/api/v1/transit/live`
- POST `/api/v1/auth/wechat-phone`：正式微信手机号一键登录
- POST `/api/v1/auth/challenge|verify`：联调测试验证码
- POST `/api/v1/me/query|action`：收藏、会员、权益、活动、客服
- POST `/api/v1/analytics/event`：有限白名单行为事件；失败不阻断业务

## 正式微信手机号登录
`pages/login` 使用 `open-type="getPhoneNumber"` 获取一次性 code，并调用 `wx.login` 获取 loginCode；两个凭证都发送给服务端。客户端不上传自报手机号。

服务端只有在 `WECHAT_MINIPROGRAM_APP_ID` 和 `WECHAT_MINIPROGRAM_APP_SECRET` 已安全配置时才调用微信接口。未配置返回明确错误，不回退假身份。

## 仍需正式配置
1. 正式小程序 AppID/Secret 与 request 合法域名。
2. 公交 IVY HTTP/MQTT 与站牌/线路映射。
3. 乘车码目标小程序 AppID/Path。
4. 地图与真实坐标。
5. 正式短信服务（H5/后台）。
6. 微信开发者工具、iOS 和 Android 真机回归。

## 数据原则
- 不再包含 DEMO_POIS、模拟车辆、固定 8/21 分钟 ETA。
- 内容来自同一 publication；账户事实来自 `/me/*`。
- 领取权益不等于使用；报名活动不等于公交预约。
- 无真实坐标不提供假导航。
