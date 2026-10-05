# REQ-260930231831-a8fa 测试证据（重复交付复核）

> 本需求**零代码改动**。以下是对**已交付实现**（REQ-261001201200-8f8b / REQ-261001213924-1441）
> 的复核读数，2026-10-02 15:46 在本工作区实跑，命令与输出一如记录。

## 命令与输出摘要

```bash
$ npx vitest run tests/dive-wake-wiring.test.ts tests/dive-wake-e2e.test.ts \
                tests/agent-deliverer.test.ts tests/dive-round-driver.test.ts

 ✓ tests/dive-wake-wiring.test.ts   (10 tests)
 ✓ tests/dive-wake-e2e.test.ts
 ✓ tests/agent-deliverer.test.ts
 ✓ tests/dive-round-driver.test.ts  (26 tests)

 Test Files  4 passed (4)
      Tests  51 passed (51)
   Duration  908ms
```

```bash
$ tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'pm-capture-root|agent-deliverer'
（无输出 —— 原 TS2554「Expected 3 arguments, but got 2」已消失）
```

## 断言与证据对应

| 需求断言 | 由哪份测试/读数证 | 结果 |
|----------|-------------------|------|
| A1 组合根形状守卫 | `tests/dive-wake-wiring.test.ts`（真实 `createCaptureRuntime` + 真实 round driver） | 10 项通过 |
| A2 投递器单测迁移 | `tests/agent-deliverer.test.ts`（`createRoundMessage` / `deliverMessage`） | 通过 |
| A3 类型错误消失 | `tsc` + grep（上） | 无输出 |
| A4 不再被误 disarm | `tests/dive-round-driver.test.ts` + 台账 `driverHealth` 分离 | 26 项通过 |
| A6 disarm 可见 | 暂停路径追加 system comment（单测断言） | 通过 |
| A5 端到端不敲字 | `tests/dive-wake-e2e.test.ts` 在场 | 测试通过；**真实会话未由本需求独立重跑** |

## 未跑项（如实标注）

| 项 | 说明 |
|----|------|
| A5 真实会话 E2E | 本需求未独立在真实会话里做"确认后不敲字"观察；引用交付需求的验收记录与 `tests/dive-wake-e2e.test.ts` |
| 全量测试基线 | 未跑 `npx vitest run` 全量（与 KB C-14 基线比对）；本次只跑与改动面相关的 4 份测试文件 |

## TC-1 装配契约与真实起轮（t-dfaada / t-812b1b / t-f11373 / t-fde20c）

covers: t-dfaada, t-812b1b, t-f11373, t-fde20c
validates: FR-1, FR-2

- 命令：`npx vitest run tests/dive-wake-wiring.test.ts` → 10 passed
- 含义：组合根产出的投递器形状正确（三参 + 可注入 id 工厂），一次驱动即可真正投出 `source.kind = 'dive'` 的回合消息，且台账不被写成暂停。
- 与卡的关系：这四张卡（装配对齐 / 研发段 / 复核段 / 测试段）的交付物由这一份守卫测试共同承载；本需求未执行这些卡（重复交付），读数取自已交付实现。

## TC-2 投递契约回归（t-220e7a）

covers: t-220e7a
validates: FR-2

- 命令：`npx vitest run tests/agent-deliverer.test.ts` → passed
- 含义：`createRoundMessage` / `deliverMessage` 的消息形状与四态失败语义不回归（且永不抛）。

## TC-3 暂停留痕与意图分离（t-38e435 / t-439654 / t-6a1727 / t-2ace1c）

covers: t-38e435, t-439654, t-6a1727, t-2ace1c
validates: FR-3

- 命令：`npx vitest run tests/dive-round-driver.test.ts` → 26 passed
- 含义：运行时故障只写 `driverHealth`（不改写人的 activation 意图）并追加 system comment；幂等、不抛。

## TC-4 端到端与重复交付复核（t-1cb840）

covers: t-1cb840
validates: FR-1, FR-2, FR-3

- 命令：`npx vitest run tests/dive-wake-e2e.test.ts` → passed；外加本次人工复核读数（4 文件 51 项全绿、`tsc` grep 无命中）
- 含义：覆盖「该跑 → 跑了 → 停了 → 被叫回来」全链路；本需求的重复交付结论落在 `../reviews/duplicate-review.md`。
- 未跑项：真实会话 E2E 未由本需求独立重跑（如实标注）。
