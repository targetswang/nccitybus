# API v1

完整机器可读契约：[openapi.json](openapi.json)。所有公开端点只返回我方数据模型，不把 IVY 密钥、MQTT 密码或 driver 字段送到客户端。

## 已实现端点

| Method | 路径 | 含义 |
|---|---|---|
| GET | `/api/v1/health` | API + 数据库连接探测，不代表公交已连接 |
| GET | `/api/v1/capabilities` | 可用地图/乘车码/登录能力与内部线路清单 |
| GET | `/api/v1/transit/live?routeId=` | 线路版本、连接状态、位置、三种时间和新鲜度 |
| GET | `/api/v1/transit/arrivals?routeId=&stationCode=` | 有证据的剩余站数，etaMinutes 固定 null |
| GET | `/api/v1/content` | 同一版本完整内容，两端当前使用这个端点 |
| GET | `/api/v1/content/pois` | nodeId/category/limit/cursor 分页 |
| GET | `/api/v1/content/pois/{id}` | 单地点 |
| GET | `/api/v1/content/walks/{id}` | 单路线玩法 |
| GET | `/api/v1/content/nodes/{id}` | 单文旅节点（不是站牌坐标） |
| POST | `/api/v1/auth/wechat` | wx.login 临时代码 → 我方 opaque session |
| POST | `/api/v1/auth/logout` | 注销当前 session |
| GET | `/api/v1/me` | 我方用户 ID |
| GET/POST | `/api/v1/me/favorites` | 读取 / 增量合并自己的收藏 |
| DELETE | `/api/v1/me/favorites/{id}` | 删除自己的收藏 |
| GET | `/api/v1/admin/integrations` | 服务端管理 token 保护的诊断信息 |
| POST | `/api/v1/integrations/ivy/events` | 签名加密 hello/排班事件回调 |

## 错误与数据状态

HTTP 错误统一为 `{"error":{"code":"...","message":"...","requestId":"..."}}`。401 表示登录失效，403 表示权限/来源拒绝，404 表示真实不存在（不跳第一个地点），409 表示游标/版本冲突，503 表示未配置/内容未发布，500 为内部错误。

实时未配置时返回 200 + `integration.state=not_configured` + 空 vehicles。**200 不等于实时数据可用。**No-data 和零辆车正在运营不是同一事实。过期位置保留在列表以便解释，但地图隐藏超过不可用阈值的点。

## 内容一致性

`/content` 返回已发布内容及按请求时间、容量计算的 availability / availabilityReason，使用 Cache-Control: no-store，不再按内容 version 返回 304。version 只标识发布内容，不代表名额状态；最终资格仍在提交事务中校验。分页游标绑定内容版本和筛选条件；条件变更返回409。当前规模21个地点，两个客户端读取完整内容快照确保 City Walk 的引用来自同一版本；分页接口可支持后续规模增长，不提前引入跨版本列表/详情不一致。

## 身份

Bearer token 为我方随机 opaque token，数据库只保存 hash；不同账号收藏严格隔离。微信 openid/session_key 不返回前端。H5 当前使用本机匿名收藏，没有伪装为微信已登录；微信端可在真实主体配置后登录并合并本机收藏。微信网页登录 OAuth 不在本次范围内。

## 坐标与到站

路线保留 rawPoint(WGS84) 及 mapPoint(GCJ02|null)，不转换成功不画地图。POI 的参考中心位置不能代替站牌。remainingStops 只使用同线路/跑法/方向且新鲜的进离站事件；起点、重复末站、刚离站跨圈均有测试。分钟预测未实现。


## 审查修复后的发布契约

POST /api/v1/admin/content/publish 由 content.publish 权限调用。后台先 GET /api/v1/admin/content/preview，再提交：

```json
{"approved":true,"expectedDraftVersion":"预览返回的 version","approval":{"evidence":"本批内容事实核验及发布审核记录"}}
```

reviewedBy 取认证用户，reviewedAt 由服务端记录，不接受客户端冒用审核人。草稿变化返回 409 REVISION_CONFLICT；缺审核依据返回 APPROVAL_REQUIRED；正式环境禁止未审核发布，已 approved 当前版本也禁止被 reference 覆盖。独立媒体授权校验不放宽。失败保留旧版本。

验证码响应和微信登录响应均为 {token,expiresAt,user}；游客接口必须通过 `Authorization: Bearer <token>` 请求头携带会话，请求体不再接受 `_session`。后台会话每次请求检查当前 staff_roles，角色降级/禁用立即作用于旧 token。验证码失败次数会提交，5 次后当前挑战失效。

## 反馈重试

POST /me/action 的 ticket/privacy 支持 idempotencyKey（16～160 位字母、数字、下划线或横线）。同用户、动作、标识的相同内容只生成一条工单；不同内容复用标识返回 409 IDEMPOTENCY_CONFLICT。H5 与小程序在网络失败重试时复用标识，成功后释放。旧客户端不带标识仍兼容。无需新增数据库迁移。
