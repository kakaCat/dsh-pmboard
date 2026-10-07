---
requirement_refs: [FR-1, FR-2, FR-4, FR-5, FR-6]
---

# 后端实现设计（REQ-261007125552-32cb）

## 判定分层与依赖方向 `serves: FR-2, FR-4, FR-5`

沿用本仓内容门的三层纪律（尺寸门禁 ≤400 行的既有解法）：

```
domain/task/Granularity.ts        纯判定：给文本/卡片 → 缺口。零 IO、不碰时间与随机数
application/internal/plan-granularity.ts   wiring：读文档、组装 GateFailure（唯一碰文件系统）
use-cases / approved-plan-landing 三条入口：只调用 assertGranularityGates，不复制判定
```

**为什么新模块而不塞进 content-gate-wiring.ts**：该文件已 1000+ 行；`plan-granularity.ts` 与 `plan-doc-table.ts`（任务表判据）同级同构——都是「计划文档 ↔ tasks[]」一致性判定，分文件各管一维。

## FR-1：清单节门（挂在 checkDesignContentGate 聚合） `serves: FR-1`

**判定流程**（在既有聚合循环里加一维，复用其信封一次报全）：

1. `docQualityRulesApply(req.createdAt)` 判 false → 整维跳过（存量不追溯）；
2. `req.category === 'feature'` 且 `design/interfaces.md` 存在且未被 `design_exempt` 豁免 → 该文档必须含标题含「接口清单」的 H2，且节内有表（表头含「接口 id」）或「不适用：」豁免行；
3. `sides` 含 `frontend` 且 `design/frontend.md` 存在 → 必须含标题含「组件树」的 H2（同款豁免行出口）；
4. 缺失 → 聚合进既有 `REQBOARD_DESIGN_CONTENT_GATE` 报错（code 不变，gaps 加一行），文案给出模板位置。

**为什么复用聚合门而不独立错误码**：design 提交门已有一次报全机制（测评教训：修一个发现一个的重试风暴）；清单节缺失与 serves 缺失是同类「文档形态不完整」。

## FR-2：对照表门（plan-granularity.ts 主判定） `serves: FR-2`

**判定流程**（`assertGranularityGates` 内第一维，enforce）：

1. 生效口径门控（`docQualityRulesApply`）→ 不适用则整门跳过；
2. 读 `design/interfaces.md` 的接口清单条目集 `IFs`（无清单节/不适用 → 降级：接口段判据转 warn，记录降级原因）；
3. 读**实际提交的那份计划**（`planPath` 参数透传——复用超容量门「不硬编码 decomposition.md」的教训）；
4. 找对照表（表头含「接口」+「接收卡 key」——**不得**用「计划 key」，与 `readPlanDocTaskTable` 的「第一张含计划 key 的表 = 任务表」词法避让，见 interfaces.md §文档格式契约三）：
   - `IFs` 非空但找不到对照表 → 拒（`plan_interface_map_missing`）；
   - `IFs` 中某条目无对照行 → 拒，点名 `IF-N`；
   - 对照行右列 key ∉ `tasks[].key` 全集 → 拒，点名悬空 key；
5. sides 含 frontend 且 frontend.md 有组件树节 → 组件段同款判定（`plan_component_map_missing`）；无组件树节 → 降级 warn。

**一对多是合法的**：一个 `IF-N` 可被多张卡接（契约卡 + 实现卡），右列逗号分隔多个 key 不算违规——这正是接口级拆分后的常态。

## FR-4：接口数门（Granularity.ts 纯函数 + wiring） `serves: FR-4`

**判定流程**（`assertGranularityGates` 内第二维，enforce）：

1. 对每张卡：`ifs = countInterfaceDeclarations(card.implementation)`（词法见 [interfaces.md](interfaces.md) §接口声明词法，去重计数）；
2. `ifs.length > LIMITS.maxInterfacesPerCard` 且 `granularity_exempt` 为空 → 收集缺口；
3. 有缺口 → 拒（`plan_card_multi_interface`），envelope 逐卡点名：卡 key + 识别到的接口清单 + 建议「一接口一卡、契约卡先行」；
4. 有豁免理由 → 放行，理由进 `granularity_warnings`（豁免不静默）。

**误报防护**：词法只认声明式写法（大写动词+路径 / `tool:` 前缀）；实测误报 → `granularity_exempt` 显式豁免。宁可漏判（散文里隐晦的多接口），不可误判锁死合法卡——漏判由 FR-3 提示词与 FR-5 软门兜底。

## FR-5：形态下限软门（warn only） `serves: FR-5`

**判定流程**（`assertGranularityGates` 内第三维，恒 warn）：

1. `footprint.files > LIMITS.footprintFilesSoftMax` → 警告「卡面过宽（files=N>5）：请按接口/组件切小，或确认这是聚合/迁移类卡」；
2. `side === 'frontend'` 且 `prototypeRefs.length > 1` → 警告「一卡多锚点：UI 卡应一卡一组件锚点」；
3. 全部进返回体 `granularity_warnings`，**绝不 reject**（与超容量门同哲学：风险不是错误）。

## 三条入口的挂载点 `serves: FR-2, FR-4, FR-5`

| 入口 | 挂载位置 | 时机 |
|---|---|---|
| `submitPlanArtifact`（kind=plan） | `assertClauseCoverageGate` 之后、超容量门之前 | 提交期即拦 |
| `executeDecompose` | `assertClauseCoverageGate` 之后、mutate 之前 | 落库前拦（创作型 tasks 路径） |
| `approved-plan-landing` | 与既有覆盖门禁同序 | 看板批准直落路径 |

三处传参同形：`(deps.docs, req, rawTasks, planPath)`；返回值 `GranularityReport { failure?: GateFailure; warnings: string[] }`，failure 非空即 reject（零副作用），warnings 并入返回体。

## 性能考量 `serves: FR-2, FR-4`

- 全部门判定只在提交/落库路径跑（低频、人已等待），无热路径影响；
- 文档读取走 `deps.docs` 缓存读（与既有门同款），接口清单 + 对照表共 ≤3 份文档、每份一次读取；
- `countInterfaceDeclarations` 是纯正则扫描，单卡 implementation ≤4000 字符，O(n) 可忽略。

## 提示词与模板改动 `serves: FR-1, FR-3`

- **FR-1**：`fragments/design/light/overrides.md`、`heavy/overrides.md` 各加一条「feature 必交接口清单节、含 UI 必交组件树节」；`templates/design/interfaces.md`、`frontend.md` 补两节骨架；
- **FR-3**：`fragments/decomposing/light.md`、`heavy.md` 加粒度三节（接口级/组件级/一卡一锚），`feature.md` 类型档把「契约先行」升级为「一接口一卡」；
- **再生成**：`node scripts/inline-prompt-fragments.mjs`（generated/fragments.ts 是生成物，不手改），`prompts:check` 必须绿；
- **探针同口径**：对照表/清单表的表头判据登记进 `scripts/template-gate-probe.mts` 与 `scripts/doc-section-parity.mts`（plan-doc-table.ts 注释的同款纪律：同一件事的词法全仓一份）。
