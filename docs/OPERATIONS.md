# 部署、迁移、恢复与运维

## 本机开发

根目录执行 README 命令；SQLite 位于 `var/`，WAL 允许 API 与 Worker 两进程共享同一主机数据。此模式不是生产数据库兼容性的替代验证。

## 正式部署（必须通过门禁）

1. 受控构建环境安装生产驱动：`npm ci --prefix deploy/integrations --ignore-scripts --no-audit --no-fund`，使用已提交的锁文件。完成依赖扫描及许可审核。
2. 提供生产 transit/client JSON、PostgreSQL、HTTPS API 域名、可信反向代理地址、私密挂载文件；`NODE_ENV=production`。
3. 运行数据库迁移，审核并显式发布内容；不要启动时自动写 reference seed。
4. 构建客户端。用同一 Git commit 和内容 version 部署 API 与 Worker。
5. API 和 Worker 是两个系统进程/容器，各有 supervisor；Worker 不放在短生命周期函数里。不要开两个跨环境共享消费组。
6. `node scripts/release-gate.mjs` 只是本地发布前置检查；即使返回 requires_external_acceptance，也不是允许省略供应商/微信/实车验收。

仓库提供 systemd/Nginx 配置示例。它们没有在此环境实际安装启动，不含生产口令。TLS 证书、数据库授权/网络访问必须由运营方部署。

## 日志和状态

- `GET /api/v1/health`：API/DB 状态。
- 管理 token 调 `/api/v1/admin/integrations`：凭证缺项名称、MQTT/Worker/同步状态，不返回值。
- 日志仅记 requestId、事件种类、错误码、耗时；不打印原始签名明文或定位报文全集。
- 监控：Worker heartbeat 超时、消息队列积压、拒绝包速率、设备时间滞后、路线路径版本不变、同步失败。
- POSITION_FRESH_MS / STALE_MS 是可配置初始值，正式阈值须按设备上报间隔实测，不是供应商 SLA。

## 数据保留

位置最后有效值不因 freshness 过期删除。幂等收据保留7天、审计事件30天、session 到期删除，按本地 housekeeping 实现；正式时需按业务与数据安全要求审核周期。历史轨迹全量归档、消息历史重放服务未建设，不声称支持。

## 内容回滚与数据库恢复

```bash
node --env-file=.env scripts/publish-content.mjs path/to/catalog-new.json
node --env-file=.env scripts/publish-content.mjs --rollback previously-published-version
```

内容版本不可覆盖。生产回滚仍须确认该版本 approved；API 拒绝 reference，即使被误设为 active。数据库迁移不可依赖“清空数据重建”。先备份再升级；生产用 DBA 批准的 PostgreSQL backup/restore，恢复后验证账号收藏、active version、设备时间及 Worker 租约。

单机开发备份 SQLite 时应停止两进程后复制数据库，或使用 SQLite 支持的备份方式；不要只拷贝正在运行的 `.sqlite` 而忽略 WAL。

## 自有实景图片

```bash
python -m pip install -r scripts/requirements-media.txt
python scripts/import-media.py media-approved.json --catalog packages/content/catalog.reference.json --out catalog-candidate.json --version 2026-09-19.media.1
```

必须显式确认来源 host、场地匹配和再分发权利。脚本拒绝私网、重定向、超大/过小图片，自动转 RGB、去 EXIF、按 focus 裁1200×675并产内容 hash WebP。产出为新待审内容，不自动发布；UI只引用自己的 `/media/`。媒体归档应进入运营方对象存储/CDN，外部链接被发现不等于授权完成。

## 故障规则

认证失败不重试为明文，MQTT断连不回退模拟值，PG错误不回退SQLite。坏包拒绝并留错误码；存储失败不成功ACK。SIGTERM 会取消同步、排空待处理、断开MQTT和释放租约；异常退出由 supervisor 处理。
