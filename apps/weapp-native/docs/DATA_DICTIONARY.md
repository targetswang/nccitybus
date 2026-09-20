# 数据字典与状态规则

- tourism node：稳定文旅节点 ID、name、persona、mapPoint。
- poi：稳定地点 ID、nodeId、category、subcategory、address、description、coverMediaId、mapPoint、narration。
- city walk：稳定 ID、title、coverPoiId、steps、tags、practical；步骤引用真实 poiId。
- home/banner/announcement：页面配置、资源位、时间窗、跳转业务对象。
- user：内部 userId、脱敏手机号、phoneHash、status、testIdentity。手机号不是数据库主键。
- membershipPlan/membership：规则与用户会员实例。
- benefit/grant：公开权益定义与领取时固化的用户权益实例；公开 content 不返回私密 fulfillmentPayload。
- event/registration：活动与报名实例；活动报名不是公交预约。
- recommendation：有范围和有效期的运营加权；游客端不展示内部评分。
- media：自有存储 path/hash/来源/匹配/权利证据。
- publication：游客内容快照；publicationHead 指向当前版本。

状态：内容 draft -> review -> approved/offline -> 发布后生效。公交状态与数据新鲜度分离，不用模拟值补缺口。
