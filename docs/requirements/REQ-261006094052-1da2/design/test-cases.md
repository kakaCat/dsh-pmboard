# 测试用例设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 关注点：**每条判据（A1–A4）都有可执行锚点**。三层：单测（新增文件）· 既有用例口径对齐（改一条期望）·
> 全量回归（对基线）。
> 契约源：`design/interfaces.md`（I-1…I-6）与 `requirement.md` 的判据 A1–A4。

## 命令与期望 <!-- serves: FR-4 -->

| 层 | 命令 | 期望 |
|---|---|---|
| 类型 | `pnpm typecheck` | 退出码 0；错误数不高于 HEAD 基线（`npx tsc --noEmit` 先取数） |
| 新增用例 | `npx vitest run tests/confirm-advance-deadlock.test.ts` | 全绿 |
| 口径对齐 | `npx vitest run tests/design-gate-messages.test.ts` | 全绿（含被修正的 TC-4 第 2 例） |
| 相关面回归 | `npx vitest run tests/output-contract.test.ts tests/submit-prototype.test.ts tests/prototype-registration-no-pin.test.ts tests/confirm-settle-plan-persist.test.ts tests/auto-chain-approval.test.ts` | 失败数不高于基线 |
| 全量 | `pnpm test` | 失败数 ≤ 基线 **70 条用例 / 39 个文件**（`.dsh-data/baseline-test.txt`），本次新增用例全绿 |

## 新增用例（`tests/confirm-advance-deadlock.test.ts`） <!-- serves: FR-1, FR-2, FR-3 -->

| 用例 | 判据 | 标本 | 断言（看到什么算过） |
|---|---|---|---|
| TC-1 已落章 + 闸门全过 ⇒ 真推进 | A1 / FR-1 | 需求 `brainstorming`，`kind=requirement` 产物已落章，requirement.md 有「讨论与裁定记录（D-x）」节（裁定门过）、`sides: [backend]`（原型门不适用） | 返回 `confirmed:true` / `advanced:true` / `from:'brainstorming'` / `to:'design'`；`store.get(id).status === 'design'`；评论含 `[自动推进] brainstorming → design` |
| TC-2 闸门不过 ⇒ 不推进、如实回报 | A2 / FR-2 | 同 TC-1，但 requirement.md **删掉** D-x 节（裁定门不过） | 返回 `confirmed:true` / `advanced:false` / `gate_failure.code === 'decision_log_missing'`；`status` 仍 `brainstorming`；note 含「未重复弹框」与「未推进」 |
| TC-3 无对象可推进（advanceTo 为空） | FR-2 | 需求 `accepting`（`advanceTargetFor` 无目标）+ 产物已落章 | `advanced:false`、**无** `gate_failure`、note 前缀为「已确认，未重复弹框」；`status` 不变 |
| TC-4 `advance:false` 时不推进 | FR-1 | 同 TC-1，入参 `advance:false` | `advanced:false`；`status === 'brainstorming'` |
| TC-5 UI 需求首轮自动确认不弹框 | A3 / FR-3 | feature · `sides: [frontend]` · 无 prototype 产物 | `triggerAutoConfirm(...)` 返回 `{triggered:false}`，`reason` 含原型目录路径与 `reqboard_submit(kind=prototype)`；**未**登记挂起票 |
| TC-6 原型登记后重发 ⇒ 推进 | A3 / FR-1 | 在 TC-5 之后登记 prototype 产物（`stage=brainstorming, kind=prototype`）并把 INDEX 写成恰好一条 `authoritative` | `ask_confirm(kind=requirement)` 返回 `advanced:true` 且 `status === 'design'`（死锁链在原型补齐后闭合） |
| TC-7 非 UI 需求首轮自动确认照弹 | FR-3 | `sides: [backend]` | `triggerAutoConfirm(...)` 返回 `{triggered:true}`（窄口径不越界） |

**断言口径（两条纪律）**

- 状态断言一律**读回台账**（`store.get(id).status`），不只看返回体——本缺陷的形态正是「返回体说 confirmed、
  台账没动」，只看返回体的用例抓不到它。
- 门禁不过的用例断言 `gate_failure.code` **具体值**，不断言「有 gate_failure 就行」（否则任何门都能冒充）。

## 既有用例的口径修正（1 条） <!-- serves: FR-1, FR-2 -->

| 文件 · 用例 | 现状 | 改法 | 依据 |
|---|---|---|---|
| `tests/design-gate-messages.test.ts` · 「全部落章且磁盘无新增 → 早返回不带 gate_failure（不制造噪声）」 | 断言 `advanced === false`——它把**缺陷行为**（闸门通过也不推进）锁成了正确行为 | `advanced` 改为 `true`，并补一条 `status` 已前进的断言；该用例的**本来目的**（不带 `gate_failure`、note 不含「未登记」）两条断言**逐字保留** | A1；D-2 |

> 记一条纪律：改既有期望必须能说清「原期望为什么是错的」。此例原期望是早退分支「只报缺口」时代的产物
> （REQ-261005105032-3b02 §10 #46 加了缺口回报但没加推进），本次把推进补上后它自然过期。

## 反向验证（改坏必须红） <!-- serves: FR-4 -->

| 人为改坏 | 期望 |
|---|---|
| 早退分支调 `applyConfirmedAdvance` 后**丢弃** `advanced`（仍 return false） | TC-1 红（`advanced:false`） |
| 单点里删掉 `transitionRequirement` 只写评论 | TC-1 红（`status` 仍 `brainstorming`） |
| `triggerAutoConfirm` 的早退删掉 | TC-5 红（`triggered:true`） |
| 单点把「闸门不过」也当推进（忽略调用方的门） | TC-2 红（`status` 被推进） |

## 回归面（为什么是这几个文件） <!-- serves: FR-4 -->

- `tests/output-contract.test.ts`：`auto_confirm` 变成 `Promise` 后**最容易**在这里被 output 校验拒收
  （本仓已因同类漂移把两次成功调用变成 `invalid output`）。
- `tests/submit-prototype.test.ts` / `tests/prototype-registration-no-pin.test.ts`：`kind=prototype` 的
  `auto_confirm` 形状与外发文案被这两条锁死，窄口径预判**不得**波及它们（UC-4）。
- `tests/confirm-settle-plan-persist.test.ts` / `tests/auto-chain-approval.test.ts`：`applyConfirmDecision`
  的主路径（落章 → 门合并 → 落库 → 开跑）被这两条锁死，抽单点后必须逐字不变。
