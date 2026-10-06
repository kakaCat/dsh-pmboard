# 测试策略与判据映射 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 每条判据都必须**可跑、可失败**。空话判据（"符合预期"）一律不算。

## 用例落点（新增 / 改动） <!-- serves: FR-1, FR-2 -->

| 文件 | 覆盖 | 说明 |
|---|---|---|
| `tests/result-binding.test.ts`（新） | A1 / A2 / A3 / A4 / A6 | `matchStructuredResults` / `applyStructuredResults` 纯函数级：绑定、漏项、坏 ref、重复、needsHuman |
| `tests/accept-sheet-tool.test.ts`（改） | A2 / A5 | 弹框问数（有结果只收 1 问）、零输入通过记 passed、无结果记 unverified |
| `tests/apply-wiring.test.ts`（改） | A2 | 工具名与参数面不变（新增 `results` 不改变既有断言集合） |
| `tests/verdicts-http.test.ts`（新，或在既有 verdicts 用例内加） | A2 / A5 | HTTP 逐项裁决：空 opinion 通过 → passed（取 result）；两者皆空 → unverified |
| `tests/verify-item-result.test.ts`（改） | A7 | 契约三处同步锁保留；老写法与回滚开关语义 |
| `tests/design-gate-messages.test.ts`（不改） | 回归 | 确认门/文档门的既有文案与行为不受影响 |

## 判据 → 用例映射 <!-- serves: FR-2, FR-6 -->

| 判据（requirement.md） | 跑什么 | 看到什么算过 |
|---|---|---|
| A1 逐项落章 | `npx vitest run tests/result-binding.test.ts` | 每个可预见项都有 `result` 且 `resultSource==='agent'` |
| A2 人零输入 | `npx vitest run tests/accept-sheet-tool.test.ts` + verdicts 用例 | 有结果的项只收 1 问；不填文本也能记 `passed`，`opinion===result` |
| A3 漏项被拒 | 同上（硬门用例） | 错误码 `REQBOARD_RESULT_COVERAGE_MISSING` 且点名清单含缺失 ref；台账未变更 |
| A4 例外显式 | 同上 | `needsHuman===true` 且 `humanReason` 非空；弹框第 2 问题干含理由 |
| A5 反例仍拦 | accept-sheet + verdicts 用例 | 记 `unverified`；「全部通过 → 归档」不触发；`reqboard_move(to=archived)` 被拒 |
| A6 响亮 | 同上 | 坏 ref / 重复 ref / 空结果分别返回对应错误码并指名到项 |
| A7 兼容回滚 | `npx vitest run tests/verify-item-result.test.ts` | 不带 `results` 提交成功（`results_coverage==='legacy'`）；置 `DSH_REQBOARD_NO_ITEM_RESULT=1` 后语义回到旧口径 |
| A8 本仓门禁 | 见下节命令 | 全绿且不高于基线 |
| A9 原型 | `prototypes/INDEX.md` + 登记回执 | 锚点 FR-3/4/5 齐、恰好一条 authoritative（本阶段已完成） |

## 边界与反例（必须有用例） <!-- serves: FR-6 -->

1. **无结果项点通过** → `unverified`（不是 passed）。
2. **`pass` 但意见与 `result` 不同** → `resultSource==='human'` 且 `result` 更新为人的文本。
3. **系统项通过但未写处置** → 仍按既有规则拒绝（`system_item_disposition_required`），不被本次改动放宽。
4. **`needsHuman` 缺理由** → 拒绝（`REQBOARD_RESULT_EMPTY`），不许"标了但不解释"。
5. **老写法 `evidence` 里 `id :: 结果` 命中不到项** → 作为 `results_unmatched` 出现在返回体，不再静默。

## 门禁命令与基线（本仓规范 C-11 ~ C-15） <!-- serves: FR-1, FR-2, FR-4, FR-7 -->

| 时机 | 命令 | 期望 |
|---|---|---|
| 改动后 | `pnpm typecheck` | 退出码 0（改动文件零错误；`index.ts` 等历史错误另计，基线 223） |
| 提交前 | `pnpm test` | 失败数 **≤ 基线 106**，且新增用例全绿 |
| 发版前 | `pnpm build` | 退出码 0，`dist/` 有新产物 |
| 改了 client 后 | `pnpm build:client` | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |

## 人工验收证据（不可自动化部分） <!-- serves: FR-3, FR-4 -->

- 看板逐项行的**预填**与 `needsHuman` 旗标：附截图（含留空点通过不再被拦的现场）。
- 会话弹框问数：附实测截图（有结果的项只出现 1 问）。
- 依据：本仓既有纪律「验证是 agent 的活、人只做裁决」，界面视觉类判据只能人看（与
  `prototype-compare` 项的 `needsHuman` 同理）。

## E2E 策略 <!-- serves: FR-1, FR-4 -->

- 本需求**不新增浏览器 E2E 场景用例**。理由如实说明：改动集中在工具参数/绑定规则与面板渲染，
  端到端链路（提交 → 出单 → 裁决 → 归档）已由上述单测 + HTTP 用例逐段覆盖；界面部分以截图实测为证。
- 若实现中发现链路级缺口（如裁决后文档未回填），就地补一条链路用例，不推给人工验收。

## 判据自身纪律 <!-- serves: FR-2 -->

- 每条用例断言**具体字段或错误码**，不写"应当成功"。
- 拒绝路径用例必须同时断言**台账未变更**（防"报了错但写了一半"）。
- 兼容路径用例必须在**同一文件**里同时断言新旧两种口径，防止回滚开关悄悄失效。
