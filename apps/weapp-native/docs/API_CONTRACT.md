# 南充城市漫游 API 契约

版本：v1（联调环境）。游客 H5 与原生小程序只调用统一游客 API；运营后台调用管理 API。生产环境不得把测试验证码、模型密钥或公交密钥放在客户端。

## 公共内容
- GET `/api/v1/content`：唯一已发布游客内容快照。包含 version、nodes、pois、walks、home、banners、announcements、events、membershipPlans、benefits。
- GET `/api/v1/capabilities`：地图、登录、乘车码和线路能力状态。
- GET `/api/v1/transit/live`：实时公交快照；未接入时 state=not_configured，vehicles=[]，不得返回模拟车辆。
- POST `/api/v1/analytics/event`：记录有限白名单游客事件，失败不阻断业务。

## 登录
- POST `/api/v1/auth/challenge` { phone, audience }
- POST `/api/v1/auth/verify` { challengeId, phoneHash, code }
- POST `/api/v1/auth/wechat-phone` { code, loginCode }：小程序用户主动授权后，服务端校验微信手机号。依赖 WECHAT_MINIPROGRAM_APP_ID/SECRET；缺配置明确返回 WECHAT_PHONE_NOT_CONFIGURED。客户端不得直接提交手机号作为微信身份。
- POST `/api/v1/auth/me`
- POST `/api/v1/auth/logout`

## 游客账户
- POST `/api/v1/me/query`
- POST `/api/v1/me/action`
action：favorite、join、leaveMembership、claim、openBenefit、register、cancelRegistration、ticket、privacy、readMessage。

## 管理 API
- schema / overview / query / save / transition
- preview / publish / rollback / releases
- import/preview / import/apply / export
- media/fetch / media/save
- recommendations/preview
- assistant/status / assistant/ask / assistant/apply
- discover / source/extract
- users/detail / users/update
- service / staff / notify
- diagnostics / job / events/cancel / analytics

错误统一为 `{ error:{ code,message }, requestId? }`，客户端不得把失败显示为成功。
