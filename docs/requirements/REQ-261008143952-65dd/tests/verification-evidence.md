---
id: REQ-261008143952-65dd
kind: test-evidence
generated: 2026-10-08
---

# 测试证据：更新 vendor superpowers 分片到本地最新版

> 逐条给「跑什么命令 / 看到什么」；命令与输出摘要均为本轮实测，未做转述美化。
> 产物快照：`generated/fragments.ts` = 129 记录（生成器自报源文本 84334 **字符**；盘上 **113344 字节**）；
> `baseline-p1.json` = 12 键（dump 脚本自报 70776 **字符**；盘上 **105748 字节**）。
> **口径提醒**：两个脚本打印的单位字样是 `bytes`，但其值是 JS 字符串 `.length`（字符数）——含大量中文时分母不同，勿混用。

## 1. 契约类（门禁，exit code 判据）

| # | 命令 | 期望 | 实测 |
|---|------|------|------|
| E-1 | `node scripts/check-prompt-fragments.mjs` | OK + exit 0 | `OK: src/domain/prompt/generated/fragments.ts 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致`，exit **0** |
| E-2 | `npx tsx scripts/prompt-path-probe.mts` | 缺口 0 + exit 0 | `OK 路径可达 + 禁词前缀（57 份片段 + src/application/dive/round-state.ts + agent 文案面 60 份）：token 40 个（真实存在 9 / 产物名白名单 31）；禁词命中 0` → `缺口 0；exit 0` |
| E-3 | `npx tsc --noEmit` | 0 错误 | 无输出，exit **0** |

## 2. 上游保真（逐份字节级）

```text
# 14 份 diff -q 源与目标 → 全部无输出（无差异）
# 8 份实变文件的 sha256 与本地 v6.4.2 源逐份一致：
brainstorming                    a32d2255354775aa124855aa7100cf276bea096fff4ebb3a0edf57be216e6c72
executing-plans                  f38e8f2ddcf079f65493adc713c1fed78421dfaf5f4dbf6b3a6b2b1d95466e71
requesting-code-review           cfcee1b06774e7c0517f1e09be1a11f2d5680257072723e709ddbcf7e08b795a
subagent-driven-development      8dde5589ee083fb4999106d116f01c8fdaf3116a8a9813fdedeb80329de49046
test-driven-development          64b03fce4aee5a97a93160cea8111f3ba13a17b7c001db4bd5836d67fd10705d
using-superpowers                82c5c8866ad7f5dd4440ce66bd7806ba48a2f13771beae5cf112e53f08fe36ba
writing-plans                    a6c67c1900064347c2a329990dd3c555657c51c3ec53b259a08aa01a2c26139a
writing-skills                   bbdfe742f853562e643a3d40d64476359d47881e39cef80a189283fa26d11ab9

# 镜像契约（vendorMirrorProblems 判据函数直接调用）
vendorMirrorProblems() 返回条数: 0
  implementing ← executing-plans                vendor=20405 heavy=20405 ✅
  accepting    ← verification-before-completion vendor=3646  heavy=3646  ✅
  archived     ← finishing-a-development-branch  vendor=7781  heavy=7781  ✅
```

## 3. 生成物守恒与幂等

```text
$ node scripts/inline-prompt-fragments.mjs
[inline-prompt-fragments] wrote src/domain/prompt/generated/fragments.ts (129 fragments, 84334 bytes)
#   ↑ 该数字是生成源文本的 .length（字符）；盘上文件实际 113344 字节（wc -c）

# 幂等：连跑两次
第一次 b92d064dcca7da150cdfe6828dd687690c05eb539e5c9f43b5d57561b5550abd
第二次 b92d064dcca7da150cdfe6828dd687690c05eb539e5c9f43b5d57561b5550abd   → 相同

# 条数守恒（对照 git HEAD 基线）
HEAD=129  现=129   ✅
id 集合：diff /tmp/ids_before.txt /tmp/ids_after.txt → 无差异（无增删分片）

# 构成自洽（实测文件系统）
节点档=12 extra=1 overrides=7 common=1 类型档=36 壳=72 合计=129

# 产物内联文本与盘上一致
implementing/heavy text：字符 20249 / 字节 20405；盘上 heavy.md 同值 → ✅
```

## 4. 本需求范围测试（269 条全绿）

```text
$ npx vitest run tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts \
    tests/prompt-gates.test.ts tests/prompt-categories.test.ts \
    tests/stage-prompts.test.ts tests/prompt-path-probe-tools-surface.test.ts

 Test Files  6 passed (6)
      Tests  269 passed (269)
```

分组细读：

