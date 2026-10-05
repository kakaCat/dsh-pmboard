---
req: REQ-261002175818-80a8
doc: architecture
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
---

# 架构设计（REQ-261002175818-80a8）

> **TL;DR**：**一个纯函数 + 一个唯一漏斗 + 四处呈现**。
> 判定是纯计算（不落库，避免"算出来的量"与"声明的量"两处真相）；声明校验挂在 `normalizePlanTasks`
> 这个计划任务的唯一漏斗上（与 `requirement_refs` 同一位置）；超容量在**返回体 / 计划文档标记 / 批准弹框文本 /
> 看板批准评论**四处呈现，但**没有任何一处拒绝落库**（软门禁）。
> 余量参考（`contextPressure`）只是**只读展示**，绝不进判据——判据是我们自己的具名常量。

## 目标与总体方案 `serves: FR-1, FR-3, FR-4`

**问题**：拆分粒度今天靠人拍脑袋，**容量约束不在任何门禁里**（需求 FR-1/FR-3/FR-4）。

**当前状况**：`reqboard_submit(kind=plan)` 只校验计划形态与条款覆盖（`assertClauseCoverageGate`）；
任务表里每张卡有几个文件、要跑几条断言，系统一无所知。于是 100 文件的手术被正常批准、正常开工、跑到一半报废。

**设计方案**：三步各自单一职责——

| 步 | 做什么 | 落在哪 | 为什么在这 |
|---|---|---|---|
| ① 声明 | 计划卡带 `footprint`（files/anchors/chars） | `PlanTask`，经 `normalizePlanTasks` 归一 | 那是**所有**计划任务的唯一漏斗；先例 `requirement_refs` 同处 |
| ② 判定 | `detailUnits` 合成 + 与容量比对 | `src/domain/task/Footprint.ts`（纯函数，零 import） | 判定要能被单测穷举，且协议层/工具层/弹框层**共用同一份算法** |
| ③ 呈现 | 超容量清单四处可见，一处不拒 | SubmitArtifact / 内容门禁 / AskConfirm / 看板路由 | 「批准之前看见」需要覆盖弹框与看板**两条**批准路径 |

