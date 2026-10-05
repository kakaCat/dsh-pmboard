# 测试证据（REQ-261002110908-81d0）

> 复现方式：在仓库根逐条执行下列命令。基线数字与开工前实测见 `../notes/baseline-2026-10-02.md`。

## 一、本需求新增用例

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/arg-guidance.test.ts` | **10 passed**（TC-1 常量三锚点 / TC-1b 报告描述 / TC-2 遍历覆盖 / TC-4 反向 / TC-5 零变更快照） |
| `npx vitest run tests/arg-guidance.test.ts`（**改前**） | `No test files found, exiting with code 1`（改前必红留档） |
| `npx vitest run tests/task-report.test.ts` | **7 passed**（汇报工具既有行为不变） |
| `npx vitest run tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts` | 全绿（轻档 2500 字符预算守住；P1 基线按脚本刷新） |
| `npx vitest run tests/tools-schema.test.ts` | **42 passed**（解锁修复后门禁对全部工具生效） |

## 二、回归与类型

| 命令 | 结果 |
|---|---|
| `npx vitest run` | 失败 **49 文件 / 98 用例**（= 开工基线，失败集合逐一相同）；通过 2991 → 3001 |
| `npx tsc --noEmit` | 基线 197 个既有错误；本次改动**零新增**（解锁修复后 194） |

## 三、片段与构建（C-16 / C-17 / C-11）

| 命令 | 结果 |
|---|---|
| `node scripts/inline-prompt-fragments.mjs` | exit 0（128 fragments / 72702 bytes） |
| `node scripts/check-prompt-fragments.mjs` | exit 0（片段↔产物一致、heavy.md↔vendor 逐字节一致） |
| `grep -c 汇报自检 src/domain/prompt/generated/fragments.ts` | 3 |
| `pnpm build` | exit 0 + `[verify-client] OK`；`dist/index.mjs` 含本次文本 |

## 四、回滚演练（可证伪）

1. 把 `LONG_TEXT_ARG_NOTE` 里的「拆成多次调用」改成别的措辞 → `npx vitest run tests/arg-guidance.test.ts` → **4 failed**；
2. 还原 → 同命令 → **10 passed**。

结论：用例不是恒真断言，约定被改动时会红。

## 五、端到端闭环（交付后真实执行）

| 步骤 | 结果 |
|---|---|
| `reqboard_clear_pause(requirement_id)` | `dive.activation=disarmed`（解锁；此前该工具因接线坏从未工作过） |
| `reqboard_decompose(tasks=5 张)` | 落库 5 张父卡（t-105108 / t-9e2260 / t-864d9b / t-b2e268 / t-30abd6） |
| 任务卡推进 | 5 张父卡 + 12 张子卡全部 done，逐卡留完工记录 |
| 需求状态 | 全部任务 done 后**自动进入 accepting** |
## 六、任务 ↔ 测试覆盖对照（covers 标注，供覆盖度门禁读取）

| 覆盖声明 | 对应证据 |
|---|---|
| covers: t-105108, t-43f868, t-c7d051 | `tests/arg-guidance.test.ts` 的 TC-1（约定常量三锚点 + 反向）与 TC-4（未接约定必被判缺） |
| covers: t-9e2260, t-f2a6d0, t-0293c0 | `tests/arg-guidance.test.ts` 的 TC-1b（报告工具三处说明）+ `tests/task-report.test.ts`（既有行为零变更） |
| covers: t-864d9b, t-b42974, t-28876d, t-c7ce80 | `tests/arg-guidance.test.ts` 的 TC-2（遍历 15 条「工具 × 字段」零缺项）与反向 |
| covers: t-b2e268, t-7e5863, t-4ec363 | `node scripts/check-prompt-fragments.mjs`（片段↔产物一致）+ `tests/prompt-tiers.test.ts` + `tests/prompt-baseline.test.ts` |
| covers: t-30abd6, t-8e48aa, t-66185c, t-97e42b | `tests/arg-guidance.test.ts` 的 TC-5（零变更快照）+ 全量回归基线比对 + 回滚演练 |

> 17 个任务 id（5 父卡 + 12 子卡）全部有覆盖声明；本需求的"测试"包含单元用例（vitest）、片段一致性脚本（C-17）与基线比对三类。