| 组 | 断言数 | 说明 |
|----|-------:|------|
| `prompt-categories` | 160 | 类型轴：六类型两两不同、36 份类型档无孤岛（换文本未波及类型轴） |
| `prompt-gates` | 13 | 工具名一致、**预算上界**、无孤岛 |
| `prompt-tiers` | 39 | ④ 三节点镜像逐字、⑤ light/heavy 双向、⑥ 注入顺序 |
| `stage-prompts` | 38 | 六节点要素、本仓工具化措辞 |
| `prompt-baseline` | 15 | P1 基线 12 键逐字 |
| `prompt-path-probe-tools-surface` | 4 | 探针扩面与禁词规则生效 |

## 5. 影响面哨兵（基线只应一键变）

```text
$ node scripts/dump-stage-prompts.mjs
[dump-stage-prompts] keys=12 bytes=70776
#   ↑ 同为字符数；盘上文件实际 105748 字节（wc -c）

逐键比对（相对上一次快照）：
变化键: implementing/heavy
  implementing/heavy: 23804 → 23852
✅ 哨兵通过

其余 11 键逐字未变：
brainstorming/light, brainstorming/heavy, design/light, design/heavy,
decomposing/light, decomposing/heavy, implementing/light,
accepting/light, accepting/heavy, archived/light, archived/heavy
```

## 6. 注入抽检（最终态）

```text
resolveStagePrompt({ stage: 'implementing', difficulty: 'heavy', category: 'feature' })

  含 The Task Loop = true
  含 Common Rationalizations = true
  含 Continuous execution = true
  含 覆盖 10 = true
  charCount = 23852          （预算 24000，余量 148）
  overBudget = undefined     ✅
  routeKey  = implementing/heavy/feature   hitLevel = 1
  fragmentIds = implementing/heavy/feature → implementing/heavy → implementing/heavy/overrides
                → implementing/feature → common/iron-rules
```

预算逐类型实测（`files×…` 口径无关，此处为字符数）：

| category | feature | bug | refactor | doc | spike | chore |
|----------|--------:|----:|---------:|----:|------:|------:|
| 注入字符数 | **23852** | 23792 | 23793 | 23790 | 23783 | 23751 |

换源前后对照：`implementing/heavy` 注入由 **5214 → 23852** 字符（+357%）。

## 7. 全量单测（如实报出，含归因取证）

```text
工作区：$ npx vitest run
 Test Files  11 failed | 598 passed | 3 skipped (612)
      Tests  18 failed | 7154 passed | 27 skipped (7199)

等价基线（HEAD 干净 worktree）：
$ git worktree add --detach /tmp/pmbase HEAD
$ cd /tmp/pmbase && npx vitest run <同样 11 个文件>
 Test Files  9 failed (9)
      Tests  22 failed | 44 passed (66)
```

**归因结论**：该批红为**仓库既有状态**（HEAD 即 22 条），本需求**零新增失败**；工作区比 HEAD 少 4 条。

三条互相独立的辅助证据：
1. 11 个失败文件**均不引用**本需求改过的文件（逐个 grep 核对）；
2. 失败原因指向的文件 mtime = `2026-10-08 14:23`（我开工前），我改的文件 mtime = `18:4x`；
3. 失败签名与改动性质不符（message-hygiene 各层拼接数 140→615；size-budget 指向 `src/tools/SubmitTool/SubmitTool.ts` = 509 行——本需求未触碰 `.ts` 源码）。

## 8. 覆盖缺口与未验项（不假装有测试）

| 缺口 | 为什么测不了 |
|------|-------------|
| 覆盖 10 四条收口能否**实际阻止** agent 照上游执行 | 行为层判据：需真实跑一轮 implementing 会话观察，或人工评审文案；**须人看** |
| 上游原文是否夹带有害指令 | prompt injection 面靠 commit 固定 + 人工 review；本次已人工比对 8 份差异，未见此类内容 |
| 全量基线比对 | 开工前未采集全量基线（执行疏漏，已登记）→ 改用 HEAD worktree 等价基线 + 非引用证据链归因 |

## 9. 复现方式

```bash
# 1. 契约门禁（两条都应 exit 0）
node scripts/check-prompt-fragments.mjs
npx tsx scripts/prompt-path-probe.mts

# 2. 生成物（应输出 129 fragments；连跑两次无 diff）
node scripts/inline-prompt-fragments.mjs

# 3. 本需求范围测试（应 269 passed）
npx vitest run tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts \
  tests/prompt-gates.test.ts tests/prompt-categories.test.ts \
  tests/stage-prompts.test.ts tests/prompt-path-probe-tools-surface.test.ts

# 4. 类型检查
npx tsc --noEmit
```

## 10. 覆盖标注（逐卡 covers）

> 口径：每张卡（8 父卡 + 23 子卡 = **31** 张）都要有测试文档里的 `covers:` 标注。
> 下面逐卡一行（**一行一个 id**，便于机械解析）；子卡与其父卡共用同一组证据（子卡是父卡的三阶段链）。

