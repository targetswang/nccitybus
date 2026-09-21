# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本(SemVer)。发版规则见 [RELEASING.md](./RELEASING.md)。

## [Unreleased]

### Changed
- 微信小程序乘车码改为半屏拉起(wx.openEmbeddedMiniProgram,基础库 ≥2.20.1;低版本自动降级全屏跳转),真机验收清单新增 transitCodeHalfScreen 检查项

### Planned(4.4.1 补丁,对应审计报告)
- 修复权益/活动容量校验竞态(审计 M3)
- 新增 OTP 获取配额,缓解短信轰炸(审计 M5)
- 未审核素材不可达:`/media/` 服务前校验 `match_status='confirmed'`(审计 L1;上传权限本身已限 `media.manage`,无需调整)
- 生产环境禁用 legacy 静态 ADMIN_TOKEN 通道(审计 H1,需运维确认后执行)

## [4.4.0-rc.1] - 2026-09-20

### Added
- 运营后台「线路信息」Tab:线路级文案(routeName/description/guides/privacy)可在后台编辑并显式发布(#8)
- 运营后台版本对比与「补齐已发布内容到后台」(#7)
- 运营后台内容新建、素材上传审核、活动报名闭环(#5)
- AI 运营助手(仅查询与提案,人工确认后写入草稿)
- 高德 POI 2.0 候选池采集(自动结果永不直接发布)

### Security
- 关闭 `_session` body 会话通道,统一 `Authorization: Bearer`(#6;审计 H2)
- 新增共享限流表 `rate_limit_windows`,限流跨实例生效(#6;审计 M1)
- `analytics_events` 90 天保留清理(#6;审计 M2)
- `IMMUTABLE_VERSION` 409 错误信息改为可操作中文指引(#6)

### Fixed
- H5 非异常页面不再显示「刷新内容」重试按钮(#4)
- H5/原生端与后台页面行为对齐:availability 重算、双击防护、幂等重试(#3)

### Known Issues
- IVY 供应商协议使用 SHA-1 签名与 AES-CBC(供应商约束,无法单方升级;审计 M4)
- legacy 静态 `ADMIN_TOKEN` 通道仍可用,生产启用前必须置空(审计 H1)
