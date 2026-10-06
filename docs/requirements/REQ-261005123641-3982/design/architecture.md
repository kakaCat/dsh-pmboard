---
serves: [FR-1, FR-2, FR-4]
---

# 架构设计（REQ-261005123641-3982）

> 需求源：`requirement.md`（FR-1~FR-5）。本份定「根从哪来、在哪校正、在哪判定」，接口形态见 `interfaces.md`。

## 现状调用链与病灶 `serves: FR-1, FR-2`

```
每个用例入口
  agentIdFromExec(exec)                                  support.ts:50
    └─ syncWorkspaceRootFromExec → applyWorkspaceRoot     support.ts:80,116
          └─ docs.setWorkspaceRoot(本窗口 cwd)   ← 改写进程共享单例（last-writer-wins）
看板路由
  applyRequirementWorkspaceRoot({docs…}, req)             requirements.ts:62,382
          └─ 同上（按被渲染的那条需求改）
写前守卫
  ensureWritableProjectRoot(deps, record)                 support.ts:307
    └─ 读 deps.docs.workspaceRoot() 当「实际会写的根」，与 record.workspaceRoot 比 → 不等即抛
```

问题不在「比不比」，在于**被比较的一方是共享可变单例的当前值**：它记录的是「最后一个调用的窗口」，
不是「本次调用属于哪条需求」。任何邻居窗口（含只读的 `reqboard_status`，经 [QueryState.ts:34](../../../../../src/application/query/QueryState.ts)）
或看板渲染都能改它，于是守卫把**别人的根**当成本次的根。

## 改后的根权威链 `serves: FR-1, FR-2`

```
REQ id ──取记录──▶ record.workspaceRoot  ← 唯一权威（本次判定的输入）
                        │
                        ├─(写前) applyRequirementWorkspaceRoot(deps, record)   ← 与读侧同一实现
                        │        └─ docs / queueRepo 的根 := 记录声明的根（构造性一致）
                        └─(复核) 单例当前值仍 ≠ 声明根 → 抛 PROJECT_ROOT_MISMATCH（最后防线）
```

三条不变量（拆分与实施都不得偏离）：

1. **判定输入只有记录**：`record.workspaceRoot`（由 REQ id 取到）；共享单例的当前值**不参与判定**，
   只被校正、被复核。
2. **校正只有一处实现**：`applyRequirementWorkspaceRoot`（`support.ts:155`，读侧已在用）。
   写侧不得另写一份「按路径 set」的逻辑。
3. **写侧不降级**：记录声明的根不可用（非绝对 / 目录不存在 / 不可读）→ **响亮拒绝**，
   不得回落到调用窗口 cwd 去写（那正是「写到别的项目」）。读侧的「降级 + 标注」语义仅限读。

## 守卫时机：前置，而不是事后 `serves: FR-3`

`CaptureRequirement.ts` 现状是 ④`create`(:277) ⑤`draft→brainstorming`(:291) 之后才守卫(:300)，
拒绝时副作用已落库 → 「回执说失败、台账却有记录」。

改为：在 ④ 之前用**即将写入的 `workspaceRoot`**（弹框第 5 问的解析结果）调一次守卫
（形参是 `{ workspaceRoot }`，不需要 REQ id，故前置可行）；不通过 → 台账**零写入**，回执天然一致。
`:300` 的既有调用保留（此时按构造必过，作为回归护栏）。

## 不做（架构级改造留待他人/他日） `serves: FR-4`

- **不把 `docs` / `queueRepo` 改成每窗口一实例**：那是端口形状与全部写盘点的大改造，
  本次只修「判定输入 + 校正时机」，改动面收敛在 `support.ts` 与各调用点。
- **不改写盘点门禁的覆盖范围**：`tests/project-scope.test.ts:313` 的
  「工作区相对写盘点必须受保护或显式豁免」保持原样，守卫函数名不变、签名加可选参，
  `PROTECTED_WRITERS` / `EXEMPT` 两份清单零改动。
