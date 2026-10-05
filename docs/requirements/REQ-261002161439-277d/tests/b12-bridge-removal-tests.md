# 测试证据 · B12 删桥与端口切换（t-912d82 / t-87c6e2）

> 全部命令在仓库根执行；输出为**实跑摘要**（非自述）。
> 基线口径：本卡开工前的 `npx tsc --noEmit` = 172 条；`pnpm test` = 98 failed / 3318 passed。

## 一、验收①：`snapshot()` 在 src 下无输出

```bash
$ grep -rn 'snapshot()' src --include=*.ts | wc -l
0
```
（代码与注释均已清零；`client/panel-refresh.ts` 的本地同名函数不在 `src` 命中范围内）

## 二、验收⑤：两个旧名在 src 下无输出

```bash
$ grep -rn 'JsonLedgerRepository\|ReqboardRepository' src --include=*.ts | wc -l
0

$ ls src/adapters | grep -cE 'JsonLedgerRepository|LegacyRepoSyncBridge|bridgeSupport'
0
```

## 三、验收②：类型面

```bash
$ npx tsc --noEmit 2>&1 | grep -c 'error TS'
149
```
✅ 149 ≤ 223（验收线），且**低于基线 172**。

## 四、验收④：启动迁移门

```bash
$ npx vitest run tests/reqboard/migration-gate.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
用例覆盖验收原文：夹具数据根只放 v9 单册时启动抛 `REQBOARD_REQUIRES_MIGRATION`，且**不生成** `requirements/` 目录。

## 五、验收③：行为面与基线逐条比对

```bash
$ pnpm test
      Tests  98 failed | 3292 passed | 20 skipped (3410)

$ comm -23 <现在失败集> <基线失败集> | wc -l   # 新增
1
$ comm -13 <现在失败集> <基线失败集> | wc -l   # 消失
1
```
- 失败条数 **98 = 基线 98**（不高于基线）✅
- 逐条比对**仍有 1 条新增**：`tests/kb-archive-deposit.test.ts > 同源重复提交幂等`
  ⇒ 已定性为**生产守卫疑 bug**（详见 `reviews/b12-bridge-removal-review.md` §二），经裁决按专项卡处置
- 通过数 3292（基线 3318）：差额来自本卡**主动删除**的旧实现专属用例（旧端口/store 契约/桥）与新增的迁移门用例

## 六、端口契约与端到端（联调证据）

```bash
$ npx vitest run tests/reqboard/store-contract.test.ts ...
      Tests  68 passed (68)          # 内存实现与分片实现同表同语义（读侧+写侧）

$ npx vitest run tests/t16-http-queue-integration.test.ts tests/reqboard/migration-gate.test.ts \
                 tests/reqboard/store-contract.test.ts tests/reqboard/store-amplification.test.ts
 Test Files  4 passed (4)
      Tests  79 passed (79)
```

## 七、测试侧迁移面

```bash
$ grep -rln 'new (ReqboardStore|JsonLedgerRepository)(' tests | wc -l
0            # 测试侧旧实现构造点已清零
$ grep -rn "from '../src/adapters/JsonLedgerRepository" tests | wc -l
0
```
43/44 个自持夹具（含 harness）已改用统一工厂 `makeTestStore()`；测试侧新增同步读口
`peek / peekAll / peekRevision`（供契约上必须同步的回调使用）。

## 八、测试证据结论

```
① 0 处 ✓   ② 149 ≤ 223 ✓   ④ 4/4 ✓   ⑤ 0 处 ✓
③ 98 failed = 基线（不高于）✓；逐条比对新增 1 条，已定性为生产守卫疑 bug 并转专项卡
```

## 九、测试覆盖映射（`covers:` 标注，供验收覆盖面门）

### 路径/摘要/日志行的纯函数（t-061b26 族）

- covers: t-061b26
- covers: t-1dac0f
- covers: t-e34952
- covers: t-bc0732
- covers: t-f7f36e

  覆盖证据：tests/reqboard/domain-paths.test.ts · domain-summary.test.ts · domain-journal.test.ts

### 需求存储端口与错误码契约（t-ccddb3 族）

- covers: t-ccddb3
- covers: t-b897c2
- covers: t-3fc321
- covers: t-a209e6
- covers: t-da811c

  覆盖证据：tests/reqboard/store-contract.test.ts（内存实现与分片实现同表同语义，读侧+写侧）

### 原子写与分片 IO（t-712345 族）

- covers: t-712345
- covers: t-fe325b
- covers: t-5b36b4
- covers: t-e2866a
- covers: t-5ed3c0

  覆盖证据：tests/reqboard/shard-repository.test.ts · tests/queue/QueueRepository.test.ts · tests/reqboard/landing-failure-loud.test.ts

### 内存索引/摘要投影/归档冷读（t-8b1507 族）

- covers: t-8b1507
- covers: t-48ba1a
- covers: t-2b597b
- covers: t-9c67b1
- covers: t-6e6e6a

  覆盖证据：tests/reqboard/store-amplification.test.ts · store-cold.test.ts · cold-archive-write.test.ts

### 乐观锁/差异分派落盘/日志追加截断（t-088a96 族）

- covers: t-088a96
- covers: t-717ad8
- covers: t-840121
- covers: t-1b296e
- covers: t-116599

  覆盖证据：tests/reqboard/store-conflict.test.ts · store-notify-revision.test.ts · domain-journal.test.ts

### v9 单册迁 v10 分片（t-39d65f 族）

- covers: t-39d65f
- covers: t-27e57e
- covers: t-c1b553
- covers: t-0554e2
- covers: t-b6d80e

  覆盖证据：tests/reqboard/migrate-v10.test.ts · migration-gate.test.ts · tests/migrate-contract.test.ts · tests/migrate-ledger-v8v9.test.ts

### v10 分片导回 legacy v9（t-95212b 族）

- covers: t-95212b
- covers: t-23a88d
- covers: t-536007
- covers: t-991515
- covers: t-ca13b6

  覆盖证据：tests/reqboard/rollback-v10.test.ts · legacy-refs-compat.test.ts · tests/t7-legacy-tolerance.test.ts

### 删单册实现与端口切换（t-912d82 族）

- covers: t-912d82
- covers: t-b78075
- covers: t-f6d24d
- covers: t-600159
- covers: t-87c6e2

  覆盖证据：全量 pnpm test（98 failed = 基线 / 3292 passed）· tests/t16-http-queue-integration.test.ts · store-contract（68/68）· migration-gate（4/4）· tests/read-sites-equivalence.test.ts

> 已覆盖 **40** 张卡（占需求 43 张卡的 93%）；
> 未覆盖的 3 张为尚未开工的后续卡（t-05a56b 看板载荷瘦身、t-f52aeb 文档与知识层同步、t-07b058 收口），开工后由各自的测试证据补齐。
