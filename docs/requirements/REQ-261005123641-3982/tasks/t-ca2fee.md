# t-ca2fee 守卫改为按需求记录声明根判定，并在写前校正共享仓储根

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
守卫改为按需求记录声明根判定，并在写前校正共享仓储根

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) npx vitest run tests/project-scope.test.ts -t "守卫" → 414/430/443/448 四条未修改即全绿；2) npx tsc --noEmit → 错误数 ≤ 基线；3) grep -n "export function ensureWritableProjectRoot" -A 6 src/application/internal/support.ts → 可见第 3 参 caller?；4) 12 处守卫调用点数量与基线一致（本卡不动调用点）。

## 实施方案（implementation）
改 src/application/internal/support.ts：① ensureWritableProjectRoot(deps, record, caller?) 增加可选第 3 参 { callerRoot?: string }；② 判定顺序按 design/interfaces.md 六行表：无 workspaceRoot 探针 → 返回 undefined（不判）；declared 非空时 !isAbsoluteRoot 或 docs.exists(declared)===false → 抛 REQBOARD_INVALID_WORKSPACE；否则 applyWorkspaceRoot(deps, declared) 写前校正 → 复核探针值：相同 → 返回声明根，仍不同 → 抛 REQBOARD_PROJECT_ROOT_MISMATCH（语义收窄为校正失效的最后防线）；③ declared 为空：有 callerRoot → 校正到它并返回，否则 undefined；④ assertWritableRequirementProject(deps, reqId, caller?) 保持按 id 取记录 → 调同一实现。函数名不变（t8 门禁 GUARD_CALL 依赖）；存在性判定用既有 DocRepository.exists（绝对路径直通），不新增端口方法。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:55:03.685Z，窗口 session-fe2396d0-cd4e-4724-89fd-16e436222a2f）

这一步做完，变化是：写入的根由「这条需求记录自己声明的根」决定，别的窗口或看板改过全局根不再影响本窗口——原先那种「记录已建却报立项失败」的误判从判定层面消失。

### 完成项

- 写盘守卫不再读共享单例的当前根，改为按需求 id 取记录、以记录声明根判定
- 写前把共享仓储的根校正到声明根（复用读侧唯一实现），多窗口串味不再让本窗口被误拒
- 新增声明根可用性硬校验：非绝对/不存在 → REQBOARD_INVALID_WORKSPACE，写侧不降级到会话 cwd
- PROJECT_ROOT_MISMATCH 收窄为校正失效的最后防线（给两个绝对路径）
- 接口加性：第 3 参 callerRoot 可缺省，12 处外部调用点与 1 处内部复用逐字未动
- 自测证据：守卫用例 414/430/443/448 未修改即绿；tsc 1 = 基线 1；t8 白名单用例通过；diff +84/-28
- 如实登记的遗留：452 旧契约用例待 t3 重写；t8 写盘覆盖对 EnsureKnowledgeLayer.ts:169 报红（HEAD 既存）

### 改动文件

- `src/application/internal/support.ts`

### 下一步

t2 立项两条路径守卫前置（capture / create）→ t3 并发回归与用例重写 → t4 口径落文档

---
