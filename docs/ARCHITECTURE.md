# 架构与关键决定

## ADR-001：模块化单体，API 和 Worker 独立运行

H5 / 微信小程序 → `/api/v1` → 统一业务服务与数据库。IVY HTTP 基础信息和 MQTT 实时事件由独立常驻 Worker 接入。两进程共用持久层，不依赖彼此内存。MQTT 不在一次 HTTP 请求或 Lambda 的暂存执行环境里启动。

生产使用 PostgreSQL（pg 适配器）；开发/测试使用 Node SQLite WAL，且必须显式选择。现阶段不引入 Kafka、微服务集群或 Redis。容量不足时可加共享读缓存，数据库中的最后有效记录仍是事实来源；不能拿进程内存替代跨进程存储。

## ADR-002：内容节点、交通站点、站序独立

旅游节点使用稳定内部 ID；IVY 的 `lineCode/branchCode/stationCode` 通过配置映射。保留原始外部 ID 字符串，不把 64 位 ID 转成 JavaScript Number。

站点顺序属于 `route.branches[].stops[]` 的一次停靠，不属于节点自身。环线末站可以再次出现起始站 code，但 sequence 必须唯一且连续。第六站、第二线路应通过配置和发布数据扩展，不修改业务页面。

## ADR-003：两个版本维度

内容有人工指定不可变 version；交通线路以完整规范化对象 SHA-256 为版本。数据库 active pointer 在事务内整体切换。新线路的任一站点/轨迹不完整，发布失败并保留上一版。参考内容必须显式初始化，API 错误不回退到内置内容。

参考内容保留 H5 的完整介绍、四条路线及九个节点；不是本轮重新实地核验。生产发布必须带审阅人、审阅时间、证据，并逐项标记来源核验。已有网页图片地址只是候选，不等于可再分发的正式素材。

## ADR-004：时间、连接和营运分离

`locatedAt` 是设备时间，`publishedAt` 是 IVY 推送时间，`receivedAt` 是我方接收时间。新鲜度只按设备时间算。连接状态不决定车辆正在载客；`operationState` 当前始终 unknown，等待运营状态规范。

- integration：not_configured / connecting / connected / error / stopped。
- freshness：no_data / fresh / stale / unavailable。
- stale 阈值不是数据删除 TTL；最后有效记录留在数据库。
- location / stop 分流排序：晚到旧位置不能覆盖新位置，定位不能覆盖进离站状态。
- 同 digest 重放幂等；同车辆同流同时间不同内容记冲突，不任意选择。

## ADR-005：常驻采集所有权和持久 ACK

Worker 每次启动随机 UUID；相同容器标签也不能成为同一 owner。每运营主体只有一个有效租约；租约续约失败退出。消息写入和线路发布在同一事务内条件锁定租约行，失效 owner 不能再写入。MQTT ACK 在持久处理后发生；数据库失败不回成功，触发退出/重连策略。ACK 幂等不等于对外承诺“exactly once”。

HTTP 排班事件先记持久待同步标志，再返回签名加密 success；同步结束用 CAS 清理观察到的标志，不抹掉途中到达的新请求。Worker 定期全量同步纠偏。HTTP 同步和 MQTT 缺参分别判断。

## ADR-006：数据真实性优于假可用

没有坐标不画假的站牌；WGS84 不能直接当 GCJ02。保留原始坐标，使用配置的高德服务端转换接口得到地图坐标；没转换 Key 时 mapPoint=null。转换失败不发布残缺轨迹。

没有实时消息，vehicles=[]；API 返回可解释状态。站数只由新鲜进离站事实与匹配跑法计算，分钟 ETA 永远 null。未提供正式音频显示“阅读讲解”，不把弹文字叫播放成功。

## ADR-007：共享逻辑真实参与构建

`packages/client-core/index.mjs` 的纯函数被 H5 直接使用，同时在构建时生成微信 CJS；两端行为一致由测试验证。共享逻辑包括首页选品、地图图层、坐标校验和站点匹配；正式微信目录是 apps/weapp-native。设计令牌目前生成 H5 CSS 变量；原生 WXSS 独立维护，不宣称两端样式共享或像素一致。两端内容都来自同一发布版本的 API，不保存另一份短文案和演示 POI。

## 部署边界

数据库 schema 已实现迁移；生产 pg/MQTT 运行依赖和网络尚未在本环境验证。前端与 Worker 的“代码可运行”和“公交真实接通”单独验收。生产应按 `docs/KNOWN_LIMITATIONS.md` 的门禁执行。
