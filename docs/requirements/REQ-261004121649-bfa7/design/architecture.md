# 架构（REQ-261004121649-bfa7）

> serves: FR-1, FR-2

## 现状与病灶（serves: FR-1）

回退由 `src/application/use-cases/MoveRequirement.ts` 触发，把编排委托给
`src/application/internal/rollback.ts` 的 `applyRequirementRollback(...)`，它返回一份
`taskPlan`（`reworkDrafts` + `canceled`），随后由 MoveRequirement 落库：

```
MoveRequirement（回退分支）
   │
   ├─ applyRequirementRollback(req0, reqTasks, from, to, …)   ← 在**副本**上算编排
   │        └─ taskPlan = { reworkDrafts: [...], canceled: [...] }
   │
   ├─ ① 任务先写：createMany(reworkDrafts) + mutate(canceled)   ← 队列（工作区相对）
   └─ ② 需求后写：状态/撤章/作废批准
```

**病灶**：`reworkDrafts` 是**按「每张被取消的卡」**生成的——包括子卡；而子卡被物化成顶层卡后
（`parentId` / `stageKind` 丢失），一开工就按默认模板再展开一遍子链 → 名字递归 `…·研发·研发`。
实测：17 张卡 → 取消 17 + 物化 56（其中 50 张源自子卡）→ 队列 73 张。

## 设计（serves: FR-1, FR-2）

**收敛点只有一处**：`rollback.ts` 里生成 `reworkDrafts` 的那段（物化规则），不新增第二套判定。

```
物化规则（唯一口径）
   被取消的卡
      │
      ├─ 是顶层父卡（无 parentId） ──▶ 物化一张重做卡（继承标题/phase/side/acceptance）
      │                                 · stages 显式置 []（= 不自动展开子卡链）  ← FR-2
      │                                 · 记 reworkOf = 原卡 id
      │
      └─ 是子卡（有 parentId）     ──▶ 不物化；原地复位为 todo（保留 parentId/stageKind）
```

为什么子卡不复位为「done」而是「todo」：回退意味着上游产物变了，子卡的产出需要重新确认；
但**复位不是升格**——它仍在原来的父卡下，不引入新卡。

## 回滚与兼容（serves: FR-1）

- 不改台账 schema、不改队列文件格式；
- 物化规则变化只影响**回退时新建的卡**，存量卡不动；
- 回滚本需求 = 还原 `rollback.ts` 的物化段 + 删新用例（无数据风险）。
