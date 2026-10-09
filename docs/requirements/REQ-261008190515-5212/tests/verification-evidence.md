---
id: REQ-261008190515-5212
kind: test-evidence
generated: 2026-10-08
---

# 测试证据：把 implementing 移出 vendor 镜像并改写自写实施档

> 逐条给「跑什么命令 / 看到什么」；命令与输出摘要均为本轮实测，未做转述美化。

## 1. 契约与门禁

| 命令 | 期望 | 实测 |
|---|---|---|
| `node scripts/check-prompt-fragments.mjs` | exit 0（源/产物一致 + 镜像内 heavy 与 vendor 逐字一致） | `[check-prompt-fragments] OK`；exit 0 |
| `pnpm prompts:check` | exit 0（生成 + 门禁 + 路径探针） | `[inline-prompt-fragments] wrote … (129 fragments, 64671 bytes)`；`OK: … 一致；heavy.md ↔ vendor 原文逐字节一致`；`[prompt-path-probe] 缺口 0；exit 0` |
| `npx tsx scripts/prompt-path-probe.mts --json --specimen` | 五条判据全过（禁词不吃白名单、扩面非空转） | `exitCode: 0`；`whitePasses: true`；`redOnForbidden: true`；`agentSurfaceScanned: 60` |
| `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` | `accepting,archived` | `accepting,archived` |
| `grep -c "executing-plans" scripts/inline-prompt-fragments.mjs tests/prompt-tiers.test.ts` | 0 / 0 | `0` / `0` |
| `grep -c "task-start" scripts/prompt-path-probe.mts` | 0 | `0` |

## 2. 注入文本

| 判据 | 命令 | 实测 |
|---|---|---|
| 体量 | `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` | **4656**（改前 23852；预算 24000） |
| 纪律骨架 | 注入文本取词 | 含 `The Task Loop`、`Common Rationalizations` |
| 本仓工具面 | 注入文本取词 | 含 `reqboard_task_move`、`reqboard_task_report`、`reqboard_ask_confirm`、`reqboard_submit(kind=verification)` |
| 上游残留 | `grep -c "scripts/task-\|docs/superpowers\|superpowers:" …/implementing/heavy.md` | `0` |
| 不再是镜像 | `diff -q fragments/implementing/heavy.md vendor/…/executing-plans/SKILL.md` | 有差异（exit 1）；后者仍 `20405` 字节 |
| overrides 收编 | `grep -c "覆盖 [0-9]" …/implementing/heavy/overrides.md` | `2`（编号 1、2 连续）；含「覆盖上文」 |

## 3. 档案与文档

| 判据 | 命令 | 实测 |
|---|---|---|
| 档案角色列 | `grep -c "heavy 主 skill" …/ATTRIBUTION.md` | `2`（accepting / archived） |
| 不再注入标注 | `grep -n "不再注入" …/ATTRIBUTION.md` | 命中 executing-plans 行（第 28 行）+ 总述行 |
| 说明书新节 | `grep -c "本仓实施模式" docs/architecture/project-manual.md` | `2`（节标题 + 变更记录） |
| 单一真相源 | `grep -c "本仓实施模式" docs/architecture/prompt-context-layering.md` | `0` |

## 4. 回归与影响面

| 命令 | 期望 | 实测 |
|---|---|---|
| `npx vitest run tests/prompt-tiers.test.ts` | 全绿 | 37 passed |
| `npx vitest run tests/stage-prompts.test.ts` | 全绿 | 38 passed |
| `npx vitest run tests/prompt-baseline.test.ts` | 全绿（基线已重刷） | 15 passed |
| `npx vitest run tests/kb-prompt-wiring.test.ts` | 全绿 | 9 passed |
| `npx vitest run tests/task-card.test.ts` | 全绿 | 4 passed |
| `npx vitest run tests/prompt-path-probe-tools-surface.test.ts` | 全绿 | 通过（含 specimen 组） |
| **P1 基线 12 键逐键比对** | 只 `implementing/heavy` 变 | `implementing/heavy 23852 → 4656`；其余 11 键逐字节相等 |
| `npx vitest run`（全量） | 失败数 ≤ 开工前 | **18 failed / 7152 passed**（开工前同为 18；本需求引入 0 条；2026-10-06 基线 68） |
| `pnpm typecheck` | exit 0 | exit 0（error TS 0 条） |

## 5. 留档承诺

