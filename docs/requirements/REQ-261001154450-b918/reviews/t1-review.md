# t1 复核 · 门规纯函数与状态契约（REQ-261001154450-b918 · serves: FR-1, FR-2, FR-5, FR-6）

> **TL;DR**：四组判据（未复核态 / 系统项处置 / 节流剩余 / 收尾闭环）逐条对照设计与实测，**无偏离**；
> 14 条用例全绿、改动文件类型检查干净、全仓失败数与开工前一致（106）。
> 本文件是子卡 `t-0b6023(复核)` 的复核结论，供人在看板裁决时对照。

## 一、判据对照（设计 vs 实现）

| 判据 | 设计（design/architecture.md） | 实现 | 结论 |
|---|---|---|---|
| 未复核第三态 | 通过但拿不到实际结果 → `unverified`，**不计入通过** | `isUnverifiedItem` / `unverifiedItemsOf` / `sheetGateStatus` | 无偏离 |
| 系统项必处置 | `gapKind` 或旧类前缀项通过时必须写处置 | `isSystemItem` / `dispositionMissingItems` | 无偏离 |
| 节流可预期 | 能算出"还要等多久"供文案引用 | `doneThrottleRemainingMs`（纯函数，零 I/O） | 无偏离 |
| 收尾闭环 | `archived` 且材料未交 → `archive_missing` | `closingGapOf` / `isClosed`（认 `archive` 记录与 `artifacts` 两个信号） | 无偏离 |
| 挂起有效期 | 具名常量 30 分钟，与 capture 拒绝同口径 | `LIMITS.pendingConfirmTtlMs` | 无偏离 |

## 二、边界与兼容复核

| 面 | 复核动作 | 结论 |
|---|---|---|
| 旧台账 | `unverified` 是联合类型新增成员，旧两态读取路径未改 | 不破坏 |
| 未归档需求 | `closingGapOf` 对非 archived 一律返回 undefined | 不误报 |
| 他人/别需求关闭的卡 | `doneThrottleRemainingMs` 三种非命中情形均返回 0 | 不误伤 |
| 层边界 | 新增代码全部在 domain，零 I/O、零 `Date.now()` | 符合 C-01 |

## 三、可复核命令

```
npx vitest run tests/domain/req-b918-gates.test.ts   → 14 passed
npx tsc --noEmit -p tsconfig.json | grep Predictates  → 无输出（干净）
pnpm test                                             → 106 failed（= 开工前基线）/ 2848 passed
```

## 四、遗留

- 本卡只落**判定函数**，调用方接线分别由 t2（验收收口）、t3（挂起 TTL）、t6（节流文案）、t7（闭环可见）承载。
- 无偏离项，未产生返工卡。
