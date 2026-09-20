# 数据字典

## 内容域

### tourism_node
- id
- name
- persona
- mapPoint（仅核验后的 GCJ02）

### poi
- id
- nodeId
- name
- category
- subcategory
- address
- description
- openingHours（未知留空）
- priceAdvice（未知留空）
- coverMediaId
- mapPoint
- narration
- audioUrl
- sourceUrl
- lockedFields

### city_walk
- id
- title
- subtitle
- duration
- bestTime
- audience
- coverPoiId
- story
- tags
- steps
- practical

每个步骤必须引用真实 POI，不允许缺失时回退到第一条记录。

## 页面域

### home
- title
- heroTitle
- heroSubtitle
- notice
- featuredWalkIds
- maxBanners

### banner
- id
- title
- subtitle
- coverMediaId
- targetType
- targetId
- startsAt
- endsAt
- priority
- placement

## 用户域

### user
手机号不是主键。
- internal userId
- phoneHash
- phoneMasked
- status
- testIdentity
- verificationMethods
- tags

### session
- userId
- audience
- role
- expiresAt
- revoked
- authMethod

## 会员与权益

### membership_plan
规则定义。

### membership
用户加入后的具体实例，保存加入时规则版本。

### benefit
公开的权益说明及资格要求。

### grant
用户领取后冻结：
- terms
- provider
- fulfillmentPayload
- expiresAt

`fulfillmentPayload` 不进入公共 `/content`。

## 活动

### event
活动定义。

### registration
用户报名事实。

活动报名与公交预约数据完全分开。

## 媒体

### media
- path
- hash
- mime
- sourceUrl
- rightsConfirmed
- matchConfirmed
- evidence

图片文件存媒体存储，数据库存元数据与证据。

## 发布

### publication
不可变游客内容快照。

### publicationHead
当前正式发布版本指针。

## 运营

- recommendation
- partner
- channel
- source
- notification
- audit
- job
- aiTask
- proposal

## 状态原则

内容：`draft -> review -> approved/offline -> publish`

账户、权益、报名、消息等业务事实不能通过内容回滚删除。

公交接入状态与数据新鲜度分开：
- integration state
- freshness

不得用模拟数据掩盖 `not_configured / stale / unavailable`。
