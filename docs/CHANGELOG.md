# v2.0 对上一轮复审的响应

| 整改ID | 上轮问题 | 本轮改动 | 可定位证据 |
|---|---|---|---|
| R01 | 统一ZIP缺实际H5/backend | 自包含源码及构建产物，不再下载另一个ZIP | README, scripts/check.mjs |
| R02 | shared空目录 | client-core真实生成ESM/CJS，设计参数生成两端样式 | scripts/build.mjs, client-native tests |
| R03 | API失败偷偷返回演示数据 | 两端错误态，服务端未配置可解释 | api/client-native/browser tests |
| R04 | City Walk缺引用/文案截断 | 一份21地点/4玩法/9步骤完整内容，发布前校验 | contracts/catalog tests |
| R05 | 地图按钮只切标签 | mapScene按图层生成实际markers | client-native tests |
| R06 | 假导航/假播放 | 精确坐标才导航；无音频阅读文稿 | platform/narration tests |
| R07 | CSS层叠历史垃圾 | 新模块化CSS与实际设计参数，清除旧票务模型 | H5styles, static-check |
| R08 | HTTP Lambda常驻MQTT混用 | 独立API/Worker、共享DB、幂等和持久ACK | worker/storage/ivy tests |
| R09 | 缓存失效删事实/乱序覆盖 | 三时间、独立流排序、保留最后值、新鲜度 | storage-transit tests |
| R10 | 初始化seed不是同步 | 不可变内容/交通版本、全量校验原子切换 | repository/sync tests |
| R11 | 仅页面文件存在就宣称完成 | 构建/业务/DOM/官方工具/真实网络分开报告 | audit/ |
| R12 | 接手依赖聊天/浮动文件 | 实际目录、契约、迁移、运行手册、锁门禁 | docs/scripts |

本轮回归发现并进一步修复：同标签容器owner冲突；慢HTTP同步前租约不续期；旧请求覆盖新请求；消息/线路发布丢失租约仍能写；失效worker覆盖新worker状态；地图刷新重置视角；旧位置仍在地图显示；空经纬度冒充位置；参考内容改个标签就误通过审核。

# v4.4.0-rc.1 — 运营自动化与生产门禁

- 三端继续统一到 `/api/v1` 与 normalized content/user 数据模型。
- 运营后台新增完整媒体素材视图、版权/地点匹配审核、审计记录和设封面草稿。
- 新增高德 POI 周边候选采集、人工审核、分类映射、导入草稿；自动结果禁止直接发布。
- 正式短信 OTP 改为生产 HTTPS 网关动态验证码，测试固定码仅保留在非生产环境。
- 新增 AI / 微信 / 短信 live verification；只保存脱敏结果和延迟，不保存 secret/token/验证码。
- 新增 migration 004：POI候选、媒体审计、外部集成验收、短信送达挑战。
- PostgreSQL 16 GitHub CI 真实通过 migration、1/5/21/4/9、draft isolation、publish readback。
- `pg 8.16.3` / `mqtt 5.10.4` 真实 transitive lock 由 CI 生成。
- `miniprogram-ci 2.1.31` 官方微信工具链完成隔离安装、锁定和版本检查；真实 preview/真机仍 blocked。
- 新增微信 preview 门禁、iOS+Android 真机证据门禁和 production release gate。
- 第二轮本地回归：Node 76/76，媒体 5/5，build/check 均通过。
