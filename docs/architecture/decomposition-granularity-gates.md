# 拆分粒度门禁（清单节 / 对照表 / 接口数）（contract）

> 来源：REQ-261007125552-32cb（2026-10-07 立项 / 同日验收归档）。
> 本文只写**会被别的需求与提示词档引用**的契约与口径；执行期的逐卡裁决与偏差留在该需求的
> `docs/requirements/REQ-261007125552-32cb/`（`reviews/final-review.md` 评审 · `tests/evidence.md` 证据）。

## 0. 一句话

拆分太粗不是"agent 不听话"，而是**没有判据、也没有拆分输入**：提示词只给了容量上限（16 DU），
设计文档里没有机器可扫的接口/组件清单，门禁不查"一卡声明了几个接口"。本文是补上之后的三层口径——
**设计先行（清单节）→ 拆分对照（对照表）→ 粒度门禁（接口数 / 形态软门）**。

## 1. 三层结构（谁在哪一层说话）

| 层 | 判据 | 唯一实现 | 强度 | 触发时点 |
|---|---|---|---|---|
| ① 设计先行 | feature 的 `design/interfaces.md` 必含「接口清单」节（表头含「接口 id」）；`sides` 含 frontend 时 `frontend.md` 必含「组件树」节 | `content-gate-wiring.designSectionMissing`（聚合进 `checkDesignContentGate`） | 硬（`REQBOARD_DESIGN_CONTENT_GATE`） | `reqboard_submit(kind=design)` |
| ② 拆分对照 | 清单条目必须有卡接：计划文档里的对照表逐条覆盖，右列 key ∈ `tasks[].key` | `application/internal/plan-granularity.ts`（判定单点） | 硬（`plan_interface_map_missing` / `plan_component_map_missing`） | 三条入口：submit(plan) / decompose / 批准直落 |
| ③ 粒度门禁 | 一卡 `implementation` 声明 >1 个接口即拒；`footprint.files` 超阈值、UI 卡多锚点只警告 | `domain/task/Granularity.ts`（纯判定）+ `plan-granularity.ts`（取数与组装） | 接口数=硬（`plan_card_multi_interface`）／形态=软（`granularity_warnings`） | 同上三条入口 |

**为什么判定单点与三条入口分离**：本仓事故教训——多条路径各写分派必然分叉漏接线。
`assertGranularityGates(docs, req, rawTasks, planPath)` 是唯一分派口，三条入口只调用。
`tests/plan-granularity.test.ts` 的「三入口同款拦截」用例锁死同码同点名。

## 2. 词法契约（照抄，别自创）

| 契约 | 形态 | 为什么不能改 |
|---|---|---|
| 接口清单表头 | `接口 id` 列 | 门禁与模板探针同吃这一份词法；散文列举不算 |
| 组件树节 | H2 含「组件树」 | 同上 |
| 对照表 key 列名 | **「接收卡 key」** | ⚠️ 叫「计划 key」会被 `readPlanDocTaskTable` 误认成**任务表**（它取第一张含「计划 key」的表）——本需求提交计划时实测撞上，门禁报"任务表没收录这些卡" |
| 对照表左列 | 接口 `IF-N` / 组件名 | `IF-N` 与 `interfaces.md` 清单编号同源 |
| 接口声明词法 | `(GET\|POST\|PUT\|PATCH\|DELETE) /path`（大写动词+空格+`/`路径）、`tool: name` / `工具：name` | 只认**声明式写法**；散文里的「接口」「API」、小写动词、裸动词一律不计（宁可漏判不可误锁） |
| 豁免字段 | `granularity_exempt: "理由"`（snake 主 / camel 兼容，≤300，空串 ≠ 豁免） | 与 `skipIntegrationReason` 同模式：砍约束是减法，理由要能复核；豁免不静默——理由进 `granularity_warnings` |
| 降级出口 | 设计文档内写「不适用：<理由>」保留节；或 front-matter `design_exempt=<文件名>=理由` | 没有判据对象时不硬拒（与 `e2eCoverageOf`「读数未知不判」同口径） |

## 3. 生效口径与存量

- **不追溯**：三层新门都按 `docQualityRulesApply(req.createdAt)`（2026-10-06T12:00:00Z 起）门控；
  规则生效前立项的需求照旧提交，且**降级路径不静默**（返回体写明降级原因）。
- **形态软门（FR-5）全量生效**，因为它不拒——只加一条 `granularity_warnings`。
- **阈值单一源**：`LIMITS.maxInterfacesPerCard = 1`、`LIMITS.footprintFilesSoftMax = 5`（后者是**待标定假设值**，与 `roundDetailUnits` 同口径）。

## 4. 一条硬约束：提示词 light 档的 2500 字符预算

规则全文只能住 **heavy 档**（`fragments/decomposing/heavy.md` §3.5）；light 档与类型档只能带压缩版。
实测：`decomposing` light 档在加规则前就已是 2493 字符（上限 2500，`tests/prompt-tiers.test.ts`），
任何"顺手多写几句"都会把它推红。压缩后 design 2481 / decomposing 2493。
**改提示词档前后必须跑**：`pnpm prompts:check`、`npx vitest run tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts`
（P1 基线由 `node scripts/dump-stage-prompts.mjs` 重刷，diff 即变更留痕）。

## 5. 可复核入口

- 门禁与回归：`npx vitest run tests/plan-granularity.test.ts`（47 passed：清单节 9 / 对照表 8 / 降级 4 / 接口数门 4 / 豁免 11 / 软门 5 / 三入口 3）
- RTM 一对多：`npx vitest run tests/decompose-rtm-integration.test.ts`（4 passed，含「一条 FR 被 3 张接口卡接收」）
- 模板探针：`npx tsx scripts/template-gate-probe.mts`（25 份模板 FAIL 0，含「对照表 / 清单节」判据）
- 设计文档自检：`npx vitest run tests/doc-quality-gate.test.ts tests/design-completeness-gate.test.ts`（30 passed）
- 逐卡证据：`docs/requirements/REQ-261007125552-32cb/tests/evidence.md`；评审与偏差：`.../reviews/final-review.md`

## 6. 三条可复用教训（与具体需求无关）

1. **给"输入"加门，比给"输出"加限制更有效**：粗卡的根因是拆分时没有清单可对照；先让设计文档交出机器可扫的清单，拆分才有对照物。
2. **新门必须喊出"我没生效"**：降级（无清单 / 读不到文档）与豁免（`granularity_exempt`）都进返回体，
   否则"门看起来绿了"和"门根本没跑"长得一模一样。
3. **同一份文档里的两张表会抢词法**：对照表与任务表共用「计划 key」就互相误认——**表头判据是全局命名空间**，
   新增表必须挑不冲突的列名（本次定为「接收卡 key」），并把该避让写进模板注释与设计契约。
