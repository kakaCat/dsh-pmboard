<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->
# 测试用例（REQ-261006175040-12d4）

> 验收口径可执行：跑什么命令、看到什么算过。T 编号供验收单逐项引用。
> 总命令：`pnpm test`（C-14 与基线比对）+ `pnpm typecheck`（C-15）+ `pnpm build:client`（C-12）。
> 本需求不改台账数据、不加 schema、不写业务数据：**无迁移步骤**，回滚 = `git revert` + `pnpm build:client`。

## T-0 测试矩阵总表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 编号 | 层级 | 覆盖什么 | 命令锚点 | 期望读数 | serves |
|---|---|---|---|---|---|
| T-1 | 单元（改） | 摘要投影出门读数：三态、`count`、成组确认、`artifacts===undefined` 不下发、键集恰好等于 `SUMMARY_KEYS` | `pnpm vitest run tests/reqboard/domain-summary.test.ts` | 全绿；无读数时 `'gates' in s === false` | FR-2, FR-6 |
| T-2 | 单元（改） | 卡面按读数渲染：三态 chip、`门 c/t`、确认按钮在场/缺席、计划与归档 chip | `pnpm vitest run tests/card-face.test.ts` | 全绿（夹具改为摘要形状） | FR-1, FR-3, FR-4, FR-5 |
| T-3 | 单元（跨缝，新增） | 只用摘要字段喂 `buildBoard`：全落章 ⇒ `✓✓✓✗` + `门 3/4`；无读数 ⇒ 不渲染且不出现 `✗`/`产物 0/6` | `pnpm vitest run tests/card-face-summary-shape.test.ts` | 全绿；改动前必红 | FR-1, FR-3, FR-6 |
| T-4 | 单元（读放大，新增） | 预热 1 次后连续 3 次 `/state`：四件大字段对象读取增量为 0 | `pnpm vitest run tests/state-no-bigfield-read.test.ts` | `readObject` 计数增量 = 0 | FR-2, FR-7 |
| T-5 | 单元（同形，改） | 分片 / SQLite / 假投影三条 summary 产出路径给出**相同**读数 | `pnpm vitest run tests/reqboard/store-contract.test.ts` | 三份读数逐字段相等 | FR-2, FR-7 |
| T-6 | 单元（载荷，改/扩） | `/state` 每需求 `gates` 有界（≤5）且不含任何 `BIG_FIELD_KEYS`；增量 ≤5% | `pnpm vitest run tests/state-payload-client.test.ts` | 键集与 `BIG_FIELD_KEYS` 无交集；字节差 ≤5% | FR-2, FR-7 |
| T-7 | 单元（回归） | 首屏仍只打 `/state`，门读数不引入新端点 | `pnpm vitest run tests/state-payload-client.test.ts` | `calls.length === 1`；0 次详情请求 | FR-2 |
| T-8 | 逆验证（人工） | 删掉 `gates` 传递（或让客户端回读 `req.artifacts`）⇒ T-3 必红 | `pnpm vitest run tests/card-face-summary-shape.test.ts`（临时 patch） | **红** | FR-7 |
| T-9 | 逆验证（人工） | `artifacts === undefined` 也下发成 `missing` ⇒ T-3 必红 | 同 T-8 | **红** | FR-6, FR-7 |
| T-10 | 类型 | 类型检查零错 | `pnpm typecheck` | 退出码 0（与基线同刻 tsc 读数一致） | FR-7 |
| T-11 | 基线 | 失败用例集合差为空 | `pnpm baseline:check` | 退出码 0 | FR-7 |
| T-12 | 构建 | 客户端 bundle 重建且关键符号齐全 | `pnpm build:client` | `[verify-client] OK` | FR-1, FR-4 |
| T-13 | E2E | 真渲染 + 真 CSS 出图对照（三态卡面） | `npx tsx scripts/card-gates-ui-shot.mts` | 退出码 0；PNG 落 `evidence/` | FR-1, FR-3, FR-4, FR-5, FR-6 |
| T-14 | 人评审 | 出图与权威原型逐区块对照 | 人看 `prototypes/card-gates.html` | 人点头（锚点 5/5） | FR-1, FR-3, FR-4, FR-5, FR-6 |

## T-1~T-3 摘要投影与卡面渲染 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **T-1 键集与三态**：`summarize`/`boardSummaryOf` 出口的键集**恰好等于** `SUMMARY_KEYS`
  （新增 `gates`/`planState`/`archivePrepared` 三键已进常量）；`gates` 每项 = `{ kind, status, count }`，
  `status ∈ {confirmed, pending, missing}`。
- **T-1 成组确认**：同一 kind 多份产物（design ×6）只要**一份**未落章 ⇒ 该门 `pending`（不是 `confirmed`）；
  `count === 6`（按钮文案「全部 6 份」的取值）。全部落章 ⇒ `confirmed`。
- **T-1 不可得**：入参 `artifacts === undefined` ⇒ 出口**无** `gates` 键、**无** `archivePrepared` 键
  （`'gates' in s === false`），而不是 `gates: []` 或 `missing`。
- **T-1 大字段**：`BIG_FIELD_KEYS` 一个都不在出口（既有断言保留，本次只加三个有界键）。
- **T-2 卡面三态**：`✓ 需求文档`（`confirmed`）/ `⏳ 需求文档`（`pending`，带
  `data-action="confirm-artifact"`）/ `✗ 需求文档`（`missing`）逐字断言。
- **T-2 派生行**：`门 3/4`（分子 = `confirmed` 门数，分母 = 生效门总数）；生效门总数为 0 时整行不渲染。
- **T-2 按钮**：当前门 `pending` ⇒ 在场（design 门文案含份数）；`missing`/`confirmed` ⇒ 不在场。
- **T-2 其余 chip**：`planState` = `pending`/`approved`/`rejected` 分别渲染「计划待批」/「计划已批」/「计划被退」；
  `archivePrepared === true` 时列表行不渲染「归档材料待补」，`false` 时渲染。