| 判据 | 命令 | 实测 |
|---|---|---|
| 本需求对 vendor 的改动面 | `git diff --name-only -- src/domain/prompt/vendor/superpowers/` | 9 份有改动，其中**只有 `ATTRIBUTION.md` 属本需求**（§2 角色列 + §3 镜像清单）；其余 8 份为**前一需求（REQ-261008143952-65dd 上游同步）留在工作树的改动**，本需求未触碰 |
| executing-plans 留档未动 | `wc -c …/vendor/superpowers/executing-plans/SKILL.md`；`diff -q` 对本地 v6.4.2 checkout | `20405`；`diff -q` 无输出（与本地上游 checkout 逐字节一致） |
| 自写档确实不是它 | `diff -q fragments/implementing/heavy.md vendor/superpowers/executing-plans/SKILL.md` | 有差异（exit 1） |

## 6. 覆盖标注（逐卡 covers）

> 口径：每张卡（7 父卡 + 19 子卡 = **26** 张）都要有测试文档里的 `covers:` 标注；
> 下面逐卡一行（一行一个 id，便于机械解析）；子卡与父卡共用同一组证据（子卡是父卡的三阶段链）。

| 卡 | 角色 | covers 标注 | 接收证据 |
|----|------|------------|---------|
| t1 退出镜像表 | 父卡 | covers: t-1a2d1e | §1 映射 keys + §4 prompt-tiers 37 passed |
| t1 退出镜像表 | 研发子卡 | covers: t-a57dfe | §1 映射 keys / grep 0 命中 |
| t1 退出镜像表 | 复核子卡 | covers: t-f058bc | §1 两处副本一致 + §4 镜像组收敛 |
| t1 退出镜像表 | 测试子卡 | covers: t-65bef2 | §4 全量失败数 = 开工前 18 |
| t2 自写档改写 | 父卡 | covers: t-124acb | §2 注入体量与要素 + §4 stage-prompts 38 passed |
| t2 自写档改写 | 研发子卡 | covers: t-d39606 | §2 上游残留 0 + 九节齐备 |
| t2 自写档改写 | 复核子卡 | covers: t-2ec328 | §2 diff 有差异 + vendor 20405 未动 |
| t2 自写档改写 | 测试子卡 | covers: t-ce9c5b | §2 五条关键词在场 + 体量 4656 |
| t3 overrides 收编 | 父卡 | covers: t-22daf4 | §2 覆盖条目 2 + 覆盖上文在场 |
| t3 overrides 收编 | 研发子卡 | covers: t-8029c9 | §2 10 → 2 条编号连续 |
| t3 overrides 收编 | 复核子卡 | covers: t-974263 | §2 收编映射逐条对账 |
| t3 overrides 收编 | 测试子卡 | covers: t-8aa7fa | §4 prompt-tiers ⑥ 顺序组 |
| t4 档案同步 | 父卡 | covers: t-089b64 | §3 角色列计数 2 + 不再注入标注 |
| t4 档案同步 | 研发子卡 | covers: t-bfbf64 | §3 §2/§3 两处落地 |
| t4 档案同步 | 复核子卡 | covers: t-8bf083 | §3 档案与映射表逐项一致 |
| t5 断言与探针 | 父卡 | covers: t-83bb63 | §1 探针 exit 0 + §4 kb-prompt-wiring 9 passed |
| t5 断言与探针 | 研发子卡 | covers: t-040324 | §1 三处断言同步 + task-start 0 |
| t5 断言与探针 | 复核子卡 | covers: t-cb0896 | §1 specimen 五条判据 |
| t5 断言与探针 | 测试子卡 | covers: t-6f6b9c | §4 全量失败数 ≤ 开工前 |
| t6 生成物与基线 | 父卡 | covers: t-16b1c4 | §4 12 键只 1 键变 + prompt-baseline 15 passed |
| t6 生成物与基线 | 研发子卡 | covers: t-dc0e6a | §1 check-prompt-fragments exit 0 |
| t6 生成物与基线 | 复核子卡 | covers: t-d0e219 | §4 11 键逐字节相等 |
| t6 生成物与基线 | 测试子卡 | covers: t-67da3c | §4 typecheck exit 0 |
| t7 项目说明书 | 父卡 | covers: t-ed16b0 | §3 机制备忘节在场 |
| t7 项目说明书 | 研发子卡 | covers: t-22bede | §3 单一真相源 0 命中 |
| t7 项目说明书 | 复核子卡 | covers: t-6adc96 | §3 节内容与实施档一致 |

## 7. 未覆盖项

- **语义质量**：自写档是否真的讲清本仓实施流程，机械判不了——交人工确认门。
- **真实实施链行为**：注入文本对 agent 实际行为的影响需真实跑一条链才有读数，超出本需求范围。