**不这么做的后果**：判定写在工具层 → 弹框层要重算一遍 → 两份算法必然漂移（本仓"两份真相"的老病）；
判定落库 → 声明改了判定不改 → 台账里躺着一个过期结论。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9`

```
  ┌─ 声明与校验（唯一漏斗）─────────────────────────────────────┐
  │  tools/SubmitTool ──▶ SubmitArtifact(kind=plan)             │
  │        │  tasks[].footprint 进 schema                        │
  │        ▼                                                     │
  │  protocol.normalizePlanTasks ──▶ domain/task/Footprint       │
  │        │  normalizeFootprint（形状）                          │
  │        │  assertFootprintFloor（声明 ≥ 路径计数，FR-2）        │
  │        ▼                                                     │
  │  plan-landing ──▶ TaskRecord.footprint（FR-7 贯通）           │
  └──────────────────────────────────────────────────────────────┘
                              │
  ┌─ 判定（纯计算，不落库）─────┴────────────────────────────────┐
  │  domain/task/Footprint.judgeFootprint(fp, capacity)          │
  │     ▲ 容量与权重：domain/limits.LIMITS（单一源，INV-2）        │
  │     ▲ 配置覆盖：plugin-config.capacity.roundDetailUnits       │
  └──────────────────────────────────────────────────────────────┘
                              │
  ┌─ 呈现（四处，零拒绝）───────┴────────────────────────────────┐
  │ ① SubmitArtifact 返回体：overCapacity[] + capacityNote       │
  │      └─ 必须同步声明 output schema（additionalProperties:false）│
  │ ② content-gate-wiring：计划文档「⚠️超容量(建议N批)」标记在场     │
  │      └─ 缺标记 → gate plan_overcapacity_marker_missing       │
  │ ③ AskConfirm.ts:83-86：plan 弹框后缀**自动追加**清单           │
  │      └─ 此处已能拿到 targetReq.plan.tasks，不改调用方          │
  │ ④ requirements.handlePlanDecision：看板批准写台账评论          │
  └──────────────────────────────────────────────────────────────┘

  ┌─ 余量参考（只读，非判据，FR-8）──────────────────────────────┐
  │  SessionProbeAdapter.contextPressure ──▶ ContextPressureSnapshot│
  │      ├─▶ node-input-package 追加「## 一轮余量（参考）」节       │
  │      └─▶ executeTaskTree 顶层字段（工具 output schema 同步）    │
  │  不可得 → source=unavailable、字段缺席、不猜 0、不报错          │
  └──────────────────────────────────────────────────────────────┘
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/domain/task/Footprint.ts` | 新增 | 纯函数：`normalizeFootprint` / `declaredFilesFloorFrom` / `judgeFootprint` / `FootprintError` | FR-1, FR-2, FR-3 | 零 import 外层（C-01）；协议层与工具层共用 |
| `src/domain/limits.ts` | 改 | 新增 5 条具名常量（容量、三权重、单值上限） | FR-3 | INV-2 单一源；无消费方变动 |
| `src/shared/protocol.ts` | 改 | `CardFootprint` / `PlanTask.footprint` / `TaskRecord.footprint` / `OverCapacityItem` / `CapacityNote` / `ContextPressureSnapshot`；`normalizePlanTasks` 白名单补一项 + 调用两个 footrpint 校验 | FR-1, FR-2, FR-7, FR-8 | 台账与服务端共享类型；`REQBOARD_SCHEMA_VERSION` 不变（FR-9） |
| `src/application/internal/plan-landing.ts` | 改 | draft 结构与 `TaskRecord` 逐字段映射各补一行 `footprint` | FR-7 | 落库卡带体量；漏传即静默丢（本仓已发生两次） |
| `src/application/internal/approved-plan-landing.ts` | 改 | `draftOf()` 补一行 `footprint` | FR-7 | 台账 `plan.tasks` → draft 的第二条映射 |
| `src/application/use-cases/Decompose.ts` | 改 | creative 与「计划携带任务表」**两条**映射各补一行 | FR-7 | 同一语义的第三、第四份手写映射 |
| `src/application/use-cases/SubmitArtifact.ts` | 改 | plan 分支：算判定、拼 `overCapacity`/`capacityNote`；旁挂 FR-5 标记校验 | FR-4, FR-5 | 返回体键必须与 output schema 同批改 |
| `src/application/internal/content-gate-wiring.ts` | 改 | 新增标记在场校验（照 `assertClauseCoverageGate` 样本） | FR-5 | 只读 `decomposition.md`；缺文件早退（与既有惯例一致） |
| `src/application/internal/artifact-gates.ts` | 改 | `GateFailure.code` 联合加 `plan_overcapacity_marker_missing` | FR-5 | 客户端错误标签表同步 |
| `src/application/use-cases/AskConfirm.ts` | 改 | plan 后缀追加超容量清单（复用纯函数重算） | FR-6 | 弹框文本仍受 `popupQuestionMax` 裁剪 → 清单**必须可压缩**（见下） |
| `src/http/routers/requirements.ts` | 改 | `handlePlanDecision` 评论带超容量清单一句话 | FR-6 | 看板批准路径的唯一文本载体 |
| `src/application/ports.ts` + `src/adapters/SessionProbeAdapter.ts` | 改 | 新增 `contextPressure(windowKey)` 端口方法 + `readContextPressure` 纯解析 | FR-8 | **装配零改动**：`src/index.ts:421-427` 已注入 `sessionProjections` 惰性 getter |
| `tests/application/harness.ts` | 改 | `FakeSession implements SessionProbe` 补实现（**唯一会编译报错的替身**） | FR-8 | 其余 ~11 处测试直接 `new SessionProbeAdapter({})`，自动获得新方法 |
| `src/application/internal/node-input-package.ts` + 调用点 `IsolateNodeContext.ts` | 改 | 追加「## 一轮余量（参考）」节（照「## 断点」写法） | FR-8 | 无数据 → 空串 → 旧输出逐字节不变 |
| `src/application/use-cases/TaskTree.ts` + `src/tools/TaskTreeTool` | 改 | 顶层余量参考字段 + 每卡 `footprint` 回显 | FR-8, FR-9 | 白名单投影：接口 / nodeOf / tool schema **三处必须同改** |
| `src/domain/prompt/fragments/decomposing/heavy.md`（及 light） | 改 | 加「一轮容量」纪律：必须声明 footprint、超容量要切卡并写标记 | FR-1, FR-3, FR-5 | 改完必须跑 `node scripts/inline-prompt-fragments.mjs` + `check-prompt-fragments.mjs` |
| `src/plugin-config.ts` | 改 | `capacity?: { roundDetailUnits?: number }` + 解析函数（照 `panelSettings`） | FR-3 | 缺省 16；`capacityNote.source` 反映常量/配置 |

## 数据结构变更 `serves: FR-1, FR-7, FR-9`

结构与兼容性分析见 [data-model.md](./data-model.md)（本文不重复）。要点三条：

1. `CardFootprint` **全链可缺省**：缺失 = 未声明，**不判定、不报错、不冒充 0**；
2. **不 bump `REQBOARD_SCHEMA_VERSION`**（维持 9）：依据本仓先例「字段可缺省 → 旧台账读出即旧行为」；
3. 判定结果（`FootprintJudgement`）**只存在于内存**，不写台账——避免与声明形成两处真相。

## 接口变更 `serves: FR-1, FR-4, FR-8`

签名、错误语义与工具 schema 逐项见 [interfaces.md](./interfaces.md)。要点两条：

1. `PlanTask.footprint` 必须**同时**进工具入参 schema（`additionalProperties:false` 会拒收未声明键）；
2. 返回体新增键必须**同时**进 output schema——`tests/output-contract.test.ts` 的静态扫描会把漏声明扫红。

## 依赖关系 `serves: FR-3, FR-8`

| 方向 | 允许 | 本需求的落点 |
|---|---|---|
| `domain` → 外部 | **禁止** | `Footprint.ts` 零 import（与 `RequirementRefs.ts` 同规格），`tests/layer-boundary.test.ts` 兜底 |
| `application` → `domain` | 允许 | SubmitArtifact / AskConfirm / content-gate-wiring 调 `judgeFootprint` |
| `application` → `adapters` | **禁止**（走端口） | 余量参考走 `SessionPort.contextPressure`，不直接碰 `sessionProjections` |
| `client` → `shared` | 允许 | 错误标签表加一条；`overCapacity` 的渲染不在本次范围 |

**新增外部依赖**：无。本需求只读 DSH 既有投影（`@deepseek-ai/dsh-token-meter` 的 `contextPressure`，默认装载）。

## 关键算法/流程 `serves: FR-2, FR-3, FR-5`

### 合成细节量与判定（纯函数） `serves: FR-3`

```
detailUnits = files × 1 + anchors × 0.5 + chars / 2000      ← 权重全部来自 LIMITS
capacity    = 配置覆盖 ?? LIMITS.roundDetailUnits (16)
over        = detailUnits > capacity                         ← 严格大于；等于不算超
suggestedBatches = over ? ceil(detailUnits / capacity) : undefined   ← over 时恒 ≥2
```

**为什么用「细节量」而不是直接拍文件数阈值**：100 个文件的机械重命名与 100 个文件的语义手术，
清醒度代价不同；锚点与实施描述的长度各贡献一部分。三个权重是**待标定假设**（`calibrated=false`）。

**为什么判定不落库**：声明会变（计划重交），落库的判定会立刻过期；纯函数重算的成本是一次乘法。

### 声明下限（防缩水） `serves: FR-2`

```
floor = |{ implementation 正文里匹配 (src|tests|docs|scripts)/… 的去重路径 }|
files < floor  →  REQBOARD_BAD_FOOTPRINT（消息给实际计数与修复指引）
files ≥ floor  →  通过（允许留余量）
```

**为什么是下界而不是等号**：`implementation` 不可能穷举所有要碰的文件（"顺带改一处引用"很常见），
要求等号会逼人造假；下界只堵住**缩水**这一个作弊方向，而缩水正是唯一能骗过门禁的方向。
路径写成散文（不带这些前缀）不计入——下限是防缩水下界，**不是完整性审计**。

### 标记在场 `serves: FR-5`

```
对每张 over 的卡：decomposition.md 里必须出现「⚠️超容量(建议N批)」，且 N == suggestedBatches
  否则 → gate plan_overcapacity_marker_missing（gaps 列出缺标记的卡 key 与期望 N）
