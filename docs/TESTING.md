# 测试与验收

## 1. 本地自动回归

```bash
npm run build
npm run check
npm test
python tests/media_test.py
```

当前候选的最后一次完整 Node 回归：76/76 通过；媒体处理：5/5 通过。证据在 `audit/phase44/`。

## 2. PostgreSQL 16

GitHub Actions `Production PostgreSQL compatibility acceptance` 已真实运行 PostgreSQL 16，验证 migration、5/21/4/9、草稿隔离、发布读回。

## 3. 微信

分三层：

1. TypeScript / 静态结构：本地 build/check；
2. 官方 `miniprogram-ci` 工具链：CI 已安装、锁定、版本检查；
3. 官方 preview/upload + iOS/Android 真机：必须真实 AppID/私钥/设备，当前仍 blocked。

工具链可安装不等于微信真机验收通过。

## 4. 外部集成

AI、短信、微信 Secret、IVY 都必须留下真实验收记录。模拟上游只能验证代码路径，不能代替 live acceptance。

## 5. 发布判定

只有 `scripts/release-gate.mjs` 所要求的生产条件全部满足，才能从 RC 进入正式生产版本。
