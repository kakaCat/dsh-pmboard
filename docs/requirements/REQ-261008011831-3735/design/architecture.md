---
requirement_id: REQ-261008011831-3735
title: "架构面：两处终态文案判定归位到活卡单点"
status: design
category: chore
requirement_refs: [CH-1, CH-2]
---

# 架构设计（REQ-261008011831-3735）

> 说明（按 `templates/design/architecture.md` 的豁免口径）：本需求是**单文件量级小改**（两行判定 + 两条 import + 清单两条失效条目），无新组件、无新依赖、无新接口。模板那条豁免说「把 TL;DR + 改动点并进 requirement.md 即可」——但验收文档门（`DocCompleteness` 第 9 类）按**文件存在**判定，故本文档**存在但薄**：只讲清这次改动在架构上的位置与它维护的那条纪律，不灌水。

## 目标与总体方案 <!-- serves: CH-1, CH-2 -->

**问题**：终态只读文案（「已取消 / 已归档，无可执行动作」）与取消态分支（「已取消：无验收结论」）在视图层**手写** `h.status === 'canceled'` 判定，绕过 `domain/status/Predicates.ts` 的「取消态/活卡」单点（纪律见 `docs/architecture/live-card-single-source.md`）。

**当前状况**：两处手写比较与监测用例 `tests/live-tasks-single-source.test.ts` 的清单条目**双向钉死**（⑤新增即红 / ⑥删条目即红）；源码形态一变（本仓 1c22464 的重做）而清单未跟，就出现「同一逻辑点既算新增、又算失效」的双红。

**设计方案**：两处判定改为调用单点 `isCanceled(...)`；判定行**离开命中集合**，因此清单中对应的两条 `status-label` 条目**随之删除**（不是改登记、而是出清）。

**不这么做的后果**：若只在清单里补登记新行原文，等于承认「消费点可以继续手写」——文本一漂就要再补一次，本条纪律会缓慢失效；这正是本需求要堵的循环。

## 模块改动地图 <!-- serves: CH-1, CH-2 -->

```
  client/views/report-head.ts  ──┐
   :485 已取消/已归档 文案判定     │  isCanceled(h)
                                 ├──────────▶  domain/status/Predicates.ts
  client/views/report-band.ts  ──┘             isCanceled(req)   ← 取消态唯一判据
   :290 取消态分支（无验收结论）     isCanceled(report.head)

  tests/fixtures/canceled-literal-baseline.json
   baseline: [ 删 ] report-band.ts  的三元旧行
             [ 删 ] report-head.ts  的 </div></div> 旧行
             [ 留 ] collected 18 条 + 其余 37 条 baseline
```

**改动清单**：

| # | 文件 | 改动 | 层 |
|---|---|---|---|
| 1 | `src/client/views/report-head.ts` | +import；:485 判定改 `isCanceled(h)` | client/views（消费点） |
| 2 | `src/client/views/report-band.ts` | +import；:290 判定改 `isCanceled(report.head)`；`status` 常量保留 | client/views（消费点） |
| 3 | `tests/fixtures/canceled-literal-baseline.json` | 删 2 条已失效条目 | tests（清单） |

**边界**：不动 `domain/status/Predicates.ts`（单点本体）、不动清单其余条目、不动另两处 `http/` 与 `application/` 的历史偏离（前者归 REQ-261008020617-088f，后者已在其设计内）。
