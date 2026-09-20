# 微信官方预览与真机验收

## 官方工具链

官方工具链隔离在 `deploy/wechat-ci/`，不进入生产运行时。

```bash
npm ci --prefix deploy/wechat-ci --ignore-scripts --no-audit --no-fund
npm run build
WECHAT_MINIPROGRAM_APP_ID=wx... \
WECHAT_UPLOAD_PRIVATE_KEY_FILE=/secure/path/private.key \
node scripts/wechat-preview.mjs
```

成功后必须生成：

- `audit/wechat/preview-result.json`
- `audit/wechat/preview.jpg`

上传私钥只能放 Secrets/受控文件系统；不得提交仓库、聊天或日志。微信侧还需配置代码上传 IP 白名单。

## 真机最低矩阵

复制 `deploy/wechat-device-acceptance.template.json` 为 `audit/wechat/device-acceptance.json`，分别使用至少一台真实 iOS 与 Android 设备完成：

- 启动/首页；
- `wx.login`；
- 获取手机号授权；
- 统一内容读取；
- 收藏写入并回读；
- 客服提交并回读后台回复；
- 地图/导航动作；
- 弱网/失败/重试；
- 返回栈、Tab 切换、页面不丢状态。

每个平台必须填写设备型号、系统版本、微信版本以及截图/录屏/日志证据路径。然后执行：

```bash
npm run accept:wechat-device
```

缺 iOS 或 Android 任意一端，脚本返回 exit code 2。
