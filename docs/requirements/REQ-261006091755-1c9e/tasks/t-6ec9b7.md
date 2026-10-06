# t-6ec9b7 让豁免在拆分锚点维也算数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让豁免在拆分锚点维也算数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/plan-prototype-anchor-gate.test.ts 退出码 0（既有 4 组断言零改动）；② pnpm typecheck 退出码 0；③ 源码断言：锚点维函数体内 prototypeExemptOf( 与 registeredPrototypesOf( 各命中，且函数体内 grep -n prototype_exempt 零命中（无手写判据）。

## 实施方案（implementation）
改 src/application/internal/content-gate-wiring.ts：在 assertUiCardPrototypeAnchors 的 if (!applies) return undefined 之后插入前置 if (prototypeExemptOf(req, doc.frontmatter).active && registeredPrototypesOf(req).length === 0) return undefined（带注释：豁免生效 ∧ 无已登记原型产物 → 无「可锚」对象，整维跳过；判据全部复用既有单点）。import 侧：在既有 './prototype-gates.js' 的 import 里补 prototypeExemptOf；新增 import { registeredPrototypesOf } from './prototype-registration.js'。不动 plan-prototype-refs / 逐卡判据 / 错误码 / 文案。验证：npx vitest run tests/plan-prototype-anchor-gate.test.ts；pnpm typecheck。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T01:39:37.139Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

t1 完成：豁免前置落地且三处验收全过，子卡链三段全绿

### 完成项

- 改动落地：content-gate-wiring.ts 三处 delta（两个 import + 一条前置）
- 行为：豁免生效 ∧ 无已登记原型产物 → 锚点维整维跳过；未豁免/已交原型的路径一字不动
- 判据单点：prototypeExemptOf + registeredPrototypesOf 各一处调用，无手写判据
- 三条验收全过：目标用例 19 项、typecheck 0、源码断言 2 命中 0 手写
- 相关回归 73 项全绿（锚点维 + 四条转移路径 + 原型三门）
- 构建：pnpm build（host+client）退出码 0，[verify-client] OK
- 全量噪声判定：四次采样 + 决定性回退实验证明与本改动无关（剔除两个不稳定文件后失败集合逐文件相同）
- 子卡链三段（研发 → 复核 → 测试）全部走完，各有独立汇报

### 改动文件

- `src/application/internal/content-gate-wiring.ts`

### 下一步

t2：补豁免四组合断言（TC-1～TC-9）与两条逆验证

---
