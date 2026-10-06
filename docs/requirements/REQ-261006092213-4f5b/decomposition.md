# 拆分计划 · REQ-261006092213-4f5b 验收项由 agent 实测完成 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 目标：把「验收项由 agent 实测、人只做审核员」这条链从**字段已有但没写路径**，打通成
> 提交即落章、人零输入裁决、底线真实可拦。
> 做法：新增结构化 `results`（`ref` 与验收项来源同构）→ 逐项交代硬门 → 组装时落结果 →
> 弹框只问裁决 → 看板预填 → 底线与放行判据修正 → 兼容与回滚一行开关。
> 台账字段零新增、零数据迁移（见 design/data-model.md）。

## 一、变更盘点 <!-- serves: FR-1, FR-2, FR-6, FR-8 -->

**新增**

- `src/domain/workflow/ResultBinding.ts`：结果匹配与体检（纯函数单点）。
- `tests/result-binding.test.ts`、`tests/accept-sheet-zero-input.test.ts`、`tests/verdicts-http.test.ts`。
- 工具参数 `results`（`reqboard_submit(kind=verification)` 顶层新键）。

**修改**

| 文件 | 改什么 |
|---|---|
| `src/tools/SubmitTool/SubmitTool.ts` | 顶层 `properties` 声明 `results`（schema 是 `additionalProperties:false`） |
| `src/tools/SubmitTool/prompt.ts` | 提示词补「逐项交结果」的口径 |
| `src/application/use-cases/SubmitVerification.ts` | 读 `results`、跑硬门、组装后落结果、返回体加三键 |
| `src/application/use-cases/AcceptSheet.ts` | `resultOf` 去 `evidence[0]` 兜底；放行判据加 `unverified`；返回体加计数 |
| `src/domain/workflow/AcceptanceSheetSpec.ts` | `applyVerdicts` 的 `passed` 校验放宽；回滚开关语义写清 |
| `src/application/internal/verdicts.ts` | 裁决写入 `result` / `resultSource='human'`（人改过结果） |
| `src/http/routers/verdicts.ts` | 路由预校验放宽（空 `opinion` 的通过不再 400） |
| `src/client/stage-panel.ts` | 逐项行展示实测结果 + 预填 + `needsHuman` 旗标 |
| `src/client/board-mount.ts` | 删除 `missingOpinion` 前端拦截 |
| `src/client/styles/board.ts` | 扩展结果行/旗标样式（复用既有类） |
| `src/client/views/verification.ts`、`views/panels/docs.ts` | 来源三态与 `result` 展示对齐 |
| `src/domain/workflow/VerificationDoc.ts` | 「实际结果」列改用 `result`（回落到 `opinion` 时标注） |
| `docs/architecture/acceptance-sheet.md`、`project-manual.md` | 更正过期口径、补机制备忘 |

**删除**

- 无删除符号。被移除的只是行为：`AcceptSheet.resultOf` 里的 `it.evidence[0]` 兜底（回滚开关开启时恢复）、
  `board-mount` 的前端必填拦截。

## 二、批次与依赖 <!-- serves: FR-1, FR-2, FR-6 -->

依赖安全序（禁止前向引用）：

| 批 | 卡 | 依赖 | 说明 |
|---|---|---|---|
| 1 | t1 结果匹配纯函数与体检 | — | 接口先行的契约卡，其余卡都以它为单点 |
| 2 | t2 提交侧硬门与落结果、t3 裁决口径与底线 | t1 | 一条写路径、一条读/裁路径，互不重叠文件 |
| 3 | t4 HTTP 裁决口径、t6 迁移与兼容、t7 知识与说明书 | t2 / t3 | t6 需两条路径都已就位 |
| 4 | t5 看板与详情页两屏 | t4 | 依赖服务端裁决形状稳定后定稿界面 |

## 三、任务表 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| key | 标题 | phase / side | 依赖 | 原型锚点 | 关联 D-x |
|---|---|---|---|---|---|
| t1 | 建结果匹配纯函数与体检（接口先行） | implement / backend | — | — | D-2, D-4, D-7 |
| t2 | 提交侧：results 参数 + 逐项交代硬门 + 落结果 | implement / backend | t1 | — | D-3, D-4, D-7 |
| t3 | 裁决口径与底线：零输入通过 / unverified / 放行判据 | implement / backend | t1 | — | D-1, D-5 |
| t4 | HTTP 逐项裁决口径放宽与来源写入 | implement / backend | t3 | — | D-5 |
| t5 | 看板逐项行与详情页核验表（预填 + 旗标） | ui / frontend | t4 | `prototypes/verification-result.html#FR-3`、`#FR-4`、`#FR-5` | D-5, D-6 |
| t6 | 迁移与兼容：老写法、回滚开关、存量单据 | implement / backend | t2, t3 | — | D-4 |
| t7 | 更正过期口径并补机制备忘 | doc / doc | t3 | — | D-1, D-5 |

### 卡片明细

**t1 · 建结果匹配纯函数与体检（接口先行）**

- 做什么：新建 `ResultBinding.ts`，导出 `ResultRefInput` / `ResultMatchReport` / `isForeseeableItem` /
  `matchStructuredResults` / `applyStructuredResults`。口径逐字照 `design/interfaces.md`。
- 怎么做：先是纯函数、零 IO、不读环境变量（回滚开关由调用方读后传参）；匹配按 `ref` 与
  `VerificationItemSource` 相等判定；不匹配/漏项/重复/空值分别归入 `unmatched` / `missing` /
  `duplicate` / `invalid`。
