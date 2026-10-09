# t-31ef1e 补齐门禁与文档质量类测试夹具

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
补齐门禁与文档质量类测试夹具

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/artifact-openable.test.ts tests/move-rollback.test.ts tests/design-registration.test.ts → 7/7 · 19/19 · 9/9 全绿（改前红读数 1 / 1 / 3）。

## 实施方案（implementation）
按 design/fix-design.md「BUG-1」三行改法执行，只改 tests/：① tests/artifact-openable.test.ts:146 之前补 mkdirSync + 'docs/guides/x.md' 落盘；② tests/move-rollback.test.ts 夹具补六节 requirement.md 与 design 五份落盘，并把五份 design 产物（confirmedAt/confirmedBy 齐）写进 rollbackable() 的 artifacts；③ tests/design-registration.test.ts:74-77 的 writeDesign H1 改 '# '+n+' <!-- serves: FR-1 -->'，:113 的 risks.md 同改。验证：先跑出红读数（1/1/3）再改，改后同命令转绿。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:13:25.272Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

门禁与文档质量类夹具补齐：三文件 5 条红转全绿（7/7 · 19/19 · 9/9）。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：artifact-openable 7/7、move-rollback 19/19、design-registration 9/9，合计 35 passed（改前 5 failed | 30 passed）
- 改动只在三个测试文件：归档合并去向落盘、设计文档集（六节 requirement.md + design 五份 + 产物登记）、writeDesign 带 serves 标注
- 如实留痕一处必要扩面：move-rollback.test.ts:373 的 TC-11 补 requirement_refs（条款覆盖门只读卡上 refs，非生产缺陷，断言未改）

### 改动文件

- `tests/artifact-openable.test.ts`
- `tests/move-rollback.test.ts`
- `tests/design-registration.test.ts`

---
