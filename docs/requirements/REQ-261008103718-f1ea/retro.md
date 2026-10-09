# 复盘（retro）· REQ-261008103718-f1ea 立项弹框失效

## 时间线

1. 用户报"立项弹框不出现"。
2. **误判 1**：以为 `package.json` 的 `dsh.client.inject` 缺 `userQuestions` 声明 → 加上后**客户端 entry 永远 pending**（浏览器侧无此 host 服务）→ boot 断言失败 → 整个 UI 不挂载 → 回滚。
3. boot 失败触发桌面端"禁用所有插件"恢复 → **清空 `cordis.patch.yml`** → 用户配置的 kimi 模型丢失 → 从 `.bak` 备份恢复。
4. **误判 2**：以为是 `NO_PROVIDER`（瀑布无 answerer）→ 加瀑布注册 → 仍失败。
5. 加 `[UI-0..5]` 诊断（落文件，stdout 在桌面端不可读）→ 第一次看见真错误：`api gateway: Remote event request is not lossless JSON data`。
6. 修 `questions` 里 `description: undefined`（源头 + 通道清洗）→ **仍失败**（因为真机实际走的是 `askTimed` 透传分支，不是 `ask()`）。
7. 用户提示"查看 git 看看和之前有什么不同" → 发现**打包版宿主有 `askTimed`**（源码 checkout 没有）→ 定位透传分支的 `callId=undefined` → 移除透传、走官方 `ask()` → **弹框恢复，实测立项成功**。

## 误判为什么发生

- **错误没有 code**：`not lossless JSON data` 被上层 catch 落进"用户取消"分支 → 谎报「用户未作答」+ 记 cancel 留痕 → 触发 30 分钟"取消粘滞"。**通道故障被写成了人的选择**，排查方向被彻底带偏。
- **stdout 不可读**：桌面端 host 的 `console.log` 看不到，缺文件诊断时等于盲调。
- **测试 mock 与真机形状不一致**：单测 mock 服务只有 `ask`、没有 `askTimed` → 走本地竞速 → 一直绿；真机宿主有 `askTimed` → 走透传 → 失败。bug 因此漏网 CI。

## 教训（对应防再犯措施）

1. **通道故障必须如实上报，不许说成"用户取消"** —— 无 code 的异常要单独分支处理并落诊断（`[UI-5]`）。
2. **先加观测再改代码** —— 诊断落文件（`captureDiag` → `~/.dsh/state/reqboard-capture-diag.log`），stdout 不可读时仍有可靠观测面。
3. **测试 mock 要覆盖真机的新形状** —— 宿主新增方法（如 `askTimed`）时，mock 也要造出来，否则"透传分支"永远测不到。
4. **remote 请求体必须无损 JSON** —— `undefined`/`NaN`/`Infinity`/`-0`/类实例全非法；上游用条件展开，通道边界用 `stripUndefinedDeep` 兜底。

## 做对的地方

- 坚持"先复现再判定"：用诊断日志的**失败 → 通过对比**作为验收证据，而非"改完看起来好了"。
- 修复后补了**运行时 + 静态**两道测试护栏，并实测护栏能抓住同类违规（临时注入违规写法 → 测试失败）。
- 适配层模块注释完整记录事故与判据出处，防止后人重犯。
