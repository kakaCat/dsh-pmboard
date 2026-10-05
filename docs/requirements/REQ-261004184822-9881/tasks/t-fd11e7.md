# t-fd11e7 列直通到底：列高铺满可视区、列内自己滚

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
列直通到底：列高铺满可视区、列内自己滚

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/board-lane-scroll.test.ts 全绿（含 TC-6）；grep -c "max-height: calc(100vh" src/client/styles/base.ts = 0；pnpm build:client 输出 [verify-client] OK。

## 实施方案（implementation）
改 src/client/styles/base.ts §泳道三条规则：.dsh-pm-lanes 的 align-items: flex-start → stretch 并补 min-height: 0；.dsh-pm-lane 删 max-height: calc(100vh - 200px) 并补 min-height: 0；.dsh-pm-lane-cards 的 min-height: 24px → 0（overflow-y: auto 保留）。不新增 DOM 层级/class。在 tests/board-lane-scroll.test.ts 追加 TC-6：读该样式源码文本取三个规则块，断言 .dsh-pm-lanes 含 align-items: stretch、.dsh-pm-lane 块不含 max-height: calc(100vh、.dsh-pm-lane-cards 块仍含 overflow-y: auto。

## 上游产出摘要（dependsSummary）
- 刷新别把人弹回去：把它接在重绘那两行上

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T11:05:43.389Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

这一步做完，泳道「直通到底」有了样式与断言：列从列头铺到看板底部，长列在列内自己滚、列头不消失。

### 完成项

- 各状态列由「只包住内容」改为铺满看板可视高度，空列与满列同高
- 列内卡片区成为唯一滚动处：列头固定，长列能翻到最后一张
- 矮窗口下列高跟着变矮、列内容不撑破看板（min-height: 0 链保证）
- 只改样式、不加层级：列宽、列序、卡片样式、归档条一律未动
- 子链四段走完：研发（15 passed）、联调（产物与样式分片 OK）、复核（无偏离、未新增选择器）、测试（全量失败 98 未新增）

### 改动文件

- `src/client/styles/base.ts`
- `tests/board-lane-scroll.test.ts`

### 下一步

接 t4：四门禁 + 在 GUI 上做 TC-7 手工验收并留证据

---
