# 媒体素材与 POI 自动采集运营说明

## 媒体素材

“发现一张图片”不等于“可以发布”。后台必须分别记录：

1. `rights_status`：版权/授权是否确认；
2. `match_status`：是否确认图片属于目标地点/门店；
3. `storage_path`：是否已经由受控媒体导入流程保存为本地内容寻址 WebP；
4. `evidence`：授权依据、地点匹配依据、审核人和时间。

只有三项均满足（rights confirmed + match confirmed + owned storage）才允许设为地点封面；设封面只改草稿，不自动发布。

## POI 自动采集

后台“POI采集”调用服务端高德周边搜索。请求中心点必须是 GCJ02，经纬度可来自已核验站点或由运营临时填写。

自动结果进入候选池：

`pending_review → approved/rejected → imported`

其中 `approved` 必须人工选择游客端业务分类、写介绍草稿和审核备注；`imported` 仅写入统一内容草稿。只有内容发布操作后 H5/小程序才可见。

采集返回的商家图片 URL 仅作为未授权候选，不会自动下载、自动设封面或视为已取得版权。
