# 测试证据（REQ-261004110201-f253）

> 全部命令在工作区根 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 执行，时点 2026-10-04。

## 0. 任务覆盖对照

| 任务 | covers | 证据节 |
|---|---|---|
| t-a53675 定契约（父） | covers: t-a53675 | §1 |
| t-b26c1f 研发 | covers: t-b26c1f | §1 |
| t-f5efe1 联调 | covers: t-f5efe1 | §1 |
| t-030cb1 复核 | covers: t-030cb1 | §1 |
| t-4d7915 测试 | covers: t-4d7915 | §1 §7 |
| t-835113 路由注入生成器 | covers: t-835113 | §2 |
| t-c7a2d2 收尾写产出数 | covers: t-c7a2d2 | §3 |
| t-ff27ad 遥测读模型+回执 | covers: t-ff27ad | §3 |
| t-817023 零产出告警 | covers: t-817023 | §4 |
| t-613796 优先级+WIP 闸 | covers: t-613796 | §5 §6 |
| t-093330 兼容与迁移验证 | covers: t-093330 | §6 |
| t-c72a5b 全量回归+文档 | covers: t-c72a5b | §7 §8 |

## 1. FR-1 契约（t1）

```
$ npx vitest run tests/stage-model-routing.test.ts      # 契约段 12 条
 ✓ 非法路由表（未知阶段/非法难度/空值/未知字段/多 @）抛错并点名
 ✓ stageKind@difficulty 优先于 stageKind；未命中 → undefined
 ✓ 三个 accessor 缺省 = {} / 0 / 2；非法值抛专属 code
 ✓ 难度枚举与 shared ALL_PROMPT_DIFFICULTIES 逐值一致；STAGE_KINDS 全量可作键
```

## 2. FR-1 路由注入（t2）

```
$ npx vitest run tests/stage-model-routing.test.ts      # 含生成器段 6 条
 ✓ 命中 → agent(prompt, { schema, provider, model })；空串字段忽略
 ✓ 未传 route 与 route=undefined **逐字节相同**，且不含 provider/model 键
 ✓ 端到端：expert 需求 dev 段命中 dev@expert → 引擎实收脚本带 expert-model
 ✓ 未配置路由表 → 脚本不含 provider/model（现状行为）
```

## 3. FR-2 遥测写入与读取（t3 + t4）

```
$ npx vitest run tests/stage-telemetry.test.ts          # 10 条
写入段：传 outputCount → 落 outputCount + zeroOutput(=count===0)；不传 → 两键皆无（hasOwnProperty）
        真实路径：子卡完工 outputCount = filesChanged + completed
读取段：stageTelemetryOf 按 stageKind 聚合 runs/时长/avg/产出/零产出/lastAt
        仍在跑不计、未知产出只计 runs/时长、父卡不参与、排序稳定
        回执有数据则出现、无数据 hasOwnProperty('stage_telemetry') === false
```

## 4. FR-3 零产出告警（t5）

```
$ npx vitest run tests/zero-output-alert.test.ts        # 5 条
判据：streak 末尾连续计数、非零产出即停、未知即断、running 不计
去重：shouldAlertZeroOutput(1,0,2)=false / (2,0,2)=true / (3,1,2)=false / (4,1,2)=true
真实路径：阈值 2 连跑 4 次零产出 → 恰好 2 条 [零产出告警]（streak=2 与 4，含 stage/threshold）
        阈值 2 连跑 2 次 → 1 条；有产出或高阈值 → 不告警
```

## 5. FR-4 优先级与 WIP（t6）

```
$ npx vitest run tests/requirement-priority.test.ts     # 6 条
排序：priority 降序、同值 createdAt 升序；无 priority 视作 0（顺序 = 改造前）
WIP：上限 1 → 首条投出，其余 stopped='wip_limit' + reason 点名 REQ 与「上限 1」+ 解除方式
     已有新鲜锁计在制（上限 1 时一条不投）；陈旧锁不占额度；上限 0 → 三条全投
```

## 6. 兼容与迁移（t7）

```
$ npx vitest run tests/config-defaults-parity.test.ts   # 7 条
① 脚本：route 缺省 vs 不传字段同串、无 provider/model；accessor 缺省 {} / 0 / 2
② 收尾：不传 outputCount → execution 无新键
③ 调度：无 priority + 上限 0 → 按 createdAt 升序全投、无 wip_limit
④ 回执：无遥测 → 无 stage_telemetry 键
⑤ 不回填：旧执行只贡献 runs/时长，zeroOutputRuns=0、streak=0（真实 store 路径复核）
```

## 7. 全量回归与静态检查（t8）

```
$ pnpm test
 Test Files  47 failed | 320 passed | 3 skipped (370)
 Tests  97 failed | 3742 passed | 20 skipped (3859)      # 失败数 = 基线 98 以内
$ npx tsc --noEmit | grep -c "error TS"
 144                                                     # 开工 150，净减 6；归属本需求文件 0
$ pnpm run kb:check
 ✅ 11 项全过（生成物零漂移；新增源文件后已 pnpm run kb:build 重生成）
```

## 8. 文档同步（t8）

- `docs/architecture/project-manual.md`：新增「工作流的三项可配开关」备忘 + 变更记录补行（每条带判据命令）。
- `docs/architecture/automation-chain-contract.md`：§七「调度与观测」——priority / maxInFlightRequirements /
  stage_telemetry / zeroOutputAlertThreshold / stageRouting 五项语义与判据；原可复核入口顺延 §八。

## 9. 反向演练（防线有效性）

| 演练 | 操作 | 期望/实测 |
|---|---|---|
| 路由表非法键 | 传 `{ devv: {model:'x'} }` | 装配期抛错并点名 devv（用例覆盖） |
| WIP 闸 | 上限 1 + 在制 1 | 第二条不投递且原因点名（用例覆盖） |
| 零产出去重 | 阈值 2 + 连续 4 次 | 恰好 2 条告警（floor(4/2)） |
