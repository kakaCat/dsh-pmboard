# 设计：测试策略与用例（REQ-261005200052-ce40）

> 面：跑什么命令、看到什么算过；含**逆验证**（证明真门没被放宽）。

## 判据与命令 <!-- serves: FR-6 -->

规范条目（`reqboard_kb(kind='standard')`）：

| 条目 | 命令 | 期望 |
|---|---|---|
| C-15 改了源码必须跑类型检查 | `npx tsc --noEmit -p tsconfig.json` | 退出码 0 |
| C-14 提交前必须跑测试并与基线比对 | `pnpm test` | 与基线比对**零新增失败** |
| C-13 改了知识层内容必须重生成并自检 | `pnpm kb:check` | 退出码 0（本次若动知识层条目则必跑） |

本需求的定向判据：

```bash
npx vitest run tests/pending-guard.test.ts \
               tests/prototype-registration-no-pin.test.ts \
               tests/ask-confirm-pending.test.ts \
               tests/confirm-pending-guard.test.ts \
               tests/submit-prototype.test.ts
```

> C-11 / C-12（构建）**本次不适用**：改动只落在 host 侧源码，不涉及 `src/client/**`；若最终决定随发版，
> 另按 C-11 跑 `pnpm build`。

## 用例清单 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| # | 用例（可执行锚点） | 断言 | 承 FR |
|---|---|---|---|
| T1 | 真 fs + 真工具壳：登记原型后立即调 `reqboard_submit(kind=requirement)` | 不抛 `REQBOARD_CONFIRM_PENDING`；`pending_confirms` 为空 | FR-1 |
| T2 | 同上，宽限 2 秒后再取 `reqboard_status.pending_confirms` | 仍为空（不留下票） | FR-1 |
| T3 | 构造 kind=prototype 的票 → `assertNoPendingConfirm` | 不抛（放行） | FR-2 |
| T4 | 构造 kind=verification 且台账有产物的票 → `assertNoPendingConfirm` | 抛 `REQBOARD_CONFIRM_PENDING` | FR-2 / FR-6 |
| T5 | 构造 target=plan 且 `plan` 在册的票 → 同上 | 抛 | FR-2 |
| T6 | 构造 kind=requirement 但台账**无**产物的票 → 同上 | 不抛；随后登记产物 → 同一票**恢复拦截** | FR-2 |
| T7 | `pendingConfirmRejectMessage`（prototype 票 / 无产物票） | 不含「看板点确认」；含「先登记产物」 | FR-3 |
| T8 | 同文案（verification 票） | 含「看板点确认」；含失效时刻 | FR-3 |
| T9 | `artifactNotifyText` 对 kind=prototype | 不含「一键确认」；含「无需人工确认」 | FR-4 |
| T10 | 无产物需求上调 `ask_confirm(kind=requirement)` | 抛 `REQBOARD_MISSING_ARTIFACT`，且**未登记票** | FR-5 |
| T11 | 无计划需求上调 `ask_confirm(target=plan)` | 抛 `REQBOARD_MISSING_PLAN`，且未登记票 | FR-5 |

诊断探针 `tests/_probe-prototype-pin.test.ts`（本轮实测已有）**转正为**
`tests/prototype-registration-no-pin.test.ts`：保留"登记 → 2.4 秒 → 取票"的真实时序，
断言从"票存在且被拦"翻转为"票为空且可写"。

## 逆验证（必须真跑、必红才算数） <!-- serves: FR-2, FR-6 -->

| # | 把实现改坏成什么 | 哪条用例必须红 |
|---|---|---|
| N1 | 谓词④ 恒返回 true（退回"有票就拦"） | T1 / T2 / T3 |
| N2 | 谓词④ 恒返回 false（连真门也放行） | T4 / T5 |
| N3 | 谓词⑤ 改成"读不到产物就放行"（吞掉台账异常） | T4（真门票被误放行） |
| N4 | 文案改为固定三条出路（不看门） | T7 |
| N5 | `artifactNotifyText` 恢复无条件「一键确认」 | T9 |
| N6 | 删掉登记前的校验（产物缺失仍登记票） | T10 / T11 |

逆验证跑完后必须逐字节还原被测文件（用副本或 `git diff` 核对）。

## 回归与基线 <!-- serves: FR-6 -->

- 全量 `pnpm test`：与改动前基线逐文件比对，**零新增失败**；失败数变化必须逐条解释。
- 既有真门用例（`tests/ask-confirm-pending.test.ts`、`tests/confirm-pending-guard.test.ts`、
  `tests/submit-prototype.test.ts`）**不得改动断言**；若必须改，说明本次动了协议（视为设计缺陷，退回设计）。
- `npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40`：本次改动不得新增缺口项。
