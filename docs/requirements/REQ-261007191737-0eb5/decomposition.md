# 拆分计划（REQ-261007191737-0eb5）

> 目标：把「人工项允许 agent 代写事实、人只做通过/退回裁决」落成 9 张可独立验收的卡。
> 做法：域层一处判据 + 一处写入（两条通道自动同口径）→ 看板放开误拦并显示来源 → FR-4 提交前就地补问 → 两套用例 + 一次构建回归。
> 依据：`requirement.md`（FR-1~FR-5）、`design/`（7 份）、契约基线（`humanFactForProxy` / `humanProxyEnabled` / `opinionSource` / `DSH_REQBOARD_NO_HUMAN_PROXY` / `humanFactRequestOf`）。

## 1. 变更盘点

**新增**

- `src/domain/workflow/AcceptanceSheetSpec.ts`：`humanFactForProxy`（IF-1）、`humanProxyEnabled`（IF-2）、`SheetItemLike.opinionSource`（IF-4）、`applyVerdicts` 第 ② 档取值与来源写入（IF-5）；
- `src/domain/workflow/VerdictNotices.ts`：`humanFactRequestOf`（IF-3）；
- `src/client/views/panels/verify.ts`：`data-proxy-candidate` 属性 + 来源徽标（IF-6/IF-7）；
- 测试：`tests/needs-human-proxy.test.ts`、`tests/board-needs-human-proxy.test.ts`。

**修改**

- `src/shared/protocol.ts`：`VerificationItem` 镜像 `opinionSource`（可选）；
- `src/application/use-cases/AcceptSheet.ts`：FR-4 就地补问（插在 `applyVerdicts` 之前）；
- `src/client/board-mount.ts`：`missingHuman` 守卫只对 non-candidate 行生效 + 提示升级；
- `src/domain/workflow/VerificationDoc.ts`：`opinionSource='agent'` 时渲染来源标注。

**删除**：无。

## 2. 任务表

| 计划 key | 标题 | phase | side | depends_on | 验收（可跑） | 工作量 |
|---|---|---|---|---|---|---|
| t1 | 契约与判据：字段 + humanFactForProxy + 回滚开关 | implement | backend | — | `pnpm typecheck` 退出码 0 且 `grep -cE "humanFactForProxy\|humanProxyEnabled\|opinionSource" src/domain/workflow/AcceptanceSheetSpec.ts` ≥ 3 | M |
| t2 | 域层代写取值与来源写入（applyVerdicts 第 ② 档） | implement | backend | t1 | `npx vitest run tests/accept-verdicts-snapshot.test.ts` 退出码 0（既有裁决零变化）+ `grep -c "humanFactForProxy" src/domain/workflow/AcceptanceSheetSpec.ts` ≥ 2 | M |
| t3 | FR-4 提交前就地补问 + 文案单点 | implement | backend | t2 | `npx vitest run tests/accept-sheet-tool.test.ts` 退出码 0；补问题干含 itemId 与样例（由 t7 断言） | M |
| t4 | verification.md 来源标注 | implement | backend | t1 | `npx vitest run tests/acceptance-criteria.test.ts` 退出码 0；代写行含「代写」字样（由 t7 断言） | S |
| t5 | 看板行渲染：候选属性 + 来源徽标 + 占位文案 | implement | frontend | t1 | `npx vitest run tests/board-needs-human-proxy.test.ts` 退出码 0；渲染 HTML 含 `data-proxy-candidate="1"` 与「agent 代写（人已确认）」 | M |
| t6 | 看板收集：放行候选行 + 提示升级 | implement | frontend | t5 | 同用例退出码 0；non-candidate 行留空被拦且提示含 itemId | S |
| t7 | 用例：域判据 + 弹框 + 开关 + 文档渲染（TC-1~TC-7、TC-10~TC-12） | test | backend | t2, t3 | `npx vitest run tests/needs-human-proxy.test.ts` 退出码 0（含负例：无事实文本/文本太薄/python… 均不放行） | M |
| t8 | 用例：看板渲染与收集（TC-8、TC-9） | test | frontend | t6 | `npx vitest run tests/board-needs-human-proxy.test.ts` 退出码 0 | S |
| t9 | 构建与整体回归（生效链） | merge | fullstack | t4, t7, t8 | `pnpm typecheck && pnpm build && pnpm build:client` 退出码 0；`grep -c opinionSource dist/index.mjs` ≥ 1、`grep -c data-proxy-candidate lib/client.js` ≥ 1；`pnpm baseline:check` 失败用例集合差为空 | M |

## 3. 接口清单 ↔ 接收卡 key 对照表

（设计 `interfaces.md` 的「接口清单」逐条核对；一对多合法）

| 接口 id | 接口 | 接收卡 key |
|---|---|---|
| IF-1 | `humanFactForProxy(item)` | t1、t2 |
| IF-2 | `humanProxyEnabled(env)` | t1 |
| IF-3 | `humanFactRequestOf(item)` | t3 |
| IF-4 | `SheetItem.opinionSource` 字段 | t1、t2 |
| IF-5 | `applyVerdicts` 第 ② 档取值与来源写入 | t2 |
| IF-6 | 看板 `data-proxy-candidate` 属性契约 | t5、t6 |
| IF-7 | 代写来源标注（`verification.md` / 看板行） | t4、t5 |
| IF-8 | `reqboard_accept_sheet` 入参零变更 | t1、t3 |

## 4. 组件树 ↔ 接收卡 key 对照表

（设计 `frontend.md`「组件树」的叶子逐条核对）

| 叶子组件 | 接收卡 key |
|---|---|
| 行 VerifyRow（含候选属性） | t5 |
| 来源徽标 ProxyBadge | t5 |
| 结论输入框 OpinionInput（占位文案） | t5 |
| 提示区 SheetNotice（点名 + 样例） | t6 |
| 提交按钮 SheetSubmit（收集与放行判定） | t6 |

## 5. 依赖与批次

- 批次 1（可并行）：t1（契约与判据打头）、t4 依赖 t1 后进批次 2。
- 批次 2：t2、t5（各自依赖 t1；两文件互不重叠，可并行）。
- 批次 3：t3（依赖 t2）、t6（依赖 t5）。
- 批次 4：t7（依赖 t2/t3）、t8（依赖 t6）。
- 批次 5：t9（依赖 t4/t7/t8，收口构建与全量回归）。
- 跨批不出现前向引用：所有 `depends_on` 只指本批或更早的 key。

## 6. 边界校验（不超范围）

- 不新增/修改 `reqboard_accept_sheet` 的工具入参（IF-8 就是这条的对照行）。
- 不改 `applyVerdicts` 的整批原子性、不改 `hasHumanFact` 词表、不改原型对照项生成条件（见 `design/backend.md` 的决策表）。
- 每张卡都能被零上下文窗口独立开工：实现卡自带 `implementation`（改哪些文件）与可跑 `acceptance`。
