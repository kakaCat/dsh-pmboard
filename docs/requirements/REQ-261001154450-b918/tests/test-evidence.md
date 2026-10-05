# 测试证据 · 收尾门硬化（REQ-261001154450-b918 · serves: FR-1…FR-8）

> **TL;DR**：新增 **41 条**用例，全部打在真实模块上；全仓失败数与类型错误**与开工前逐字一致**（106 / 212），
> 即"零新增失败"，不是"全绿"（本仓存在大量既有失败，口径见 C-14/C-15）。

## 一、用例清单

| 测试文件 | 条数 | 锁什么 | 对应 FR |
|---|---|---|---|
| `tests/domain/req-b918-gates.test.ts` | 14 | 未复核第三态 / 系统项处置点名 / 节流剩余毫秒 / 收尾闭环判定 / 系统项整批拒绝 | FR-1, FR-2, FR-4, FR-5, FR-6 |
| `tests/accept-sheet-tool.test.ts` | 9（含改写） | 每题两问裁决、通过无结果记 unverified（不再写占位文案） | FR-1 |
| `tests/domain/verification-doc.test.ts` | 10 | 验收文档含未复核状态标签、旧两态不受影响 | FR-1 |
| `tests/pm-question-badge.test.ts` | 7 | 两个弹框问题 header 均带 PM 标志 | FR-1 |
| `tests/pending-confirm-ttl.test.ts` | 5 | 挂起有效期 30 分钟 / 过期即放行 / 中止重计时 / 跨窗口不计 | FR-5 |
| `tests/plan-refs.test.ts` | 4 | 覆盖表解析成 计划键→FR；缺引用的卡被点名；齐备放行 | FR-7 |
| `tests/auto-advance-note.test.ts` | 4 | 未投递明说原因 + 续跑入口；已投递带 run id；老形状不误报 | FR-3 |
| `tests/done-throttle-message.test.ts` | 3 | 文案含「还需等待约 N 秒」+ 合规路径 + 子卡豁免说明 | FR-4 |
| `tests/domain/done-evidence.test.ts`（改写断言） | 8 | 节流判定与文案同步到新契约 | FR-4 |
| `tests/closing-gap.test.ts` | 5 | closing_gap 投影：已归档未交材料 = 未闭环；进行中不误报 | FR-6 |
| `tests/e2e-b918-drill.test.ts` | 6 | 端到端六步（引用/投递/未复核/系统项/闭环/闭环消失） | FR-1…FR-7 |

## 二、可复核命令

```
npx vitest run tests/domain/req-b918-gates.test.ts          → 14 passed
npx vitest run tests/pending-confirm-ttl.test.ts            → 5 passed
npx vitest run tests/plan-refs.test.ts                      → 4 passed
npx vitest run tests/auto-advance-note.test.ts              → 4 passed
npx vitest run tests/closing-gap.test.ts                    → 5 passed
npx vitest run tests/e2e-b918-drill.test.ts                 → 6 passed
npx tsx scripts/kb-probe.mts                                → 11 项全过（含新增 K11）
pnpm run build:client                                       → [verify-client] OK
```

## 三、基线与回归

| 面 | 开工前 | 完工时 | 判读 |
|---|---|---|---|
| `pnpm test` 失败 / 通过 | 106 / 2807 | **106 / 2848** | 零新增失败，+41 为本需求用例 |
| `npx tsc --noEmit` 错误数 | 212 | **212** | 零新增类型错误 |
| `pnpm run kb:check` | 10 项 | **11 项** | 新增 K11 |

## 四、任务覆盖标注（covers · 门禁可解析）

- `tests/domain/req-b918-gates.test.ts` — covers: t-55cb09, t-ac0851, t-8d6b60, t-0b6023, t-079ce6
- `tests/accept-sheet-tool.test.ts` — covers: t-bebc07, t-8511d0, t-e4b1e9, t-ef2c27, t-2a8717
- `tests/pending-confirm-ttl.test.ts` — covers: t-dc9156, t-fa5f52, t-a8d8e6, t-715fd3, t-be3d40
- `tests/plan-refs.test.ts` — covers: t-e775c7, t-f1a3ea, t-d56787, t-151af0, t-cd1a8b
- `tests/auto-advance-note.test.ts` — covers: t-3e89d1, t-5967fd, t-c7e355, t-79bd72, t-d92f6a
- `tests/done-throttle-message.test.ts` — covers: t-bfd9bb, t-4ca7a3, t-99aeea, t-d09794, t-4deef0
- `tests/closing-gap.test.ts` — covers: t-2c1163, t-74a312, t-17f847, t-73bd6c, t-be19ff
- `scripts/kb-probe.mts` — covers: t-243098, t-bcea2d, t-64e2b2, t-b88eda, t-0e8126
- `docs/requirements/REQ-261001154450-b918/evidence/t9-compat-regression.txt` — covers: t-3566b3, t-75877b, t-6727b8, t-dfcaca
- `tests/e2e-b918-drill.test.ts` — covers: t-fb9711, t-4d80e3, t-171024, t-5b8576

## 五、未覆盖（诚实标注）

- **两次批准仅一次投递**的端到端用例：需装配假 jobs 的集成夹具，本轮未做。
- **真实批准→投递→run 落地**的后台往返：需活会话与后台任务端口，不可确定性复现，故不写进演练，也不声称已验。
- 节流的**完整触发矩阵**只验到"子卡连关不触发 + 非子卡会触发"两点（实测），未穷举。
