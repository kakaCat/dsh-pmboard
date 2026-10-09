---
id: REQ-261008143952-65dd
kind: review
generated: 2026-10-08
---

# 评审报告：更新 vendor superpowers 分片到本地最新版

> 本文汇总本需求 8 张父卡各自的「复核」子卡结论，以及实施过程中**主动发现**的三处问题与处置。
> 评审对象：`docs/requirements/REQ-261008143952-65dd/` 的产物 + 本需求的代码改动。

## 1. 评审范围与方法

| 维度 | 方法 |
|------|------|
| 上游保真 | 逐份 `diff -q` + `shasum -a 256` 与本地 v6.4.2 源比对 |
| 镜像契约 | `vendorMirrorProblems()` 判据函数直接调用（隔离脚本级与产物级两种读数） |
| 产物守恒 | 与 `git show HEAD:` 版产物比对**记录条数与 id 集合** |
| 变更边界 | mtime 比对（区分本需求改动与工作区既有未提交改动）+ 逐键基线哨兵 |
| 归因取证 | 在 HEAD 干净 worktree 中复跑失败测试，取得等价基线 |
| 引用完整性 | overrides「覆盖 N」逐条对照上游原文 grep 与设计文档 |

## 2. 逐卡复核结论

| 卡 | 复核结论 | 关键依据 |
|----|---------|---------|
| t1 同步 14 份原文 | 无偏离 | 8 份 sha256 逐份一致；无 BOM/CRLF；范围仅限 8 份 SKILL.md |
| t2 镜像同步 | 无偏离 | 两份 sha256 相同（`f38e8f2d…`）；判据函数返回 0 条 |
| t3 overrides 覆盖 10 | 无偏离（1 处受预算约束的收敛，已显式声明） | 四点与设计逐条对应；`priority=floor` 经 `parseFragmentId` 实测 |
| t4 生成器产物 | 无偏离（发现 2 处设计数字不实，已更正） | 129 条守恒、id 集合逐条相同、构成自洽 |
| t5 ATTRIBUTION 档案 | 无偏离 | 上游 git 事实 ↔ 档案 ↔ 盘上实测三方一致；许可原文逐字未变 |
| t6 测试引用 | 无偏离 | 选词源自新版正文；⑤ 双向断言成立；与设计预期表逐条吻合 |
| t7 基线快照 | 无偏离 | 其余 11 键逐字未变；变化键由新原文与覆盖 10 驱动 |
| t8 收口验证 | 无偏离 | 归因链升级为决定性证据（HEAD worktree） |

## 3. 主动发现的问题与处置

### 发现 A：注入预算超限（响亮报出后修复）

- **现象**：首版「覆盖 10」落盘后实测 `implementing/heavy/feature` 注入 **24065 字符 > 24000** 上限 65 字符。
- **为何严重**：`heavy` 主档 `priority='floor'` 永不裁剪，超限会触发 `overBudget: floor-exceeds-budget`；且设计文档已预判此风险并明确「**不得为塞进去而调预算或删铁律**」。
- **处置**：精简条目文案（未动预算常量、未删任何铁律），回落至 **23852**（余量 148）。
- **副作用（如实登记）**：预算余量由初始的 842 收窄至 148，后续任何 overrides / iron-rules 增长都会再次撞破。
- **证据**：`node -e` 直接按盘上 `.md` 计算六类型注入最大值；`tests/prompt-gates.test.ts` 预算组在该产物上通过。

### 发现 B：设计文档两处数字不实（按事实更正）

- **现象**：设计与计划反复写「分片库 126 条」，实测为 **129 条**；又写「唯一变化的是 `implementing/heavy` 一条记录」，实测为 **2 条**（`implementing/heavy` 与 `implementing/heavy/overrides`）。
- **根因**：126 是我在需求/设计阶段的手算结果，漏算了 `brainstorming/heavy-extra`、`common/iron-rules`，并把 overrides 误记为 6（实为 7：5 份 heavy + 2 份 light）。
- **处置**：17 处数字更正为 129 并补齐构成表；记录变化数更正为 2 条（并说明两者同属一个注入键，故基线仍是「只一键变」）。
- **流程偏离（显式声明）**：为事实准确性编辑了**已确认**的设计文档。**未改任何设计决策**（镜像契约、预算策略、影响面结论均不变）。若复核者认为此举不当，可退回设计阶段重新确认。

