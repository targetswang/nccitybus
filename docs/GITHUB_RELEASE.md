# GitHub Release 分支说明

正式候选分支：`release/v4.4.0-rc1`。

## 目录责任

- `apps/weapp-native/`：正式微信原生小程序；
- `apps/h5/`：游客 H5；
- `apps/admin/`：运营管理后台；
- `apps/api/`：统一 HTTP API；
- `apps/transit-worker/`：IVY 公交数据常驻 Worker；
- `packages/`：业务核心、数据层、契约、IVY、共享客户端逻辑；
- `deploy/`：生产依赖、Nginx/systemd、微信 CI；
- `tests/`：自动测试；
- `audit/`：本候选版本验收证据；
- `docs/`：架构、API、部署、数据库、安全、测试、交接。

## 版本策略

该分支用于可交接 RC，不直接等于 production。真实微信 preview/双端真机、正式短信、真实 AI Key、IVY 现场接入、目标生产 PostgreSQL release gate 完成后再进入正式版本。

不要在 `main` 上直接实验。新增功能使用 feature 分支并经 CI/验收后合并。
