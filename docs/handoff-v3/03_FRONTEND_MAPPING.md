# 运营后台 ↔ H5 ↔ 微信原生小程序映射

| 后台对象 | H5 | 微信原生小程序 |
|---|---|---|
| home | 首页 | pages/home |
| banners | 首页/漫游/我的资源位 | pages/home 等 |
| nodes | 线路/站点/实时 | pages/route / stations / station / live |
| pois / media | 漫游/地点/地图内容层 | pages/explore / poi / live |
| walks | 城市玩法 | pages/explore / walks / walk |
| announcements / siteContent | 公告/指南/隐私 | home / guide / privacy |
| membershipPlans | 会员服务 | pages/member |
| benefits | 我的权益 | pages/rights |
| events | 城市活动 | pages/events |
| users | 我的账户 | pages/me |
| favorites | 收藏 | pages/favorites |
| tickets / privacyRequests | 客服与隐私 | pages/support |
| messages | 我的消息 | pages/messages |
| recommendations | 地点排序 | `/content` 返回统一排序 |
| transit | 实时页 | pages/live |

## 强制原则

- 两端不复制业务内容。
- 内容全部来自 `/content`。
- 用户数据全部来自 `/me/*`。
- 实时公交全部来自 `/transit/live`。
- 小程序的本地存储仅用于未登录收藏和会话，不作为业务事实来源。
