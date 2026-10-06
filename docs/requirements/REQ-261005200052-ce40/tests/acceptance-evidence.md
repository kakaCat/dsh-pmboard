# 测试证据（REQ-261005200052-ce40）

## 判据命令与真实输出
covers: t-97e904, t-028d50, t-1c8e8d, t-78a4c9

```bash
npx vitest run tests/prototype-registration-no-pin.test.ts
```
```
 ✓ tests/prototype-registration-no-pin.test.ts  (2 tests) 2431ms
      Tests  2 passed (2)
```

```bash
npx vitest run tests/pending-guard.test.ts tests/pending-guard-integration.test.ts \
               tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts \
               tests/status-pending-confirm.test.ts
```
```
 ✓ tests/pending-guard.test.ts              (20 tests)
 ✓ tests/pending-guard-integration.test.ts   (8 tests)
 ✓ tests/status-pending-confirm.test.ts      (4 tests)
 ✓ tests/submit-prototype.test.ts           (20 tests)
 ✓ tests/ask-confirm-pending.test.ts        (13 tests)
      Tests  65 passed (65)
```

```bash
npx tsc --noEmit -p tsconfig.json      # exit=0 行数=0
npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40   # 缺口 0；exit 0
```

## 守卫判据（无门 / 无产物 / 真门）
covers: t-97e904

- 无门的票（kind=prototype）→ 放行；有门且产物在册未落章 → 仍拦；有门但无产物 → 放行；
  产物登记后同一张票恢复拦截；`target=plan` 无计划放行 / 有计划仍拦。共 5 例（`tests/pending-guard.test.ts`）。
- 端到端复现链（真 fs + 真工具壳）：`tests/prototype-registration-no-pin.test.ts` 2 例。

## 登记侧（不发票 / 不造空票）
covers: t-028d50

- `reqboard_submit(kind=prototype)` 后 `pendingForWindow` 为空、`assertNoPendingConfirm` 放行（1 例）。
- 无产物 / 无计划时 ask_confirm 在登记票之前拒（`REQBOARD_MISSING_ARTIFACT` / `REQBOARD_MISSING_PLAN`），票表保持为空（2 例）。
- 既有成功路径回归：`submit-prototype` 20 例、`ask-confirm-pending` 13 例全绿。

## 文案与投影（四点同源）
covers: t-1c8e8d

- 拒绝原文：无门票/无产物票不含「看板点确认」；真门票含看板出路与失效时刻；归档需求不列「重新发起覆盖」（4 例）。
- 登记通知：`kind=prototype` 不含「一键确认」、含「无需人工确认」；`kind=requirement` 仍写确认入口（1 例）。
- status 投影：`pending_confirms[]` 五键在场、旧键逐字未变（`tests/pending-guard-integration.test.ts` 1 例）。
- 回执：未确认时追加可用出路（集成用例 2 处前缀精确断言 + 后缀同源计算）。

## 逆验证矩阵（改坏即红，跑完逐字节还原）
covers: t-78a4c9

| # | 改坏点 | 必红条数 | 还原 |
|---|---|---|---|
| N1 | 谓词④ 恒 true | 1 | md5 一致 |
| N2 | 谓词④ 恒 false | 3 | md5 一致 |
| N3 | 谓词⑤ 恒 false | 5 | md5 一致 |
| N4 | 文案固定三条出路 | 3 | md5 一致 |
| N5 | 通知无条件写确认入口 | 1 | md5 一致 |
| N6 | 删前移校验 | 2 | md5 一致 |

## 全量回归与失败口径
covers: t-78a4c9

```
 Test Files  37 failed | 448 passed | 3 skipped (488)
      Tests  68 failed | 5610 passed | 22 skipped (5700)
```

本工作树同时含其他需求的未提交改动，拿不到干净基线；故以**两次全量跑做集合差**：上一轮 70 failed →
本轮 68 failed，**无新增**，消失的两条正是本次修复项。其余 68 条逐类核对与本次四条表面无交集
（REQ id 格式漂移 / 缺 `@deepseek-ai/dsh-session` 依赖 / 他工具缺 `RESPONSE_SOURCES` /
对他处重构的源码文本断言 / `task_status` 多出 `run` 键等）。

## 子卡覆盖（每条子卡的证据与父卡同源，逐条对应）
covers: t-de0547, t-5dea99, t-2edc3a, t-c5c71f, t-ff1ca2, t-4a5cd4, t-7bd329, t-488288, t-fddda0

- t-de0547（守卫研发）：`tests/pending-guard.test.ts` 的 5 例新判据 + N1/N2 逆验证。
- t-5dea99（守卫复核）：判定序对照设计逐条核对 + 真门不放宽 + 逐字节还原记录。
- t-2edc3a（登记侧研发）：`tests/submit-prototype.test.ts` 的 FR-1 用例 + `tests/ask-confirm-pending.test.ts` 的 2 例。
- t-c5c71f（登记侧复核）：N6 逆验证必红 + 成功路径回归（相邻四套件 35 例）。
- t-ff1ca2（文案研发）：4 例文案断言 + 通知门感知 1 例 + status 五键 1 例。
- t-4a5cd4（文案复核）：4 处消费同源 grep 证据 + 旧键未变 + N4/N5 必红。
- t-7bd329（探针转正研发）：`tests/prototype-registration-no-pin.test.ts` 2 例 + 六条逆验证矩阵。
- t-488288（转正复核）：逆验证还原与全量差集核对。
- t-fddda0（测试段）：五条验收命令复跑（2 例 / 65 例 / tsc 0 / 缺口 0 / 全量差集）。
