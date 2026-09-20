# 运营后台 ↔ H5 ↔ 微信小程序映射

| 后台对象 | H5 | 微信小程序 | 发布方式 |
|---|---|---|---|
| home | 首页 | pages/home | 内容发布 |
| banners | 首页活动资源位 | pages/home | 内容发布 |
| nodes | 线路/站点/实时 | pages/route/stations/live | 内容发布 |
| pois/media | 漫游/地点/地图内容层 | pages/explore/poi/live | 内容发布 |
| walks | 路线列表和详情 | pages/explore/walk | 内容发布 |
| membershipPlans | 会员服务 | pages/member | 内容发布 |
| benefits | 权益 | pages/rights | 内容发布 |
| events | 活动 | pages/events | 内容发布 |
| users/memberships/grants/registrations | 我的账户 | pages/me | 实时账户 API |
| tickets/privacyRequests/messages | 客服与消息 | pages/support/messages | 实时账户 API |

原则：两端不分别保存业务内容。已发布内容全部来自 `/content`；账户事实来自 `/me/*`；公交事实来自 `/transit/live`。
