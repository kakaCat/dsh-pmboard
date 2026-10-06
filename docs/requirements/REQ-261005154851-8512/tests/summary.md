---
req_id: REQ-261005154851-8512
kind: tests
---

# 测试证据（REQ-261005154851-8512）

> 跑什么 → 看到什么；完整读数见 `../evidence/injection-difficulty.md` 与 `../evidence/compat-baseline.md`。

## 1. 主用例集（11 条）

```bash
npx vitest run tests/injection-difficulty.test.ts    # → 11 passed
```

| 编号 | 场景 | 期望 |
|---|---|---|
| T-01 | `factsOf({promptDifficulty:'expert'})` | 含该键 |
| T-02 | `factsOf({})`（存量） | `'promptDifficulty' in facts === false` |
| T-03 | 声明 expert + 文本推不出 | `brainstorming/heavy/feature`（改造前 light） |
| T-04 | 声明 advanced | heavy |
| T-05 | 声明 standard / simple | light |
| T-06 | 声明 simple 而文本推断重 | **取重**（heavy）+ reasons 含「取重不取轻」 |
| T-07 | 无声明 | `fragmentIds` 与基线快照**全等** |
| T-08 | 脏数据六形态 | 按未声明、**不抛错**、分片与基线全等 |
| T-09 | 三处接线 | 源码级断言：三处都经映射函数；两处传 `declaredDifficulty`；第三处是「显式 ?? 声明」 |
| T-10 | 有声明 | `difficultyReasons` 含「声明难度 …」与最终档 |
| T-11 | 无声明且推断不出 | reasons 为空（不编造） |

## 2. 探针

```bash
npx tsx scripts/injection-difficulty-probe.mts    # → exit 0
# declared: brainstorming/heavy/feature + heavy 系分片 + 依据句
# baseline: brainstorming/light/feature + 与快照全等 + 无依据句
# 映射: simple→light / standard→light / advanced→heavy / expert→heavy
```

## 3. 回归与门禁

```bash
npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts \
  tests/decision-gates.test.ts tests/injection-difficulty.test.ts   # → 78 passed / 2 skipped
npx tsc --noEmit    # → 0 错误
pnpm build          # → 退出码 0
```

## 4. 覆盖标注（covers → 任务卡）

### tests/injection-difficulty.test.ts（投影 / 取词 / 三处接线 / 兼容）
covers: t-455df9, t-209f12, t-419e05, t-d7efd0, t-4774f3, t-9320b0, t-2552b1, t-44ede1, t-b230c5, t-a8d32c, t-17d8eb, t-6eafad

### scripts/injection-difficulty-probe.mts + evidence/（探针与实机留痕取证）
covers: t-59ba97, t-ad7674, t-30570e, t-c11fd4

## 5. 待人工那两项

实机留痕翻转（需重启插件）与「本轮复核为自审」两件事见 `../verification.md` §3。
