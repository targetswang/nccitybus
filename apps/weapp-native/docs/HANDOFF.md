# 研发交接与上线清单

游客 H5：`app-3hu1sz`；运营后台：`app-sz13s5`。小程序当前 API Base URL 指向游客 H5 统一网关。

正式上线需补：正式小程序 AppID/Secret、合法域名、短信、地图 Key、IVY HTTP/MQTT、乘车码 AppID/Path。模型如切 DeepSeek/Kimi，密钥仅通过服务端 Secret 管理。

当前约束：有限名额权益/活动在预览 KV 中禁止发布；图片需要匹配和使用范围证据；AI 只生成提案；生产必须去掉固定测试验证码；微信开发者工具、iOS/Android 真机、公交实车独立验收。
