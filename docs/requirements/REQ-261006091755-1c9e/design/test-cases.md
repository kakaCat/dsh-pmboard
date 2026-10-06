# 测试用例设计（REQ-261006091755-1c9e）

> 每条 = 「跑什么 / 看到什么算过」。任务级 `covers: t-*` 标注由实施阶段回填（任务在拆分阶段才存在）。
> 夹具沿用既有 `tests/plan-prototype-anchor-gate.test.ts` 的形态（假 docs + 假 req 直调 `assertClauseCoverageGate`）。

## 测试层级与命令 `serves: FR-1`

| 层级 | 位置 | 命令 | 判据来源 |
|---|---|---|---|
| 门禁行为（主） | `tests/plan-prototype-anchor-gate.test.ts`（扩展） | `npx vitest run tests/plan-prototype-anchor-gate.test.ts` | FR-1、FR-2、FR-3 |
| 转移路径回归 | `tests/move-gate-paths.test.ts`（既有） | `npx vitest run tests/move-gate-paths.test.ts` | FR-2 |
| 原型三门回归 | `tests/prototype-gates.test.ts`（既有） | `npx vitest run tests/prototype-gates.test.ts` | FR-2 |
| 适用性判据回归 | `tests/category-doc-sets.test.ts`（既有） | `npx vitest run tests/category-doc-sets.test.ts` | FR-1 |
| 交付底线（规范 C-15 / C-11 / C-14） | — | `pnpm typecheck`、`pnpm build`、`pnpm test` | 交付 |

## 夹具约定（实施时照抄既有文件） `serves: FR-1, FR-2, FR-3`

```
UI_REQ   = requirement.md：front-matter sides 含 frontend，两条根编号 FR-1 / FR-4
EXEMPT   = 在 UI_REQ 的 front-matter 里加 prototype_exempt: <非空理由>
REQ_OK   = reqWith({ artifacts: [{kind:'requirement', path, confirmedAt: 1}] })        ← 已落章
REQ_UNSEALED = reqWith()（artifacts 无 confirmedAt）                                     ← 未落章
REQ_WITH_PROTO = reqWith({ artifacts: [requirement(已落章), {kind:'prototype', path, confirmedAt: 1}] })
AUTO_DISCOVERED = reqWith({ artifacts: [requirement(已落章), {kind:'prototype', autoDiscovered: true}] })
CARD_BARE = uiCard()（side=frontend，无 prototypeRefs，覆盖 FR-1+FR-4 让维①先过）
CARD_ANCHORED = uiCard({ prototypeRefs: ['prototypes/detail.html#FR-4'] })
```

## 功能测试用例 `serves: FR-1, FR-2, FR-3`

| # | 输入 | 期望 | 覆盖 |
|---|---|---|---|
| TC-1 | `EXEMPT` + `REQ_OK` + `CARD_BARE`（无已登记原型） | `undefined`（放行） | FR-1 / UC-1 |
| TC-2 | `EXEMPT` + `AUTO_DISCOVERED` + `CARD_BARE`（目录有骨架但**未登记**） | `undefined`（判据是"已登记"，不是"有文件"） | FR-1 / UC-1 |
| TC-3 | `EXEMPT`（理由**空**）+ `REQ_OK` + `CARD_BARE` | 拒，`code='prototype_anchor_missing'` | FR-2 / UC-2 |
| TC-4 | `EXEMPT` + `REQ_UNSEALED`（理由非空但未落章）+ `CARD_BARE` | 拒（不许 agent 自己豁免自己） | FR-2 / UC-2 |
| TC-5 | 无 `prototype_exempt` 键 + `REQ_OK` + `CARD_BARE` | 拒（与改动前逐字一致：gaps 含卡 key 与补写位置） | FR-2 / UC-2 |
| TC-6 | `EXEMPT` + `REQ_WITH_PROTO` + `CARD_BARE` | **拒**且 gaps 点名该卡 | FR-3 / UC-3 |
| TC-7 | `EXEMPT` + `REQ_WITH_PROTO` + `CARD_ANCHORED`（权威路径） | `undefined`（放行） | FR-3 / UC-3 |
| TC-8 | 非 UI 需求（`sides:[backend]`）+ `CARD_BARE` | `undefined`（既有最早放行分支） | FR-1 / UC-4 |
| TC-9 | 存量需求（`artifacts` 空）+ `EXEMPT` + `CARD_BARE` | `undefined`（不追溯存量） | FR-1 / UC-4 |
| TC-10 | 源码锚点：读 `src/application/internal/content-gate-wiring.ts`，在 `assertUiCardPrototypeAnchors` 段内 | 命中 `prototypeExemptOf(` 与 `registeredPrototypesOf(`；**不**命中手写判据（如 `frontmatter['prototype_exempt']`） | FR-4 / UC-5 |

**计数**：新增 ≥10 条断言（并入既有 4 组之后；既有断言零改动）。

## 可证伪性（两条逆验证，实施时执行并复原） `serves: FR-1, FR-2, FR-3`

| 逆向改动 | 期望 | 理由 |
|---|---|---|
| 删掉新增的两行前置 | **TC-1 / TC-2 必红** | 证明跳过分支真的由这两行提供（不是碰巧放行） |
| 把条件放宽成"豁免即跳过"（去掉 `&& registeredPrototypesOf(req).length === 0`） | **TC-6 必红** | 证明 FR-3 的质量约束被用例锁住 |

复原后目标文件必须全绿；逆验证过程与红/绿计数写进 `tests/test-evidence.md`。

## 回归与基线 `serves: FR-2`

| 命令 | 判据 |
|---|---|
| `npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts` | 全绿 |
| `pnpm typecheck` | 退出码 0（规范 C-15） |
| `pnpm build`（host + client） | 退出码 0（规范 C-11） |
| `pnpm test` | 失败集合与改动前基线**逐文件一致**（规范 C-14；基线取改动前同一命令输出） |

## 判定标准 → 用例对照 `serves: FR-1`

| 条款 | 对应断言 |
|---|---|
| FR-1 | TC-1、TC-2、TC-8、TC-9 |
| FR-2 | TC-3、TC-4、TC-5、TC-10（源码锚点）+ 回归三项 |
| FR-3 | TC-6、TC-7 |
| FR-4 | TC-10 + 目标文件与四个回归文件全绿 |

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 验证形式 | 起服务跑端到端 | 直调 `assertClauseCoverageGate`（既有形态） | 三条入口共用该单点；直调覆盖等价路径且毫秒级 |
| 「无原型」用例 | 只测 `artifacts` 为空 | 加 `autoDiscovered: true` 的骨架用例（TC-2） | 真实现场里"目录有骨架、没人登记"是最容易误判的那一格 |
| 逆验证 | 只跑正向 | 两条逆向（删前置 / 放宽条件） | 正向绿灯不能证明分支被走到（本仓"假绿"教训） |

## 技术方案与亮点 `serves: FR-1`

- **四组合矩阵**：豁免(生效/未生效/未落章) × 已登记原型(0/≥1) 被 TC-1～TC-7 铺满，任一条缺省语义写反都有对应用例变红（可核验指向：`tests/plan-prototype-anchor-gate.test.ts` 新增 describe）。