```

**为什么要求 N 相等而不是只要求"有标记"**：只要求在场，就会出现「标了但数字是旧算的」——
披露与实际判定漂移，而人只看标记。相等是**可机械证伪**的。

### 弹框文本的压缩纪律 `serves: FR-6`

`popupQuestionMax = 220` 字符：超容量清单不能无限长。压缩规则（写在纯函数里，可单测）：

```
1 张卡：  超容量：t3（113 DU / 容量 16，建议 8 批）
N 张卡：  超容量 N 张：t3(建议8批)、t7(建议3批)…（详见提交返回体的 overCapacity）
```

### 余量参考的标注 `serves: FR-8`

展示值 = `contextWindow − projectedTokens`（两者任一缺席 → 整条参考不显示），
同一条展示内固定带「参考值，非门禁判据」字样。**判据永远是 LIMITS 常量**，理由写进注释：
token-meter 自述这些字段刻意非原子、且 "not a gating input"。

## 安全/性能考虑 `serves: FR-3, FR-8`

- **性能**：判定是 O(卡数) 的乘法与一次正则扫描，无 IO；`contextPressure` 读的是已经算好的投影状态（O(1)），
  不触发额外请求。
- **无副作用**：新增判定路径**不写台账**（除既有批准评论多一句），不改变任何写路径语义。
- **不引入拒绝路径**：超容量**不是错误**——这是软门禁的机器语义（`success` 仍为 `true`）。
- **正则安全**：路径计数用**字面量前缀 + 白名单字符类**，不用用户输入构造正则（避免 ReDoS）。

## 测试策略 `serves: FR-2, FR-3, FR-5, FR-7`

分层与命令见 [test-cases.md](./test-cases.md)。四条硬性要求：

1. **修前必红**：`Footprint.ts` 尚不存在时的 import 失败即第一层红；先写域单测再写实现；
2. **反向证伪**：FR-7 的贯通用例必须"删白名单一项即变红"（照 `tests/plan-refs.test.ts` 的手法）；
3. **门禁必须有会响的线**：FR-5 的标记校验要有"无标记 → 拒绝"与"标记 N 错 → 拒绝"两条；
4. **回归对照**：`tests/size-budget.test.ts` 本次文件命中 0；`pnpm typecheck` 不高于基线 223。

## 错误处理 `serves: FR-2, FR-5`

| 场景 | 处理 | 码 |
|---|---|---|
| footprint 形状非法（缺字段/非正整数/未知键/超单值上限） | 抛领域错误，消息点名卡与原因 | `REQBOARD_BAD_FOOTPRINT` |
| 声明小于证据 | 同上，消息给实际计数与修复指引 | `REQBOARD_BAD_FOOTPRINT` |
| 超容量 | **不报错**：`success:true` + `overCapacity` 非空 | —— |
| 计划文档缺标记 / 标记批数不符 | 拒绝提交，gaps 点名卡与期望 N | `plan_overcapacity_marker_missing` |
| 余量投影不可得 | 不显示参考、不猜 0、不报错 | —— |
| 未声明 footprint（旧计划/旧台账） | 不判定、回显「未声明」 | —— |

## 配置项 `serves: FR-3`

| 配置 | 缺省 | 语义 | 回退 |
|---|---|---|---|
| `capacity.roundDetailUnits` | `16` | 一轮细节容量（DU） | 非有限正数 → 回落 16，`capacityNote.source='constant'` |

## 文档更新清单 `serves: FR-3, FR-8`

| 文档 | 更新点 |
|---|---|
| `docs/architecture/project-manual.md` | 新增一条机制备忘：「一轮容量」的口径与"余量参考非判据"的边界（归档时申报） |
| `docs/knowledge/glossary.md` | 新增术语：细节量（DU）/ 卡片体量 / 余量参考（非判据） |
| `docs/knowledge/conventions.md` | 新增一条规范：拆分卡片必须声明体量（含判定命令），以及容量常量改动要同时改 `LIMITS` 与测试 |

## 遗留问题 `serves: FR-3, FR-8`

1. **权重与容量未经标定**：16 DU / 1 / 0.5 / 2000 都是假设值。校准闭环（预测 vs 实际 token 台账回归）
   **本需求不做**，已按用户裁定另立需求；本设计只保证 `calibrated` 字段与单一源常量留好接口。
2. **软门禁的固有代价**：人可以放行超容量计划。这是用户裁定（要保住人的判断权），不是缺陷；
   若日后要改硬门禁，属单向升级，需重新裁定门禁语义。
3. **中文表头任务表漏检**（既有门禁的已知限制）不影响本需求：FR-5 的标记校验按**卡 key** 定位，不依赖表头语言。
4. **`planKeysIn` 未 export**（`src/application/internal/content-trace.ts:140`）：实现 FR-5 时要么导出它、
   要么在 Footprint 侧写一个等价的 key 提取——**倾向于导出复用**，避免第二份 key 词法。
