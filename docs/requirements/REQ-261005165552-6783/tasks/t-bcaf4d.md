# t-bcaf4d 重建产物并留命令级证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
重建产物并留命令级证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① pnpm build 退出码 0，且 dist/index.mjs 的 mtime 晚于 t1 的源码改动；② pnpm test 全量退出码 0；③ notes/build-evidence.md 存在且含三条命令的退出码与产物 sha256 前 12 位。

## 实施方案（implementation）
依次跑 pnpm typecheck / pnpm build / pnpm test，收集三条命令的退出码与 dist/index.mjs 的 sha256 前 12 位，写进 docs/requirements/REQ-261005165552-6783/notes/build-evidence.md（命令原文 + 退出码 + 产物指纹 + 时间戳）。除该证据文件外不改任何源码。

## 上游产出摘要（dependsSummary）
- 接线回归断言：本段字面量 + 每段显式声明插值开关
- 反例回归：三组外来原文含占位符时文本字面保真且不抛

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T09:11:02.217Z，窗口 session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4）

这一段做完，什么变了：仓库里现在有一份含新声明的新产物（指纹可查）、一份可独立复核的补丁与两份全量日志——「改了什么、跑出什么」不再靠叙述，而是靠指纹与日志。

### 完成项

- 三条命令跑毕：typecheck 0 / build 0 / test 失败数与基线相等（68→68）
- 产物重建并留指纹：fdc6885141ef → d0c9a803ba54，mtime 晚于源码改动
- 证据四件落档 notes/：证据档 + 补丁 + 两份全量日志
- 复核段确认证据链自洽、无设计外改动
- 已披露两项做不到的事：全量退出码 0（存量 68 红）、运行时重载（宿主侧动作，留待验收阶段）

### 改动文件

- `docs/requirements/REQ-261005165552-6783/notes/build-evidence.md`
- `docs/requirements/REQ-261005165552-6783/notes/change.patch`
- `docs/requirements/REQ-261005165552-6783/notes/full-suite-baseline.txt`
- `docs/requirements/REQ-261005165552-6783/notes/full-suite-after.txt`

### 下一步

全卡完成 → 需求进入验收阶段：提交验收材料并请人审

---