- 怎么算完：`npx vitest run tests/result-binding.test.ts` 退出码 0；用例断言四类体检各自命中，
  且 `applyStructuredResults` 后 `result` 非空、`resultSource==='agent'`。

**t2 · 提交侧：results 参数 + 逐项交代硬门 + 落结果**

- 做什么：schema 顶层加 `results`；`SubmitVerification` 读 `results` → 算可预见项集合（同一批
  `liveTargetTasks` 的顶层父卡 + 需求级 + 对照项）→ `matchStructuredResults` → 非空即拒（点名到 ref）→
  `applyStructuredResults`；返回体加 `results_bound` / `results_unmatched` / `results_coverage`。
- 怎么做：硬门放在既有文档门与对照项门之后、`buildSheet` 之前；校验全部在 `mutate` 之前，
  拒绝时台账零变更；提示词补一句「逐项交结果，缺项会被拒」。
- 怎么算完：`npx vitest run tests/accept-sheet-tool.test.ts`；带 `results` 提交后每个可预见项
  `result` 非空且 `resultSource==='agent'`；少给一项 → `REQBOARD_RESULT_COVERAGE_MISSING` 且台账 revision 不变。

**t3 · 裁决口径与底线**

- 做什么：`resultOf` 顺序固定为 第 2 问 → 第 1 问 → `item.result`（去掉 `evidence[0]` 兜底）；
  `finalizeIfAllPassed` 放行判据加 `unverified`；`applyVerdicts` 的 `passed` 校验放宽为
  「`opinion` 或 `result` 非空」，两者皆空记 `unverified`；返回体加 `unverified`。
- 怎么做：`verdicts.ts` 裁决时若 `opinion` 非空且 ≠ `item.result` → 写 `result = opinion`、
  `resultSource='human'`；`failed` / `not_verifiable` / 系统项处置的必填规则不动。
- 怎么算完：`npx vitest run tests/accept-sheet-zero-input.test.ts`；有结果的项只收 1 问、零输入记
  `passed` 且 `opinion===result`；无结果项零输入记 `unverified` 且不触发归档确认。

**t4 · HTTP 逐项裁决口径放宽与来源写入**

- 做什么：`http/routers/verdicts.ts` 去掉「`passed` 且空 `opinion` → 400」的预校验，交由
  `applyVerdicts` 统一判定；响应形状不变。
- 怎么做：沿用既有「任务先、需求后」写入顺序，不新增字段。
- 怎么算完：`npx vitest run tests/verdicts-http.test.ts`；空 `opinion` 通过 → 200 且该项
  `status==='passed'`、`opinion===result`；无 `result` 且空 `opinion` → `unverified`（不是 400）。

**t5 · 看板逐项行与详情页核验表**

- 做什么：`renderVerificationSheet` 增加「实际结果（agent 实测 / 人工填写）」行、输入框预填
  `item.result`、`needsHuman` 旗标（复用 `.dsh-pm-flag.verify-pending`）、`data-result-src` 属性；
  删除 `board-mount` 的 `missingOpinion` 拦截；样式只扩展不另起体系。
- 怎么做：判据照 `design/frontend.md`；原型锚点 `#FR-3` / `#FR-4` / `#FR-5` 逐屏对照，差异要写明。
- 怎么算完：`pnpm build:client` 打印 `[verify-client] OK`；字符串断言逐项行含 `data-result-src`
  且预填值等于台账 `result`；留空点通过不再被前端拦（附实测截图）；`needsHuman` 行使用既有旗标类。

**t6 · 迁移与兼容**

- 做什么：明确回滚开关语义（关闭 = 不结构化绑定 + 恢复 `evidence[0]` 兜底）；老写法
  `evidence` 里 `id :: 结果` 未命中的键进 `results_unmatched`；不带 `results` 的提交
  `results_coverage==='legacy'`；存量在册验收单不回写。
- 怎么做：开关读取点单点（`itemResultBindingEnabled`），用例两种口径同时断言，防悄悄失效。
- 怎么算完：`npx vitest run tests/verify-item-result.test.ts`；三组断言（老写法成功且 coverage=legacy、
  开关开启后语义回旧、存量 sheet 前后快照相等）。

**t7 · 更正过期口径并补机制备忘**

- 做什么：更正 `docs/architecture/acceptance-sheet.md` 里「两条裁决通道通过也必须填实际结果」的过期口径
  （与 D-5 冲突）；在 `docs/architecture/project-manual.md` 补一节机制备忘：硬门范围、底线语义、
  回滚开关、台账零新增。
- 怎么做：只改这两份文档，不碰知识层生成物。
- 怎么算完：`grep -n "通过也必须填实际结果" docs/architecture/acceptance-sheet.md` 无命中；
  `pnpm kb:check` 退出码 0。

## 四、容量纪律 <!-- serves: FR-1, FR-2 -->

- 口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量缺省 16 DU（单点在 `src/domain/limits.ts`）。
- 本次各卡声明（随任务表提交）：t1 ≈ 7.5、t2 ≈ 10、t3 ≈ 11.5、t4 ≈ 6.25、t5 ≈ 12.5、t6 ≈ 9.75、t7 ≈ 5。
- 结论：**无超容量卡**，计划文档不需要 `⚠️超容量(建议N批)` 标记。

## 五、边界校验 <!-- serves: FR-1, FR-8 -->

- 每张卡都能被零会话历史的窗口独立开工：卡内写清改哪些文件、怎么验证。
- 本阶段不二次创作设计；与设计矛盾时退回设计改计划并重新批准。
- 不做的事（照需求边界）：不造命令执行引擎、不允许 agent 自判通过、系统项不逐项交代、
  不改任务卡验收标准的生成规则、不重写存量验收单。
