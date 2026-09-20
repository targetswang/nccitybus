# 来源和版本说明

- 基线H5：AppDeploy app-3hu1sz，读取快照1789775010896。原组件/业务缺陷见上一轮架构复审。
- 本轮统一源码：nanchong-city-tour v2.0；重组API、Worker、两端平台adapter并新增可执行测试；未修改原AppDeploy线上快照。
- 参考内容：上述H5完整City Walk及POI资料；保持原故事文本与路线，不把继承内容误标为本轮新核验事实。
- IVY协议：公交集团V1.2.5 PDF；SHA1/AES封装严格跟随文档示例。真实MQTT信封待确认。
- React生产运行时：附带版本19.1.1，出处与MIT许可在 THIRD_PARTY_NOTICES.md；该运行时没有使用远程CDN加载。
- 所有测试凭证、车辆、坐标仅位于 tests/fixtures 或测试构造，不作为正式数据发布。
- 本轮审计为开发方自检，不是独立第三方审计报告；不能保证“没有任何漏洞”。
