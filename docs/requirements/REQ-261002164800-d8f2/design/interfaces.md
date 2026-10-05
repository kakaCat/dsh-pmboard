---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 接口：签名、入参 schema、错误码 serves: FR-1, FR-2, FR-3, FR-4, FR-6, FR-7

> 契约写在签名里，调用方与测试都按这一份对齐。字段名沿用既有拼法（`requirement_refs` 入参 / `requirementRefs` 记录字段）。

## 取数单点 API serves: FR-1, FR-2, FR-3

```ts
// domain/task/RequirementRefs.ts（零 IO，可纯函数单测）
export const REF_ID_RE = /^(?:FR|BUG|RF|SP|DOC|CH)-\d+$/;
export function refInvalidReason(raw: unknown): string | undefined;   // undefined = 合法
export function normalizeRequirementRefs(raw: unknown): string[];     // 去重 + 自然序；非法抛错

// application/internal/plan-refs.ts（唯一组装点）
export interface RefsForLandingInput {
  req: RequirementRecord;
  plan?: PlanRecord;                    // 台账里已批准的计划
  explicitTasks?: readonly unknown[];   // reqboard_decompose(tasks=…) 传的创作表
  docs: DocsReader;
}
export type RefSource = 'explicit' | 'doc' | 'none';
export interface RefsForLandingResult {
  refsByKey: Map<string, string[]>;     // 计划 key → FR[]
  sources: Map<string, RefSource>;      // 逐 key 来源（可观测、进返回体）
}
export function refsForLanding(input: RefsForLandingInput): Promise<RefsForLandingResult>;
export function unrefedKeys(keys: readonly string[], refs: ReadonlyMap<string, string[]>): string[];
```

- 合并语义：同一 key 出现在 `explicitTasks` 与 `plan.tasks` 时取**并集**（沿用现状，不互相覆盖）。
- 顺序：`explicitTasks`（显式） → `plan.tasks[].requirement_refs` → 文档覆盖表（`planRefsFromDoc`）。
- 文档表只在"该 key 显式 refs 为空"时补齐；两处都无 ⇒ `sources[key]='none'`、`refsByKey[key]=[]`。

## 落库编排 API serves: FR-1, FR-6, FR-7

```ts
// application/internal/plan-landing.ts（既有模块，扩展返回值 + 修正 RTM 入参）
export interface LandPlanTasksResult {
  created: LandedTaskRef[];
  requirement: RequirementRecord | undefined;
  createdIds: string[];
  unrefed: string[];                    // 🆕 无 FR 落点的计划 key
  sources: Map<string, RefSource>;      // 🆕 逐 key 取数来源
  rtm?: RTMIntegrationResult;           // 入参修正：真实 TaskRecord[]（见 data-model.md §读数）
}
```

```ts
// application/internal/approved-plan-landing.ts（🆕：两条人工入口共用这一层）
export type LandingSource = 'confirm' | 'board' | 'decompose';
export interface LandApprovedPlanInput {
  requirementId: string;
  windowKey: string;
  nowTs: number;
  source: LandingSource;
  tools?: { todo_write?: (a: unknown) => Promise<unknown> } | undefined;
}
export interface LandApprovedPlanResult {
  created: LandedTaskRef[];
  createdCount: number;
  unrefed: string[];
  alreadyLanded: number;                // >0 = 幂等跳过（不造幽灵卡）
  warning?: string;                     // 无落点卡的可见文案
  rtm?: RTMIntegrationResult;
}
export function landApprovedPlan(deps: UseCaseDeps, input: LandApprovedPlanInput): Promise<LandApprovedPlanResult>;
```

**对外语义**：`landApprovedPlan` 是"计划已获批 → 落库"的唯一实现；三条入口只决定**是否顺带推进状态**，不各自拼 refs、不各自判门禁。

## 工具面变更 serves: FR-2, FR-4

### reqboard_submit（kind=plan）入参补字段 serves: FR-2

```jsonc
"tasks": { "type": "array", "items": { "type": "object", "additionalProperties": false, "properties": {
  "key": { "type": "string" }, "title": { "type": "string" },
  "requirement_refs": { "type": "array", "items": { "type": "string" } }   // 🆕
  /* 其余既有字段不变 */
}}}
```

### reqboard_task_refs（🆕 工具）serves: FR-4

```jsonc
// parameters
{ "task_id": { "type": "string", "required": true },
  "requirement_refs": { "type": "array", "items": { "type": "string" }, "required": true }, // 全量替换，可为 []
  "reason": { "type": "string", "required": true } }
// output
{ "success": true, "task_id": "t-xxxxxx", "before": ["FR-1"], "after": ["FR-1","FR-2"],
  "changed": true, "rtm_synced": true, "note": "…" }
```

- 语义：**全量替换**（不是追加）；值相同 ⇒ `changed:false` 且不写盘（队列文件 mtime 不变）。
- 拒绝：卡不存在 / 卡不属于本窗口绑定需求 / `requirement_refs` 非法 / `reason` 为空 / 卡已取消。

## 看板路由变更 serves: FR-1, FR-4

| 路由 | 现状 | 设计 |
|---|---|---|
| `POST /dashboard/api/reqboard/req/plan/approve` | 只盖 `approvedAt` → 返回需求 | 盖 `approvedAt` → `landApprovedPlan(source='board')` → 推进 implementing；返回体附 `landed` / `unrefed` / `warning` |
| `POST /dashboard/api/reqboard/task/update` | 不收 `requirementRefs` | 新增可选 `requirementRefs` + 必填 `reason`（提供该字段时），复用 `amendTaskRefs` 用例；其余字段行为不变 |

## 错误码 serves: FR-2, FR-6

| 码 | 触发 | 文案要求 |
|---|---|---|
| `REQBOARD_BAD_REQUIREMENT_REF` | `requirement_refs` 非法（非数组 / 空串项 / 不匹配 `REF_ID_RE`） | 点名卡与非法值，给出合法形态示例 `["FR-1","FR-2"]` |
| `REQBOARD_TASK_NOT_BOUND` | 补写的卡不属于本窗口绑定需求 | 给出卡 id 与所属需求 id |
| `REQBOARD_MISSING_PLAN` / `REQBOARD_PLAN_NOT_APPROVED` | 三条入口的前置（沿用既有） | 不变 |
| ~~`REQBOARD_PLAN_REFS_MISSING`~~ | **不再作为拒绝码** | 改为 `unrefed`/`warning`（可见但放行） |

**文案规则（FR-6）**：`how` 里只允许出现**当前版本可调通**的入口（`reqboard_decompose`、`reqboard_task_refs`、看板按钮）；不再出现"在 plan 的 tasks 里给 requirement_refs"这类做不到的指引。
