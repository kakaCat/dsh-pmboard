# t-f38bac 验收锚点存在性守卫（FR-2）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
验收锚点存在性守卫（FR-2）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/sheet-anchor-gaps.test.ts 全绿（7 条：存在不报 / 缺失点名 / 多失效只出一条项 / pending+consistency+requirement 来源 / 非测试文件不触发 / canceled 不征集 / 无 tests 目录整段跳过）；grep -n "anchorGaps" src/domain/workflow/AcceptanceSheetSpec.ts src/application/use-cases/SubmitVerification.ts 均命中。

## 实施方案（implementation）
content-gate-wiring.ts 新增 collectMissingAnchors（workspacePathCandidates 取候选 → 过滤 /^tests\/.*\.(?:test|spec)\.(?:ts|tsx|js|mjs)$/ → docs.exists 为假即失效，输出 "<卡> → <路径>" 去重排序；无 tests/ 目录则整段跳过）；AcceptanceSheetSpec 新增 SheetBuildInput.anchorGaps 与一条需求级项（gapKind=consistency、criterion 前缀固定「验收锚点失效」）；SubmitVerification 在 mutate 前调用并透传；新增 tests/sheet-anchor-gaps.test.ts。

## 上游产出摘要（dependsSummary）
- 任务投影单点：透传 parentId（FR-1）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T12:30:46.581Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

「单子上的步骤跑不起来」不再靠人撞墙发现：验收标准引用了不存在的测试文件时，验收单会自己列出来并点名到路径。

### 完成项

- 验收锚点失效从「静默」变成「可见项」：探针判定 → 需求级提示项（前缀「验收锚点失效」、gapKind=consistency、不阻断提交）
- 用例：tests/sheet-anchor-gaps.test.ts 7/7；整链用例 tests/sheet-selfproof.test.ts 通过
- 护栏：工作区无 tests/ 目录时整段跳过（避免裸夹具工作区全量误报）
- 子卡链 4 段（研发→联调→复核→测试）全部完成并逐段留证

### 改动文件

- `src/application/internal/content-gate-wiring.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/sheet-anchor-gaps.test.ts`

### 下一步

关闭 t2，进入 FR-3（t3）卡链。

---
