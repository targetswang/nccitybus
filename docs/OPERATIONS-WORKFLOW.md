# 运营后台开发与验收

本次优先闭环：新建活动 → 上传并审核图片 → 选择封面 → 新建首页 Banner → 显式审核发布 → H5 报名 → 后台查看报名记录。
H5 与原生小程序读取同一 `/api/v1/content` 发布快照；保存草稿不会修改线上版本。登录方式沿用现有实现。

## 启动与登录

使用 Node 22.16.x、Python 3 和 Pillow。首次启动：

```sh
npm ci
python3 -m pip install -r scripts/requirements-media.txt
npm run build
npm run db:migrate
```

空数据库先使用现有内容导入工具初始化路线基础数据（见 `scripts/import-content-model.mjs`）。不要把验收数据导入生产库。
开发环境设置 `TEST_LOGIN_CODE=246810`，并设置 `INITIAL_ADMIN_PHONE_HASH` 为 `sha256('phone:'+自己的11位手机号)`。例如计算哈希：

```sh
node -e "console.log(require('node:crypto').createHash('sha256').update('phone:13900008001').digest('hex'))"
```

把输出值设为 `INITIAL_ADMIN_PHONE_HASH` 后运行 `npm start`，访问 `http://localhost:3000/admin/`。输入对应手机号，先点击“获取验证码”，再输入 `246810`。`13900008001` 仅为自动验收手机号，不是已经开通的生产账号。生产使用真实短信，不支持固定验证码。已有管理员通过“设置 → 人员权限”授权其他账号。

## 操作步骤

1. 内容管理 → 媒体素材：上传 JPG、PNG、WebP（单文件最多 3 MiB、1600 万像素，不支持动态图）。服务端真实解码、移除元数据、转为 WebP，并按内容哈希存储。
2. 点击素材“审核”，填写版权授权依据和内容匹配依据，两项确认后才能被新活动或 Banner 选择。
3. 活动与权益 → 活动 → 新建内容：填写标题、介绍、规则、地点、报名开放时间和名额，选择封面并保存草稿。名额 0 表示不限；时间按浏览器当地时区输入，保存为带时区 ISO 时间。“关闭报名”禁用免费报名。
4. 内容管理 → Banner → 新建内容：选“活动”作为跳转类型，在目标下拉框选择刚创建的活动。保存草稿。
5. 点击“发布当前内容”，填写本次内容审核依据。系统校验当前草稿版本、跳转引用和素材审核状态；失败保留原发布快照。
6. H5 首页点击 Banner，游客登录并免费报名；后台“活动与权益 → 报名记录”查看最近 500 条记录、状态及脱敏手机号。

## 前后端对应

| 后台操作 | 接口 | 存储 / 消费方 |
| --- | --- | --- |
| 新建活动、Banner、公告、会员方案、权益 | POST `/api/v1/admin/content/{kind}`，`{data:{…}}` | 对应业务表 + `content_edit_history` |
| 编辑运营内容 | POST `/api/v1/admin/content/{kind}/{id}`，`{expectedRevision,data}` | 乐观版本校验；保留 ID |
| 上传图片 | POST `/api/v1/admin/media/upload`，`{name,base64}` | `media_assets` + `media_audit_log` + `var/media` |
| 审核图片 | POST `/api/v1/admin/media/{id}/review` | 独立版权、匹配审核 |
| 草稿预览 / 发布 | GET `…/content/preview` / POST `…/content/publish` | 不可变发布快照 |
| 游客报名 | POST `/api/v1/me/action`，`{action:'register',id,accepted:true}` | `event_registrations`；原有容量及重复报名控制 |
| 查看报名 | GET `/api/v1/admin/registrations` | `user.read` 权限，最多 500 条 |
| H5 / 小程序读内容 | GET `/api/v1/content` | 同一发布版本；运营封面转换成绝对 URL |

`kind` 本轮新建支持 `events`、`banners`、`announcements`、`membershipPlans`、`benefits`。素材关联使用 `coverMediaId`；服务端依据素材库生成封面路径和审核信息，不接受客户端自行填写审核证明。素材使用列表包含上述运营内容和 POI 引用。

## 验证与范围

- `npm test` 包含真实 HTTP 完整闭环，检查游客越权、无效图片、未审核素材、跳转目标、版本冲突、发布隔离、报名记录和审核撤销后阻止再次发布。
- `python tests/browser/admin-operations.py` 在独立临时 SQLite 库中操作真实后台和 H5 页面；依赖 Playwright Chromium，CI 自动执行并上传截图与结果。测试图片是程序生成的验收素材。
- Nginx 上传路径允许 5 MiB JSON 请求，其余路径保持原限制。部署需安装 Pillow，并持久化及备份 `var/media`。
- 本轮未新增站点、POI、攻略的新建表单；保留现有编辑及采集流程。未增加音频上传、素材物理删除、报名导出或分页；避免误删已发布快照引用文件。
- 素材审核撤销会阻止后续发布，不会回写已有发布快照；紧急撤稿请先移除封面或下架相关内容，再发布。
- 这里只验证本地和 CI 业务闭环，不代表生产短信、微信真机或线上部署验收。
