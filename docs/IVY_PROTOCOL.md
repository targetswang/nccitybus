# IVY Bus V1.2.5 接入说明与待确认项

依据：公交集团提供的《3.2开放平台V1.2.5_实时公交(含计划).pdf》，不是自行定义供应商行为。本仓库不公开附带该原始文档和任何凭证。

## 已实现

- 所有基础接口采用 POST，URL 加 appKey/signature/timestamp/nonce。
- 对五个**字符串值**排序拼接后 SHA-1；非 HMAC。签名正文与发送正文同一串 UTF-8。
- AES-256-CBC：16 字节随机头 + 4 字节网络序正文长度 + 正文 + appKey；密钥 Base64、IV 前 16 字节；按 Java 示例手动 pad32，关闭默认补位。
- 加密响应验证签名后解密，校验 appKey、长度、补位和时间窗口；不打印签名原文或密钥。
- 独立 Python cryptography 生成测试向量与 Node 实现比对；这不是供应商线上联调结果。
- MQTT 持久处理，分流 `vehicle_location / vehicle_stop`，每条都检查线路、跑法、方向及可选车辆白名单。
- 签名不合法/超时/类型错/越权线路/坏坐标等拒绝；数据库不可用不能 ACK 成功。
- `query_line_detail` 的完整跑法/站序/轨迹 + `query_station` 的真实站点；批次任何一项失败不切换版本。
- 查询排班/车辆/跑法客户端已封装，但一期实时展示不依赖“计划发车时间”伪造 ETA。

## 实际路径冲突

文档 `query_branches` 和排班章节示例存在与标题路径不一致的地方。实现采用各接口定义的路径：`/bus/openapi/v1.0/query_branches`、`/bus/openapi/v1.0/dispatch/query_schedule`。需要供应商确认生产网关前缀及正式路径。

## MQTT 信封是明确拦截项

文档说明强制加密，但没有完整说明 MQTT 线上 payload 的外层签名字段；章节中也有 vehicle_stop 示例错误写成 vehicle_location。

目前实现的预期信封为 `signed-json-v1`：

```json
{"signature":"...","timestamp":"...","nonce":"...","encrypt":"..."}
```

需供应商提供脱敏真实包及确认外层字段。`IVY_PROTOCOL_CONFIRMED=false` 时禁止生产 MQTT 消费，不凭猜测切成明文兼容。禁止用文档 emqx/public、占位 IP 或共享组示例当生产配置。

## 向公交集团收集（秘密通过安全渠道提供）

| 类别 | 参数/确认 |
|---|---|
| HTTP | host 完整前缀、appKey、appSecret、是否 AES、encodingAESKey、测试环境、IP 白名单、QPS/时间偏差窗口 |
| MQTT | Broker/端口/TLS/CA、账号、Topic 完整名称、clientId 规则、是否共享订阅、QoS/补发/会话期限、外层加密签名完整报文 |
| 线路 | lineCode、branchCode、方向，五站 stationCode 与文旅节点对应；可查询 ID，不要求人工重复填全部数据 |
| 车辆 | 自编号规则、动态换线行为、授权车辆清单、设备上报间隔、离线与停场定义 |
| 字段 | accStatus/serviceStatus 是否同时存在、时间单位/时区、异常位置/补传规则、环线首末站重复规则 |
| 到站 | 是否另有 ETA 服务；没有则本版仅展示有证据的进离站/剩余站数 |

## 不是一次授权全部驾驶员信息

前端不暴露司机姓名、工号、车载状态全集、平台密钥和原始报文。私有 ID 在内部保存，车辆前端标识经过运营主体范围内映射。

## 先本地后现场

协议黄金向量 → 模拟上游 HTTP/MQTT 消息 → 供应商测试线路 → 一辆车现场 → 五站闭环。每阶段单独记录环境、请求 ID、脱敏报文哈希、时间偏差与结果。
