# t-9b2ca1 任务投影单点：透传 parentId（FR-1）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
任务投影单点：透传 parentId（FR-1）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/sheet-projection.test.ts tests/verification-sheet.test.ts 全绿（实测 14/14）；证伪检查（必须执行并留证）：临时删掉 toSheetTasks 返回对象里的 parentId 后重跑，TC-1.1 必须变红，随后恢复；grep -c "toSheetTasks" src/application/use-cases/SubmitVerification.ts ≥1 且不再出现内联 acceptance: t.acceptance 投影。

## 实施方案（implementation）
新增 src/application/internal/sheet-tasks.ts（SheetTaskInput + toSheetTasks：剔 canceled、保持顺序、parentId 空串或缺省不写键）；SubmitVerification 的内联 filter+map 投影改为 toSheetTasks(targetTasks)；新增 tests/sheet-projection.test.ts（TC-1.1 投影保留 parentId / TC-1.2 空串归一 / TC-1.3 canceled 剔除 / TC-1.4 投影产物过 domain 过滤只剩父卡）；抬头补 serves:。

## 上游产出摘要（dependsSummary）
- 前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T12:28:49.103Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

验收单不再被同一交付的子卡重复占位：子卡归属被真的送到过滤那一环，并且有「删掉就变红」的用例守着。

### 完成项

- 任务投影补上 parentId（新增 sheet-tasks.ts 单点，SubmitVerification 改走它）——domain 侧二次过滤从「恒等通过」变成真的过滤
- 用例：tests/sheet-projection.test.ts 4 条 + tests/verification-sheet.test.ts 10 条，合计 14/14 全绿
- 证伪检查留证：删掉投影里的 parentId → TC-1.1/TC-1.4 变红；恢复 → 全绿
- 子卡链 4 段（研发→联调→复核→测试）全部完成并逐段留证

### 改动文件

- `src/application/internal/sheet-tasks.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/sheet-projection.test.ts`

### 下一步

关闭 t1，进入 FR-2（t2）卡链。

---
