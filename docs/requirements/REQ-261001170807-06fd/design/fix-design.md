---
req: REQ-261001170807-06fd
doc: fix-design
serves: FR-1, FR-2
---

# 修复设计 · 节流不惩罚父子链收尾 + 子卡模板自带可跑命令（REQ-261001170807-06fd）

> **TL;DR**：两处都是"判据/模板与真实流程错位"。修法都尽量小：
> ① 节流判据加一条归属排除（**只豁免本卡自己的子卡**，兄弟卡与跨卡照旧拦）；
> ② 子卡模板的 acceptance 从断言词换成可执行命令（模板与门禁同口径）。

```
   FR-1 节流判据                      FR-2 子卡模板
   +-------------------------+        +------------------------------+
   | 命中其他任务时多判一条： |        | acceptance 由阶段决定：        |
   | 它是「本卡的子卡」吗？   |        |  dev/integrate → npx vitest…  |
   |  是 → 不计入节流         |        |  review        → 对照设计 + 同命令 |
   |  否 → 照旧计入（兄弟卡） |        |  test          → pnpm test / tsc |
   +-------------------------+        +------------------------------+
```

## 复现（最小重现） `serves: FR-1`

| 步 | 动作 | 期望 | 实测 |
|---|---|---|---|
| 1 | 落库一条需求（1 父 + 4 子） | —— | —— |
| 2 | 依次关 4 张子卡 | 成功 | 成功（子卡豁免节流） |
| 3 | 立刻关父卡 | 成功 | ❌ `REQBOARD_BULK_CLOSE`：60 秒内刚关闭子卡 |

固化方式：`tests/e2e-close-chain.test.ts` 用假时钟把三步写成用例（步 3 修前必红）。

## 根因定位 `serves: FR-1, FR-2`

| 缺陷 | 根因 | 定位步骤 |
|---|---|---|
| FR-1 | 节流判据缺少"归属"维度：只知道"别的任务刚关过"，不知道"那是不是本卡自己的子卡" | 读 [support.ts:287-304](src/application/internal/support.ts#L287-L304) 取 `recentDoneTask` → 读 [DoneEvidenceSpec.ts:42-46](src/domain/workflow/DoneEvidenceSpec.ts#L42-L46) 的 find 条件（只有 `t.id !== taskId`） |
| FR-2 | 模板与门禁各说各话：门禁要"可执行操作"，模板产出"断言词" | 跑 `reqboard_submit(kind=verification)` 看拒收文案 → 反查子卡 acceptance 的来源（模板生成） |

## 修复方案 `serves: FR-1, FR-2`

**FR-1（改 2 个文件）**

| 文件 | 改动 |
|---|---|
| `src/domain/workflow/DoneEvidenceSpec.ts` | `TaskWithHistory` 增 `parentId?: string`；`findRecentAgentDoneTask` 命中候选若 `candidate.parentId === taskId` → **跳过**（不计入节流）；`doneThrottleRemainingMs` 同口径 |
| `src/application/internal/support.ts` | 传入的 `tasks` 投影已含 `parentId`（TaskRecord 自带），无需额外查询 |

**不变式（必须有用例锁）**：兄弟卡（不同 parentId）、跨卡关闭**照旧计入**——节流防滥用的能力不退让。

**FR-2（改 1 个文件）**

| 文件 | 改动 |
|---|---|
| `src/domain/task/SubtaskTemplate.ts` | 各阶段 acceptance 生成改为操作句：dev/integrate = `npx vitest run <测试文件> → 全绿`；review = `对照 docs/requirements/<REQ>/design/ 逐条核对；<同一命令> → 全绿`；test = `pnpm test → 失败数 ≤ 基线；npx tsc --noEmit → 错误数 ≤ 基线` |
| 兜底 | 拿不到具体测试文件时给可跑占位（`npx vitest run <本卡改动涉及的测试文件>`），**禁止**退回断言词 |

**存量不追溯**：已落库子卡不动（读取路径不变）。

## 接口与数据契约 `serves: FR-1`

| 项 | 契约 |
|---|---|
| `TaskWithHistory` | 新增可选 `parentId?: string`（缺省 = 非子卡，行为不变） |
| `findRecentAgentDoneTask` 返回 | 形状不变（`{id,title} | undefined`）；仅判据多一条排除 |
| `SubtaskTemplate` acceptance | 字符串内容变化，长度仍受既有上限约束；不新增字段 |

## 回归测试落点 `serves: FR-1, FR-2`

| 文件 | 断言 |
|---|---|
| `tests/domain/done-evidence.test.ts` | 本卡子卡不计入节流；兄弟卡计入（改 2 条既有用例） |
| `tests/e2e-close-chain.test.ts`（新建） | A1 父子链收尾一次成功；A2 兄弟卡仍拦；A3 跨卡仍拦 |
| `tests/subtask-template-acceptance.test.ts`（新建） | A4 各阶段 acceptance 含 `npx`/`pnpm` 与期望锚点 |

## 边界与不做什么 `serves: FR-1, FR-2`

- 不取消 60s 节流；不改人工门与验收单结构；**不追溯存量卡**。
- 除"父子链豁免"外，节流行为逐字不变（A2/A3 用例即红线）。
