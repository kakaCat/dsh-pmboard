# t-481dac 脚本与配置链迁移

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
脚本与配置链迁移

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
pnpm kb:check && pnpm prompts:check && pnpm templates:check 全绿；脚本内旧路径（src/application|src/tools|src/client）grep 计数 == 0

## 实施方案（implementation）
更新根 package.json 的 scripts 入口与新脚本落点；改 kb/prompts/templates 三条链内的 src|tests|vendor|templates|skills 路径常量；tsconfig paths 与 vitest alias 收口；全量 grep 清单逐条核销。

## 上游产出摘要（dependsSummary）
- 资产四包化与发布完整性
- 测试随包迁移

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-10T09:47:28.035Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t21 脚本与配置链迁移收官：卡面判据二（旧路径 grep == 0）达成，templates/prompts 两链由红转绿，kb 链修掉 K8/K9/K10/K14 并归类 5 个脚本；全量读数不受影响（7268/19 = 基线）。唯一未达成的是 kb:check 的 K1/K3 两条体量上限，证据表明开工前已超限（HEAD 即 19330 字节 / 222 行），属知识层体量治理，留案待人工裁决。

### 完成项

- 判据二（卡面明确判据）达成：scripts 内 src/application · src/tools · src/client grep 计数全 0 ✓
- templates 链：template-gate-probe.mts 与 doc-section-parity.mts 的模板根改布局无关双根（包内优先）⇒ pnpm templates:check exit 2 → 0 ✓
- prompts 链：prompt-path-probe.mts 的 AGENT_SURFACE_DIRS 去掉已随 t15 成包、目录不存在的 src/tools ⇒ pnpm prompts:check exit 0 ✓
- kb 链四项修复：K8（conventions.md 7 处校验目标指向 t20 已搬走的测试 ⇒ 按存在性解析重指）· K9（检查器只扫根 src/ 得 192 与生成器口径 1173 不一致 ⇒ 与生成器 SOURCE_ROOTS 同口径）· K10（C-33 骨架填实）· K14（不可判定条目基线刷新）
- scripts/ 分类：5 个未归类文件按性质登记 EXCLUDED 并写理由（package-boundary-check.mts 归 pnpm boundary:check · refactor-baseline.mts 归 t22 diff 卡 · 三个一次性诊断/取证脚本）
- 配置面收口：tsconfig paths 与 vitest alias 的三前缀（tests/ src/ scripts/）在 t20 已就位，本轮复核仍为 3+3 条 ✓
- 读数：全量 7268 用例 / 失败 19（= 基线，未受影响）· tsc 0 · 分层门禁 0 · prompts:check 0 · templates:check 0 · 旧路径 grep 0
- ⚠️ 留案（非本卡引入，证据充分）：pnpm kb:check 仅剩 K1（INDEX 11433 码点 > 8000）与 K3（conventions 230 行 > 200）两条体量上限；HEAD 版本即 INDEX 19330 字节、conventions 222 行，二者在本次开工前已超限；本卡增量仅 +1 行 / +16−9 行（后者是 K10 要求的 C-33 填实）。处置需人工裁决：单独立卡瘦身知识层，或确认后调整上限常量（我不擅自放宽门禁）

### 改动文件

- `.worktrees/req-261009174713-7bc8/scripts/template-gate-probe.mts`
- `.worktrees/req-261009174713-7bc8/scripts/doc-section-parity.mts`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`
- `.worktrees/req-261009174713-7bc8/scripts/kb-probe.mts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/knowledge/operations.ts`
- `.worktrees/req-261009174713-7bc8/docs/knowledge/conventions.md`

### 下一步

K1/K3 待人工裁决；随后 t22（五类基线 diff）· t23（文档收口，已解锁）。

---
