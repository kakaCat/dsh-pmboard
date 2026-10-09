# t-a96f5a 收编 archive_amend 为 task_amend(op=archive)（U1）·研发

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
收编 archive_amend 为 task_amend(op=archive)（U1）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T18:42:17.820Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U1 研发完成：archive_amend 收编为 task_amend(op=archive)，壳层分派复用 amendArchiveManifest（用例判定零改动，仅 D-3 文案前缀替换），同步面（registry/index/README/boundary-guard/渲染/渲染测试）全摘，判据①②③④全绿（68 测试过）

### 完成项

- TaskAmendTool.ts 扩 op=archive：TASK_AMEND_OPS/REQUIRED_OF/docs 参数/output 并集（appended+skipped）/分派 amendArchiveManifest 补 success:true 与 op 回显/必填点名
- prompt.ts 加 op=archive 一句 + 指路（不含旧工具名字面量，对齐第五批纪律）
- summary.ts 迁入 archiveAmendSummary 为 op=archive 渲染分支
- 删除 src/tools/ArchiveAmendTool/ 目录（3 文件）
- registry.ts −1 条目（20 条）、TaskAmend responseSources +AmendArchiveManifest
- src/index.ts 与 src/tools/index.ts 摘除导入/注册/导出（20 个）
- boundary-guard.ts 加 TASK_AMEND_OP_STAGES 参数级判定（archive:undefined 全阶段放行，恢复提示等价）
- D-3：AmendArchiveManifest 8 处 reject 前缀改 reqboard_task_amend(op=archive)（码/条件不动）；routers/requirements.ts 注释改写
- README 工具表：删归档组、task_amend 行改写 4 op、计数 21→20
- 测试：archive-reconcile-e2e 改打 op=archive（含 op/success 回显断言）；task-amend-tool 加 op=archive 壳层用例；tools-dispatch 摘 THREE_PIECE_DEBT 牌；ask-confirm-prompt 清单同步

### 改动文件

- `src/tools/TaskAmendTool/TaskAmendTool.ts`
- `src/tools/TaskAmendTool/prompt.ts`
- `src/tools/TaskAmendTool/summary.ts`
- `src/tools/registry.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/application/dive/boundary-guard.ts`
- `src/application/use-cases/AmendArchiveManifest.ts`
- `src/http/routers/requirements.ts`
- `README.md`
- `tests/archive-reconcile-e2e.test.ts`
- `tests/task-amend-tool.test.ts`
- `tests/tools-dispatch.test.ts`
- `tests/ask-confirm-prompt.test.ts`
- `src/tools/ArchiveAmendTool/ArchiveAmendTool.ts（删除）`
- `src/tools/ArchiveAmendTool/index.ts（删除）`
- `src/tools/ArchiveAmendTool/summary.ts（删除）`

### 下一步

联调子卡：跑契约面测试（toolviews-contract / tools-render-coverage / readme-tool-face）确认装配面无遗漏

---