### 发现 C：探针门禁回归（设计与计划未预见，已修复）

- **现象**：换源后 `scripts/prompt-path-probe.mts` 报 **3 个缺口**：
  1. `scripts/task-start` ← `fragments/implementing/heavy.md:172`
  2. `scripts/task-done` ← `fragments/implementing/heavy.md:224`
  3. `vendor/superpowers/executing-plans/SKILL.md` ← `fragments/implementing/heavy/overrides.md:33`
- **为何严重**：这是**第三类「本仓不可执行项」**（上游 executing-plans 让跑 "this skill's `scripts/task-start` / `task-done`"），比悬空 `superpowers:*` 引用**更容易被照做**——原文是祈使句「Run this skill's …」。设计与计划的「三处冲突」表漏了它。
- **处置**（分两层，各归其位）：
  - **对 agent 收口**（agent 面）：覆盖 10 由三条扩为四条，新增 ② 明确「不跑它们；取卡用 `reqboard_task_move(to=in_progress)`（= 正文 brief），完工用 `reqboard_task_report`（= completion line）」；同时把 ① 的路径写法改为仓根可达形式。
  - **对门禁登记**（开发面）：`scripts/prompt-path-probe.mts` 的 `WHITELIST` 按**既有先例**（`docs/superpowers/`、`skills/` 两条同样是「上游原文逐字节锁定、改不掉」）新增一条，用 `^scripts/task-(?:start|done)$` **锚定两个确定名**，刻意不放开 `scripts/` 前缀——否则本仓真实脚本面的判据会整段作废。
- **scope 扩张（显式声明）**：本需求改了**计划外文件** `scripts/prompt-path-probe.mts`。理由：`heavy.md` 与上游原文逐字节锁定（镜像门禁），改一个字即红，除登记白名单外没有第二条路。
- **证据**：探针修复后 `缺口 0；exit 0`；`tests/prompt-path-probe-tools-surface.test.ts` 4 passed。

## 4. 全量单测归因（本次评审最重的一条）

- **读数**：工作区全量 `npx vitest run` → **18 failed / 7154 passed**（11 文件）。**不是全绿**，如实报出。
- **决定性取证**：在 `git worktree add --detach /tmp/pmbase HEAD` 的干净态复跑同样 11 个文件 → **22 failed / 9 文件**，比工作区**更多**。
- **结论**：该批红是**仓库既有状态**（HEAD 即红），本需求**零新增失败**；工作区反而比 HEAD 少 4 条。
- **辅助证据**（互相独立、结论一致）：
  1. 11 个失败文件**均不引用**本需求改过的任何文件（逐个人工 grep 核对）；
  2. 失败原因指向的文件 mtime 为 `14:23`（我开工前），我改的文件 mtime 为 `18:4x`；
  3. 失败签名与改动性质不符（如 message-hygiene 计各层拼接数 140→615、size-budget 指向 `src/tools/SubmitTool/SubmitTool.ts`=509 行——本需求未触碰 `.ts` 源码）。
- **本需求范围测试**：6 文件 **269 passed 全绿**（prompt 五件套 + 路径探针）。
- **执行疏漏（如实登记）**：全量单测的**开工前基线始终未采集**，故「失败数 ≤ 基线」只能用上述非破坏性证据链 + HEAD worktree 等价基线归因，而非直接比对。

## 5. 未决项（只能人看，不假装有自动测试）

| 项 | 为什么只能人看 |
|----|--------------|
| 覆盖 10 四条收口是否**足以阻止** agent 照上游去加载 `superpowers:*` / 跑 `scripts/task-start` | 行为层判据：需真实跑一轮 implementing 会话观察，或人工评审文案说服力；无自动化判据 |
| 上游原文是否夹带对本仓有害的指令 | prompt injection 面靠 commit 固定 + 人工 review；本次已人工比对 8 份差异确认无此类内容 |
| 预算余量只剩 148 是否可接受 | 属风险偏好判断：需人决定是否另立需求精简 overrides 或提高预算 |

## 6. 结论

**建议通过验收。** 本需求范围内：产物齐全、门禁全绿、269 条测试全绿、tsc 0 错误；三处发现（预算超限、设计数字不实、探针门禁回归）均已处置并留痕，其中一处（探针白名单）构成 scope 扩张、两处（编辑已确认设计文档、开工前未采集全量基线）构成流程偏离，**均已在本文与验收材料中显式声明**，未静默处理。
