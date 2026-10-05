# t-7cd77f 存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
npx vitest run tests/client/settings-storage.test.ts 全绿：consent 不进 localStorage；403 confirmation_required → 显示『确认已失效，请重新确认』并清票据且不自动重试；六类错误各命中独立文案（不含泛化『出错了』）；failed 后点『重来一次』必须先弹确认门。

## 实施方案（implementation）
新增 src/client/views/settings-storage.ts（后端开关、迁移五步清单、idle→requesting→confirm→落章→running→done/failed 四态机、consent 只存内存不落 localStorage、403/502/503/409/500 各独立文案、失败态重试必须重新走确认、跳转复用注入的 jumpToWindow）；追加 src/client/styles/settings.ts；新增 tests/client/settings-storage.test.ts。

## 上游产出摘要（dependsSummary）
- 设置弹窗骨架与入口（挂 body、左菜单、关闭语义、API 客户端）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T09:55:46.140Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

这张卡做完，看板上的「数据库开关」是一屏人能看懂的操作面：选目标、弹确认、看清要动什么（多少条、要备份、不过就回滚）、再执行；而「确认已失效」「库还没迁移」这些情况各有各的话说，不会被一句「出错了」糊过去。

### 完成项

- 存储与数据库屏落地：后端概览、切库开关、确认面板、迁移五步清单、错误区
- 点开关 → 取票（真确认框推出）→ 面板列清影响与条数 → 带票执行；面板不冒充『那个同意』（裁定理由写在注释里给后人）
- 票据只存内存、任何失败都清票、重试必须重新取票、不自动重试——均有行为用例
- 七类错误文案各自独立，保留服务端原话；未知码优先透出原话
- 迁移清单只标可观测事实（条数按 stores 真实显示），不显示百分比、不替 Agent 汇报它没汇报过的事
- 档案损坏时一律不取数（损坏档案里的数字不可信），退回保守文案
- 31 条用例 + 邻接 106 项全绿；构建产物 379010 字节 verify 全过

### 改动文件

- `src/client/settings/storage.ts`
- `src/client/settings/render/storage.ts`
- `src/client/settings/model.ts`
- `src/client/settings/controller.ts`
- `src/client/settings/render/shell.ts`
- `src/client/settings/types.ts`
- `src/client/styles/settings.ts`
- `tests/settings-storage.test.ts`
- `docs/requirements/REQ-261004103330-005f/notes/t7-upstream-notes.md`

### 下一步

t14 系统记录与通用屏（最后一屏）

---