| 卡 | 角色 | covers 标注 | 接收证据 |
|----|------|------------|---------|
| t1 同步 14 份原文 | 父卡 | covers: t-3619e8 | §2 上游保真（逐份 diff + sha256 逐份一致） |
| t1 同步 14 份原文 | 研发子卡 | covers: t-98fd78 | §2 上游保真（逐份 diff + sha256 逐份一致） |
| t1 同步 14 份原文 | 复核子卡 | covers: t-798d65 | §2 上游保真（逐份 diff + sha256 逐份一致） |
| t1 同步 14 份原文 | 测试子卡 | covers: t-5d661c | §2 上游保真（逐份 diff + sha256 逐份一致） |
| t2 镜像同步 | 父卡 | covers: t-e49c68 | §2 镜像契约（vendorMirrorProblems = 0）+ E-1 门禁 |
| t2 镜像同步 | 研发子卡 | covers: t-95fafa | §2 镜像契约（vendorMirrorProblems = 0）+ E-1 门禁 |
| t2 镜像同步 | 复核子卡 | covers: t-7d7adc | §2 镜像契约（vendorMirrorProblems = 0）+ E-1 门禁 |
| t2 镜像同步 | 测试子卡 | covers: t-2262b1 | §2 镜像契约（vendorMirrorProblems = 0）+ E-1 门禁 |
| t3 overrides 覆盖 10 | 父卡 | covers: t-4d5077 | §6 注入抽检（含覆盖 10 在场）+ 预算逐类型实测 |
| t3 overrides 覆盖 10 | 研发子卡 | covers: t-30b0f8 | §6 注入抽检（含覆盖 10 在场）+ 预算逐类型实测 |
| t3 overrides 覆盖 10 | 复核子卡 | covers: t-26db00 | §6 注入抽检（含覆盖 10 在场）+ 预算逐类型实测 |
| t3 overrides 覆盖 10 | 测试子卡 | covers: t-c7b351 | §6 注入抽检（含覆盖 10 在场）+ 预算逐类型实测 |
| t4 生成器产物 | 父卡 | covers: t-4649ba | §3 生成物守恒与幂等 + E-1 门禁 |
| t4 生成器产物 | 研发子卡 | covers: t-5adbfd | §3 生成物守恒与幂等 + E-1 门禁 |
| t4 生成器产物 | 复核子卡 | covers: t-0f95c2 | §3 生成物守恒与幂等 + E-1 门禁 |
| t4 生成器产物 | 测试子卡 | covers: t-999045 | §3 生成物守恒与幂等 + E-1 门禁 |
| t5 ATTRIBUTION 档案 | 父卡 | covers: t-283c99 | §2 上游保真（档案三方一致、14 行实测相符） |
| t5 ATTRIBUTION 档案 | 研发子卡 | covers: t-258e26 | §2 上游保真（档案三方一致、14 行实测相符） |
| t5 ATTRIBUTION 档案 | 复核子卡 | covers: t-e8fb6d | §2 上游保真（档案三方一致、14 行实测相符） |
| t6 测试引用 | 父卡 | covers: t-e97596 | §4 prompt-tiers + stage-prompts（77 passed） |
| t6 测试引用 | 研发子卡 | covers: t-d1d7ba | §4 prompt-tiers + stage-prompts（77 passed） |
| t6 测试引用 | 复核子卡 | covers: t-13f48f | §4 prompt-tiers + stage-prompts（77 passed） |
| t6 测试引用 | 测试子卡 | covers: t-e73450 | §4 prompt-tiers + stage-prompts（77 passed） |
| t7 基线快照 | 父卡 | covers: t-e30c47 | §5 影响面哨兵 + prompt-baseline（15 passed） |
| t7 基线快照 | 研发子卡 | covers: t-53267b | §5 影响面哨兵 + prompt-baseline（15 passed） |
| t7 基线快照 | 复核子卡 | covers: t-8add09 | §5 影响面哨兵 + prompt-baseline（15 passed） |
| t7 基线快照 | 测试子卡 | covers: t-c5ee39 | §5 影响面哨兵 + prompt-baseline（15 passed） |
| t8 全量回归与抽检 | 父卡 | covers: t-a9fc97 | §1 契约门禁 + §6 抽检 + §7 全量归因 |
| t8 全量回归与抽检 | 研发子卡 | covers: t-92685a | §1 契约门禁 + §6 抽检 + §7 全量归因 |
| t8 全量回归与抽检 | 复核子卡 | covers: t-4c5f03 | §1 契约门禁 + §6 抽检 + §7 全量归因 |
| t8 全量回归与抽检 | 测试子卡 | covers: t-062747 | §1 契约门禁 + §6 抽检 + §7 全量归因 |

**合计 31 行标注**，与验收单要求的任务全集一致。