- **T-3 跨缝夹具（本次核心）**：夹具**只提供摘要字段**（`id`/`title`/`status`/`category`/`gates`/…），
  不含 `artifacts`/`plan`/`verification`/`archive`；断言两个场景：
  1. 四门全落章 ⇒ `✓需求文档 ✓设计文档 ✓拆分计划 ✗验收材料` + `门 3/4`；
  2. 无读数 ⇒ chips 行 / 派生行 / 按钮整块不在 HTML，且**不出现** `✗` 与 `产物 0/6`。
- **T-3 逆向复核注记**：本用例在改动前必红（`git stash` 后跑一次取证）；
  夹具一旦被改回全量记录形状，本用例的证伪力即失效——评审时按此点检查。

## T-4~T-6 读放大、同形与载荷上界 `serves: FR-2, FR-7`

- **T-4 读放大**：用 `RequirementShardRepository` 的计数替身（只数 `readObject` 调用）建
  `ShardedRequirementStore`，经 `createReqboardHandler` 打 `/state`：预热 1 次后连续 3 次，
  `readObject` 对 `artifacts`/`plan`/`verification`/`archive` 的调用增量 = **0**（索引命中）。
- **T-4 写路径**：登记 / 落章 / 批准各走一次，断言读数同步刷新且**不新增** `readObject`
  （`ShardedRequirementWriter` 手上已有整条记录，投影零额外 IO）。
- **T-5 同形**：`store-contract` 的读套件加「门读数同形」断言——分片 / SQLite / 假投影
  （`tests/support/legacy-store-projection.ts`，现由 `summarize` 直出，须改走 `boardSummaryOf`）
  对同一条需求（含多份 design 产物）给出逐字段相等的 `gates`/`planState`/`archivePrepared`。
- **T-6 载荷上界**：同一批需求分别按「有读数 / 无读数」两次投影比对序列化字节：
  `(bytesWith - bytesWithout) / bytesWith ≤ 0.05`；单条 `gates.length ≤ 5`。

## T-7 首屏取数回归 `serves: FR-2`

- `/state` 仍是首屏**唯一**请求（`calls.length === 1`）；门读数随同一份摘要下发，**不**新增
  `/requirements/:id/gates` 一类端点，也**不**触发详情请求。

## T-8~T-9 逆验证（本仓纪律） `serves: FR-6, FR-7`

- **T-8**：临时删掉 `gates` 的传递（或把客户端改回读 `req.artifacts`）⇒ T-3 **必红**；复原后必绿。
- **T-9**：把 `artifacts === undefined` 也下发成 `missing` ⇒ T-3 **必红**（「读不到」被渲染成「缺失」）。
- 两条都**只作人工取证**，不写进常驻测试；取证输出贴进验收材料。

## T-10~T-12 类型 / 基线 / 构建 `serves: FR-7`

- `pnpm typecheck` 退出码 0；错误数与基线同刻 tsc 读数一致。
- `pnpm baseline:check` 失败用例集合差为空（差集非空先逐条确认是否本次引入）。
- `pnpm build:client` 输出 `[verify-client] OK`（关键符号齐全 / 样式归属章在场 / CSS 分片完整）。

## T-13~T-14 视觉对照与人评审 `serves: FR-1, FR-3, FR-4, FR-5, FR-6`

- **T-13**：新增 `scripts/card-gates-ui-shot.mts`（沿用 `scripts/req-detail-ui-shot.mts` 的 headless Chrome
  手法：真渲染 + 真 CSS + 2 倍图），出 PNG 到 `docs/requirements/REQ-261006175040-12d4/evidence/`，
  覆盖三态卡面（需求分析期 / 设计期成组确认 / 实施期）+ 读数不可得降级态。
  退出口径照抄既有脚本：**0 = 成功 / 1 = 有图不像话 / 2 = 环境不可用（打修复指引，不静默跳过）**。
- **T-14**：人拿 T-13 的 PNG 与权威原型 `prototypes/card-gates.html` 逐区块对照（锚点
  FR-1 / FR-3 / FR-4 / FR-5 / FR-6，5/5 命中）；不通过则回到实现返工，不修改原型凑绿。

## 实施收尾必绿 `serves: FR-7`

| 判据 | 命令 | 期望 |
|---|---|---|
| 摘要与卡面 | `pnpm vitest run tests/reqboard/domain-summary.test.ts tests/card-face.test.ts tests/card-face-summary-shape.test.ts` | 全绿；T-3 改动前必红已取证 |
| 读放大与同形 | `pnpm vitest run tests/state-no-bigfield-read.test.ts tests/reqboard/store-contract.test.ts` | 增量 0；三实现读数相等 |
| 载荷上界 | `pnpm vitest run tests/state-payload-client.test.ts` | `gates ≤ 5`；无大字段键；字节差 ≤5% |
| 类型 / 基线 | `pnpm typecheck && pnpm baseline:check` | 退出码 0；失败集合差为空 |
| 客户端构建 | `pnpm build:client` | `[verify-client] OK` |
| E2E 出图 | `npx tsx scripts/card-gates-ui-shot.mts` | 退出码 0；PNG 落 `evidence/` |
| 逆验证 | T-8 / T-9 两条临时 patch | 两条均**必红**（取证完毕已复原） |

- E2E 覆盖行已在需求文档的测试策略表里声明（层级 = E2E），实施收尾的 E2E 门按此表取值。
- 测试文件头部按本仓约定声明覆盖的条款（`serves:` 注释块），供三级追溯门读取。
