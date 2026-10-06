<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

# 接口设计（REQ-261006175040-12d4 卡面门读数修复）

> 对外接口只改**一处**：`GET /state` 的摘要元素多三个可选键。落章/推进/详情等接口**签名与语义全不变**。

## 1. `GET /state` 契约（唯一对外变更） `serves: FR-2, FR-6`

请求不变：`GET /dashboard/api/reqboard/state?session=<sid>`（`scope`/`limit`/`cursor` 照旧；看板不带 `scope` ⇒ `active`）。

响应 `data.requirements[]` 的**每个元素**新增三个可选键（`RequirementSummary`，见 `design/data-model.md` §2）：

```json
{
  "id": "REQ-261006130057-7a43",
  "title": "…", "status": "implementing", "category": "feature",
  "commentCount": 53, "artifactCount": 83,
  "gates": [
    { "kind": "requirement",   "status": "confirmed", "count": 1 },
    { "kind": "design",        "status": "confirmed", "count": 6 },
    { "kind": "decomposition", "status": "confirmed", "count": 1 },
    { "kind": "verification",  "status": "missing",   "count": 0 }
  ],
  "planState": "approved",
  "archivePrepared": false
}
```

契约条款（**逐条可断言**）：

| # | 条款 | 判据 |
|---|---|---|
| I-1 | `gates` 存在时，长度 = 该分类生效门数（feature 4 / bug 3 / spike 1…），顺序 = 生效门顺序 | 断言长度与 `kind` 序列 |
| I-2 | `gates` 缺省 = 读数不可得；`[]` **不出现**（分类无门时也不发空数组） | 断言键存在性 |
| I-3 | `status` 值域 `confirmed`/`pending`/`missing`；`count ≥ 0` | 值域断言 |
| I-4 | `planState` 值域 `pending`/`approved`/`rejected`；无计划对象 ⇒ 键不出现 | 值域断言 |
| I-5 | `archivePrepared` 为布尔；不可得 ⇒ 键不出现 | 类型断言 |
| I-6 | 摘要**不得**出现 `artifacts`/`plan`/`verification`/`archive`/`comments`/`statusHistory` | 既有 `BIG_FIELD_KEYS` 断言 |
| I-7 | 键集恰好等于 `SUMMARY_KEYS`（三个新键已在表内） | `domain-summary.test.ts` |
| I-8 | 载荷增量 ≤ 5%（同批需求、改动前后对比） | 实测命令见 `design/test-cases.md` |

**错误语义**：不新增错误码。读数不可得不是错误——它由「键不出现」表达（I-2/I-4/I-5），
服务端只打 `onWarn`（带需求 id 与原因）。`/state` 的既有降级（迁移门 503、坏分片剔除单条）一律不动。

## 2. 新增模块签名 `serves: FR-1, FR-2, FR-3, FR-5`

```ts
// src/domain/artifact/GateReadings.ts —— 纯函数、零 IO、不 import shared（入参结构化）
export type GateStatus = 'confirmed' | 'pending' | 'missing'
export interface GateReading { readonly kind: string; readonly status: GateStatus; readonly count: number }
export interface GateArtifactFact { readonly kind: string; readonly confirmedAt?: number }

export function gateReadingsOf(confirmKinds: readonly string[], artifacts: readonly GateArtifactFact[]): GateReading[]
export function planStateOf(plan: { readonly approvedAt?: number; readonly rejectedAt?: number } | undefined):
  'pending' | 'approved' | 'rejected' | undefined
export function archivePreparedOf(input: { readonly archive?: unknown; readonly hasArchiveArtifact: boolean }): boolean
```

```ts
// src/shared/board-summary.ts —— 唯一装配点（读门清单 + 调 domain 纯函数 + 投影摘要）
export function boardSummaryOf(record: SummarizableRequirement): RequirementSummary
// 入参缺省语义：record.artifacts === undefined ⇒ 不下发 gates / archivePrepared（读数不可得）
// record.plan === undefined ⇒ 不下发 planState（无计划 ⇒ 无 chip，与该 chip 无「缺失」态一致）
```

