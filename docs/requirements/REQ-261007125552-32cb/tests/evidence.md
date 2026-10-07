# 测试证据（REQ-261007125552-32cb）

> 命令均在仓库根执行；计数为最后一次运行的真实输出。

## 粒度门禁套件（本次新增）

```
npx vitest run tests/plan-granularity.test.ts
→ Test Files 1 passed (1) / Tests 47 passed (47)
```

覆盖：TC-1 清单节门（6 例）/ TC-2 存量豁免（3 例）/ TC-3 对照表（4 例）/ TC-4 降级（3 例）/
TC-5 接口数门（2 例）/ TC-6 豁免（2+4 例）/ TC-7 词法（7 例）/ TC-8 软门（5 例）/
TC-9 落库侧（1 例）/ TC-10 三入口（3 例）/ TC-11 提示词档（2 例）/ TC-12 模板探针（4 例）/ 传输码登记（1 例）。

## RTM 一对多（TC-9 RTM 侧）

```
npx vitest run tests/decompose-rtm-integration.test.ts
→ Tests 4 passed (4)（含「一对多：一条 FR 被 3 张接口卡接收」：covers_frs 一对三、覆盖率 100%、未接收清单空）
```

## 既有门禁回归（零改动全绿）

```
npx vitest run tests/clause-coverage-gate.test.ts tests/plan-overcapacity-notice.test.ts tests/plan-doc-table.test.ts tests/decompose-rtm-integration.test.ts
→ Tests 46 passed (46)
```

## 提示词系

```
pnpm prompts:check → OK（generated 与源一致；heavy ↔ vendor 逐字节一致）
npx vitest run tests/prompt-tiers.test.ts → 40/40（light 预算守住：design 2481 / decomposing 2493 ≤ 2500）
npx vitest run tests/prompt-baseline.test.ts → 15/15（P1 基线已由 dump-stage-prompts.mjs 重刷）
npx vitest run tests/stage-prompts.test.ts → 全绿
npx tsx scripts/template-gate-probe.mts → 模板 25 份：OK 25 / FAIL 0
```

## 类型与全量

```
npx tsc --noEmit → 0 错误（开工前基线 1，既有错误被并发窗口修掉）
pnpm test → Tests 95 failed | 6701 passed（失败数 ≤ 开工前基线 96；失败清单逐文件核对为既有债/环境项，
  隔离方法：git stash 本次改动后 decompose-tools 仍 5 红、plan-mode 仍 1 红；error-code-inventory 由红转绿）
```

## 错误码登记

```
npx tsx tests/drill/refresh-error-code-inventory.mts + 人工分级（5 枚：本需求 3 + 既有欠账 2）
npx vitest run tests/error-code-inventory.test.ts → 11/11 绿
```
