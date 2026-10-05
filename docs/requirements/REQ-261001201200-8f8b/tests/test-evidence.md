# REQ-261001201200-8f8b 测试证据（t2/t3/t4 用例 + t5 全量回归）

## 1. 本需求新增/迁移的测试文件

| 文件 | 用例数 | 覆盖 |
|------|--------|------|
| `tests/dive-wake-wiring.test.ts`（新） | 7 | 装配形状守卫（真实组合根 + 真实 round driver 一次驱动即起轮）+ 生产装配守卫（diveRoundPorts 接全，尤其 delivery）+ 构造契约 |
| `tests/dive-rearm.test.ts`（新） | 8 | 恢复正例 / 幂等 / 三类负例（clear_pause、终态、已 armed）/ 需求不存在 / 集成起轮 / 人暂停不越权 |
| `tests/agent-deliverer.test.ts`（迁移） | 10 | 构造契约（非函数 idFactory 抛错）+ 回合消息形状 + 投递三态（永不抛） |
| `tests/dive-round-driver.test.ts`（增） | 17 | 既有 14 + 新增 3：disarm 写入 / 幂等 / teardown 不写 |
| `tests/dive-round-state.test.ts`（增） | 15 | 既有 12 + 新增 3：isRecoverableDisarm 真值表 + undefined + dive 缺失 |

## 2. 修前必红 → 修后全绿（红绿翻转实测）

```
# ① 把组合根临时改回两参（修前形状）
$ npx vitest run tests/dive-wake-wiring.test.ts
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)          # 报错：TypeError: this.idFactory is not a function
# ② 还原三参
$ npx vitest run tests/dive-wake-wiring.test.ts
      Tests  7 passed (7)

# ③ 从 index.ts 的 diveRoundPorts 移除 delivery（第二处断点）
$ npx vitest run tests/dive-wake-wiring.test.ts
      Tests  1 failed | 6 passed (7)          # expected ... to contain delivery:
# ④ 还原
      Tests  7 passed (7)
```

实验后均已还原（`grep -c "delivery: deliverer," src/index.ts` = 1；三参行存在）。

## 3. 单卡验收命令

| 卡 | 命令 | 结果 |
|----|------|------|
| t1 | `npx tsc --noEmit -p tsconfig.json` 过滤 pm-capture-root | 修前 TS2554 1 行 → 修后**无输出** |
| t1 | tsx 调真实组合根产出的 `createRoundMessage` | 显式注入 `msg-explicit` / 缺省回落 `c-32779c`（非空）；非法 idFactory 构造抛 TypeError |
| t2 | `npx vitest run tests/dive-wake-wiring.test.ts tests/agent-deliverer.test.ts` | **17 passed** |
| t3 | `npx vitest run tests/dive-round-driver.test.ts` | **17 passed** |
| t4 | `npx vitest run tests/dive-round-state.test.ts tests/dive-rearm.test.ts` | **23 passed** |

## 4. 全量回归（C-14）

```
$ npx vitest run
 Test Files  48 failed | 245 passed | 3 skipped (296)
      Tests  97 failed | 2897 passed | 20 skipped (3014)
基线：106 failed / 2807 passed   →   本次失败 -9、通过 +90
```

失败项均为**既有红**（与本需求无关），典型如 `tests/application/repository.test.ts` 断言需求 ID 为 6 位 hex，
而 ID 格式早已改为「时间戳 + 4 位 hex」。

## 5. 未覆盖（如实标注）

- **端到端**（真人确认门 → 不敲字 → 会话自行起轮）：未跑。原因见 `evidence/verification.md` §5（需插件重载后人工观察）。
- **真机重载后的存量恢复**：未跑，仅由集成用例（重新武装 → 起轮）与看板「继续」入口的代码路径覆盖。

## 6. 任务覆盖对照（covers：逐卡指到证据）

> 每张卡（父卡与子卡）对应到实际跑过的用例或命令；本表即测试覆盖度门禁的输入。

- `covers: t-cd44d6` t1 父卡｜对齐投递器装配契约 —— tests/dive-wake-wiring.test.ts 装配形状守卫 7 passed；`tsc` 过滤 pm-capture-root 无输出；tsx 复现非空 messageId
- `covers: t-0f5858` t1·研发段｜三参构造 + idFactory 缺省 + 构造期校验 —— tests/dive-wake-wiring.test.ts
- `covers: t-0823eb` t1·联调段｜真实组合根实跑构造与投递 —— tests/dive-wake-wiring.test.ts「一次 requestDrive → inbox 恰 1 条 dive 消息」
- `covers: t-4a5db1` t1·复核段｜改动面与契约一致性 —— 同文件 + `tsc` 过滤无输出
- `covers: t-c8b5b5` t1·测试段｜四条断言（非空 id ×2、非法 idFactory 构造抛错、离线投递不抛） —— 同文件
- `covers: t-0cdb32` t2 父卡｜装配形状守卫与投递契约单测 —— tests/dive-wake-wiring.test.ts(7) + tests/agent-deliverer.test.ts(10)
- `covers: t-d18e54` t2·研发段｜守卫测试 + 单测迁移到新 API —— 同上两个文件
- `covers: t-5b1be2` t2·复核段｜守卫测装配而非行为，断言在修前后翻转 —— 3 failed → 7 passed
- `covers: t-151ffa` t2·测试段｜修前必红、修后全绿，共 17 passed —— 同两个文件
- `covers: t-e2139e` t3 父卡｜disarm 写台账留痕（停摆可见） —— tests/dive-round-driver.test.ts 17 passed（含新增 3 例）
- `covers: t-cbc679` t3·研发段｜disarm() 在同一笔 mutate 内追加 system comment —— tests/dive-round-driver.test.ts
- `covers: t-5236d6` t3·联调段｜真实投递失败路径写台账 —— 同文件「驱动体抛错 → 恰 1 条 comment 且含 reason=driver-failed」
- `covers: t-3cefc0` t3·复核段｜只增可见性、不改状态机语义 —— 同文件幂等用例
- `covers: t-0b3262` t3·测试段｜写入 / 幂等 / teardown 不写，三例全绿 —— 同文件
- `covers: t-d8d82b` t4 父卡｜误停摆恢复（判别器 + 恢复入口 + 两个调用点） —— tests/dive-round-state.test.ts(15) + tests/dive-rearm.test.ts(8)
- `covers: t-8157df` t4·研发段｜isRecoverableDisarm + rearmIfRecoverable + 两调用点 —— 同上两文件
- `covers: t-a89a79` t4·联调段｜集成：onRequirementMoved 先重新武装再起轮 —— tests/dive-rearm.test.ts 集成用例
- `covers: t-0b5604` t4·复核段｜不越权改人的决定（clear_pause / paused / 已 armed 三类负例） —— 同文件
- `covers: t-93c57e` t4·测试段｜真值表 5 行 + 三类负例 + 集成，共 23 passed —— 同上两文件
- `covers: t-d912e9` t5 父卡｜迁移兼容与端到端验证 —— evidence/verification.md + notes/migration-and-rollback.md + 本文件
- `covers: t-52f2cc` t5·研发段｜迁移、兼容与回滚说明 —— notes/migration-and-rollback.md
- `covers: t-5cc632` t5·复核段｜构建与全量回归 —— `pnpm build` exit 0；`npx vitest run` 97 failed / 2897 passed（基线 106 / 2807）
- `covers: t-742553` t5·测试段｜C-11/C-14 证据 + 改动面 mtime 归属 —— evidence/verification.md