```ts
// src/repositories/RequirementShardRepository.ts —— 新增存在性探针（区分「文件不存在」与「读失败」）
objectExists(root: string, requirementId: string, kind: ObjectKind, opts?: { cold?: boolean }): Promise<boolean>
```

## 3. 客户端渲染入口（签名不变，语义收紧） `serves: FR-1, FR-3, FR-4, FR-5, FR-6`

| 函数（`src/client/views/…`） | 签名 | 改动后的语义 |
|---|---|---|
| `renderArtifactChips(req)` | 不变 | `req.gates === undefined` ⇒ 返回 `''`（整块不渲染）；否则按读数逐门渲染 ✓/⏳/✗，顺序照读数 |
| `renderArtifactDerived(req)` | 不变 | `门 <confirmed 数>/<gates.length>`；`gates` 缺省或长度为 0 ⇒ `''`；**不再**有「产物 N/M」与「N 门待确认」 |
| `renderConfirmButton(req)` | 不变 | 当前门（`currentGateKind(req)`，只用 `category`+`status`，纯函数保留）对应读数 `status === 'pending'` ⇒ 渲染按钮；`design` 文案带 `count`；否则 `''` |
| `planChip(req)` | 不变 | `req.planState` 为 `approved`/`rejected`/`pending` ⇒ 计划已批/计划被退/计划待批；缺省 ⇒ `''` |
| `verifyChip(req)` | 不变 | `status === 'accepting'` 且 verification 门读数 `missing` ⇒ 待验收材料；`pending`/`confirmed` ⇒ 待人工审核；读数缺省 ⇒ `''` |
| `archiveChip(req)` | 不变 | `status === 'done'` 且 `archivePrepared === true` ⇒ 待归档；`false` ⇒ 待归档材料；缺省 ⇒ `''` |
| `renderListCard(card, …)` | 不变 | 「归档材料待补」判据由 `closingGapOf(req)` 改为 `req.archivePrepared === false` |
| `computeGateStatuses(req)` | — | **删除**（客户端不再有门判定） |

## 4. 不变的对外接口（明确列出，防误改） `serves: FR-4`

| 接口 | 为什么不动 |
|---|---|
| `POST /req/artifact/confirm`（`{ id, kind }`） | 落章 + 按门推进的写路径语义不变；本次只修「按钮在不在」，不动「点了会怎样」 |
| `GET /requirements/:id`（详情全文） | 详情页本来就拿全量记录，门状态渲染正确 |
| `GET /requirements/:id/stages` 等面板端点 | 同上 |
| `reqboard_*` 工具族 | agent 侧读数（`reqboard_status`）走的是另一条投影（同步缝），本次不动 |
| 归档/验收/计划的写路径与权限 | 人工门一道都不动 |

## 5. 兼容矩阵 `serves: FR-6`

| 服务端 | 客户端 | 表现 | 是否可接受 |
|---|---|---|---|
| 旧（无读数键） | 新 | 门相关块整块不渲染（其余卡面照旧） | ✅ FR-6 要求的降级 |
| 新 | 旧 | 客户端忽略未知键，照旧渲染（回到四门恒红的旧表现） | ✅ 前向兼容，不报错 |
| 新 | 新 | 全部按真实读数渲染 | ✅ 目标态 |

## 6. 可复制的核验样例 `serves: FR-7`

```bash
# ① 读数真的下发了（且不含大字段）
curl -s 'http://127.0.0.1:19387/dashboard/api/reqboard/state' \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; r=[x for x in d['requirements'] if x['id']=='REQ-261006130057-7a43'][0]; print(r.get('gates')); print(r.get('planState'), r.get('archivePrepared')); print([k for k in ('artifacts','plan','verification','archive') if k in r])"

# 期望：4 门读数（前三 confirmed、verification missing）；planState=approved；大字段清单为 []
```

```bash
# ② 跨缝渲染（只喂摘要字段）与读放大上界
pnpm vitest run tests/card-face-summary-shape.test.ts tests/state-no-bigfield-read.test.ts
```
