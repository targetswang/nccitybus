# 测试与验收

使用 Node.js 22.16.0，在仓库根目录执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run check
npm test
python tests/media_test.py
```

`build` 编译正式原生 TypeScript 为 JS，并生成与 H5 同源的共享逻辑。`check` 核对 19 页注册、组件和 require 引用、TypeScript、内容引用、共享摘要及文档链接。它不调用微信 WXML 官方编译器。

| 测试文件 | 重点 |
|---|---|
| client-parity.test.mjs | 实际 H5 / 原生 HTTP 适配器；后台发布版本→原生首页；会员/活动跨端回读；客服回复；原生地图 |
| client-native.test.mjs | 正式构建产物、共享逻辑、坐标过期、网络失败、底栏及讲解组件 |
| review-client-session.test.mjs | H5 hook / 原生会话服务经过真实 API 登录、账户动作、注销 |
| review-regressions.test.mjs | OTP 失败累计、角色撤权、审核发布、下架、站点并发修订及升级迁移 |
| 其他 tests/*.test.mjs | API、持久层、Worker、IVY、AI、媒体运营与契约 |
| media_test.py | 本地媒体处理；不代表素材授权已核验 |

结果以最终 commit 的 GitHub Actions 为准；本地静态报告在 `audit/local/static-check.json`，构建清单在 `dist/build-manifest.json`。历史阶段报告不能作为新提交的通过证明。

PostgreSQL 16 在隔离 CI 中迁移、导入、发布回读，并执行审查回归。`accept:postgres` 只允许专用测试库及显式确认，不用于生产库。

微信验证分为：TypeScript/逻辑测试、官方工具链安装、官方 preview、iOS/Android 真机。前两项不能替代后两项。正式外部集成与部署最终由 release-gate 和现场证据验收。
