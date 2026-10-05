# t-167efd 立项与计划落库只写自己项目，写错地方要当场报错

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
立项与计划落库只写自己项目，写错地方要当场报错

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `npx vitest run tests/project-scope.test.ts -t "错配"` → 断言抛 REQBOARD_PROJECT_ROOT_MISMATCH 且文案含两个绝对路径；2) `grep -rn "usedProjectRoot" src/` → 有命中；3) `npx vitest run tests/project-scope.test.ts -t "零写入"` → 另一项目目录零新增。

## 实施方案（implementation）
src/application/internal/plan-landing.ts 的 landPlanTasks：落盘前 projectRootOf(req, deps.docs.workspaceRoot())；若 root !== req.workspaceRoot → 抛 REQBOARD_PROJECT_ROOT_MISMATCH（两个绝对路径 + 修复建议）；评论追加 [项目根] 本次写入根=<abs>。src/application/use-cases/CaptureRequirement.ts 与 CreateRequirement.ts：建档写盘同上，返回体新增 usedProjectRoot。不改变既有成功路径的产物形状。测试：两项目夹具 + 人为错配两用例。

## 上游产出摘要（dependsSummary）
- 把「这条记录属于哪个项目」定成一个唯一口径

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T11:42:34.112Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

写错地方这件事被拦住了，而且拦它的同时挖出了病根。这一步做完，什么变了——立项建档和计划落库在动笔前先核对「要写的这个项目是不是这条需求自己的」，不是就当场拒绝、并同时报出两个绝对路径；写成功时把「本次写入根」留在评论里。真正让产物跑错门的那个原因（需求的项目根在立项时就被记成了插件启动目录）也一并修掉了——只拦不修的话，门口会一直有人被拦。

### 完成项

- 交付：写盘前守卫 ensureWritableProjectRoot（support.ts）+ isAbsoluteRoot，接进三条写路径（计划落库 / capture 建档 / create 建档），错配即抛 REQBOARD_PROJECT_ROOT_MISMATCH 并给两个绝对路径
- 可观测：capture 回执 used_project_root（已在工具输出契约登记）+ 拆分评论追加 [项目根] 本次写入根=<abs>
- 伴随修复（卡外但必要）：CaptureRequirement / CreateRequirement 的会话工作区回落口径——此前回落 process.cwd()，使需求一出生就把项目根记成插件启动目录
- 验收命令逐条：错配 5 passed；usedProjectRoot 命中 6 处；零写入 1 passed；全文件 21 passed
- 回归：全量 97 failed / 2942 passed（与开工基线持平、零新增）；npx tsc --noEmit 187 条 ≤ 192，改动文件零错误
- 事故与止损留痕：第一版「先校正再核验」把文件重定向写进真实仓库（51 个污染目录），已全部清理并改为只核验不重定向；仓库现为 22 个目录、无残留
- 四张子卡（研发/联调/复核/测试）各自完成并留下完工记录

### 改动文件

- `src/application/internal/support.ts`
- `src/application/internal/plan-landing.ts`
- `src/application/use-cases/CaptureRequirement.ts`
- `src/application/use-cases/CreateRequirement.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `tests/project-scope.test.ts`
- `tests/sync-artifacts.test.ts`

### 下一步

t4：知识层检索区分「本项目没生成」与「找错项目」两种病因；t6 兼容口径与回滚说明；t5 夹具补错配/未归属/E2E。

---
