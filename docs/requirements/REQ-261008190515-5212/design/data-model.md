---
serves: FR-1, FR-3, FR-4, FR-5
---

# 数据模型设计 — 把 implementing 移出 vendor 镜像并改写自写实施档 `serves: FR-4`

> **不适用：本需求不改表、不改 schema、不增删运行时数据结构**（无数据库、无持久化字段变更）。
> 本文登记的是本仓提示词链路上的**四份"数据"**：分片记录（生成物）、镜像映射表、P1 基线快照、
> 上游来源档案。它们都有确定的字段/键形态，改动必须逐字段说清——因为它们的**一致性**由门禁守护。

## 数据结构清单 `serves: FR-4`

| # | 数据结构 | 载体 | 读它的东西 | 本次是否变 |
|---|---|---|---|---|
| DS-1 | 分片记录 `FragmentRecord` | `src/domain/prompt/generated/fragments.ts`（生成物） | `resolveStagePrompt` | 值变（`implementing/heavy` 与 `implementing/heavy/overrides` 两条记录） |
| DS-2 | 镜像映射表 `VENDOR_MAIN_SKILLS` | `scripts/inline-prompt-fragments.mjs` + `tests/prompt-tiers.test.ts` 副本 | 生成器、门禁、测试 | **结构变**（3 项 → 2 项） |
| DS-3 | P1 注入基线快照 | `tests/fixtures/stage-prompts-baseline-p1.json` | `tests/prompt-baseline.test.ts` | 值变（1 / 12 键） |
| DS-4 | 上游来源档案 | `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` | 人读 + `tests/prompt-tiers.test.ts` 断言 | 值变（1 行角色列 + §3 清单） |

## DS-1 分片记录 FragmentRecord `serves: FR-4, FR-5`

生成物里的每条形如 `{ id, stage, difficulty, category, priority, text }`（`include` 仅路由壳有）。
本次受影响的**恰好两条**：

| 字段 | `implementing/heavy` | `implementing/heavy/overrides` |
|---|---|---|
| `id` | 不变 | 不变 |
| `stage` | 不变（`implementing`） | 不变 |
| `difficulty` | 不变（`heavy`） | 不变 |
| `category` | 不变（`*`） | 不变（`*`） |
| `priority` | 不变（`floor`） | 不变（`floor`） |
| `text` | **变**：vendor 原文（20,405 字符）→ 自写档（≤ 5,500 字符） | **变**：10 条 → 2 条（4,058 字节 → ≤ 800 字符） |

**约束（写在类型层之外的门禁里）**：

- 元数据由 `parseFragmentId(id)` **从路径推导**，不手写——所以"改档"必须改对**文件名位置**：
  自写档只能落在 `implementing/heavy.md`（floor），不得落到 `implementing/heavy-extra.md`（`priority=10`，可裁）
  或类型档槽（`priority=10`）；
- `text` 由构建器从磁盘读入，逐字节内联进生成物——**手改生成物会被门禁①当场打回**。

**判据**：`npx vitest run tests/prompt-tiers.test.ts`（floor 组 + ④ 组 + ⑥ 组）绿。

## DS-2 镜像映射表 `VENDOR_MAIN_SKILLS` `serves: FR-1, FR-4`

| 字段 | 类型 | 约束 | 本次变化 |
|---|---|---|---|
| 键 = `stage` | `implementing` / `accepting` / `archived` 的子集 | 键必须是 `STAGES` 里的合法节点；删键即"该节点 heavy 不再与 vendor 逐字节绑定" | **删 `implementing`** |
| 值 = vendor skill 名 | `string` | 必须存在 `vendor/superpowers/<value>/SKILL.md` | 不变（`accepting` / `archived` 两项） |

**两处副本必须逐字相同**：脚本（唯一事实源）与 `tests/prompt-tiers.test.ts`（测试不许 import 脚本，
故抄一份）。**分叉的后果**：门禁按脚本判、测试按副本判——一边绿一边红，或两边都绿却指的不是同一件事。

**为什么不改成"对称表"（保留键、值为空）**：空值会引入第三种状态（"在映射但没镜像"），
让④组遍历逻辑出现分支；删键是唯一形态，语义也最准（不在映射 = 不做逐字断言）。

## DS-3 P1 注入基线快照 `serves: FR-4`

| 项 | 值 |
|---|---|
| 形态 | `Record<string, string>`，键 = `<stage>/<difficulty>`，值 = 该组合的完整注入文本（逐字、不 trim） |
| 键集合 | 12 键（六节点 × light/heavy），由 `tests/prompt-baseline.test.ts` 断言排序后相等 |
| 本次变化 | `implementing/heavy`：23,852 字符 → ≤ 7,700 字符；**其余 11 键逐字节不变** |
| 产出 | `node scripts/dump-stage-prompts.mjs`（幂等：连跑两次输出逐字节一致） |
| 兼容 | 快照不是"不许变"的锁，而是"变了必须显式更新"的锁；本次变化即显式更新 |

**影响面哨兵**：11 键的"不变"是本设计的重要断言——它证明改动**没有越界**（没顺手动别的节点、
没动 `common/iron-rules`）。若第二键变，先查改动地图，不要直接重刷基线（重刷 = 把缺陷固化）。

## DS-4 上游来源档案（ATTRIBUTION） `serves: FR-1, FR-4`

| 表 | 字段 | 本次变化 |
|---|---|---|
| §2 落盘清单 | `skill` / `字节数` / `行数` / `本仓角色` | 只改 executing-plans 行的**角色列**；字节数（20405）/ 行数（373）**不变** |
| §3 镜像关系 | 映射清单（人读镜像说明） | 3 项 → 2 项 + 一行"implementing 于 2026-10-08 移除" |
| §1 来源表 | repo / 引用 / commit / tag / 许可 / 抓取时点 / 抓取方式 / 核对 | **不变** |
| §4 许可原文 | MIT 全文 | **不变** |

**约束**：§3 的人读清单必须与 DS-2 的机器映射**逐项一致**——档案写 3 项而代码只剩 2 项，
就是"档案失实"，而现有门禁查不出人读段落（故本设计把这条列成人工核对项）。

## 迁移与兼容 `serves: FR-4`

| 问题 | 答案 |
|---|---|
| 有表 / schema 变更吗？ | **没有**。本需求零数据库、零持久化字段。 |
| 需要数据回填 / 迁移脚本吗？ | **不需要**。唯一"迁移"是重新生成构建期产物（`generated/fragments.ts`）与重刷快照。 |
| 存量需求受影响吗？ | 不受影响。快照与断言同批更新；`requirements` 台账、任务卡、RTM 一律不碰。 |
| 运行时会读 vendor 目录吗？ | 不读。注入文本构建期已内联进生成物，`vendor/` 只是留档。 |
| 需要灰度 / 开关吗？ | 不需要。这是**语义修正**而非灰度变更：留开关等于留一条无人验证的路径。 |

## 回滚路径 `serves: FR-4`

```bash
# 回滚 = 回到改动前提交（本需求不产生运行时数据，故无数据回滚）
git revert <本次提交>          # 或 git checkout <before> -- <受影响文件>
node scripts/inline-prompt-fragments.mjs   # 生成物回到镜像态
node scripts/dump-stage-prompts.mjs        # 快照回到 23,852 字符态
node scripts/check-prompt-fragments.mjs    # 必须 exit 0（回到"implementing 在映射内"的自洽态）
```

**回滚的完整条件**：四类文件（源 + 映射表 + 生成物 + 快照）**同批回退**。
只回退其中一部分 → 门禁或测试必红（这正是"不一致必然可见"的设计意图）。
`vendor/` 原文从未改动，故回滚不涉及它。

## 关键决策与取舍 `serves: FR-1, FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 映射表形态 | 保留 `implementing` 键、值为 `null` / 空串表示"不镜像" | 删键 | 空值引入第三种状态，让遍历逻辑出现分支；"不在表里"本身就是最准的语义 |
| 快照更新方式 | 直接重刷 12 键（不比对） | 重刷 + 逐键比对（只允许 1 键变） | 不比对就丢掉了"影响面哨兵"——越界改动会被静默固化 |
| 档案与映射表的一致性 | 写个脚本自动从映射表生成 §3 | 人读档案手写 + 人工核对项 | 档案含来源/许可/字节数等非映射内容，自动化收益小于引入生成器的成本（YAGNI）；一致性由"改动地图同批"保证 |
| 数据类型 | 新建 `PromptFragment` 类型层校验 | 沿用既有生成物结构，不加类型 | 元数据由路径推导、文本由磁盘读入，已有门禁足够；新增类型层是第二真相源 |

## 技术方案与亮点 `serves: FR-1, FR-4`

- **四份数据的"一致性"比任何一份的内容更重要**：本设计把 DS-1~DS-4 的字段变化列成矩阵，
  是为了让"同批改"可核对，而不是让每份各自演进。
- **无迁移是刻意的**：能不动数据结构就不动。挂在这个需求上的"顺手改成带开关的镜像机制"已被否掉。
- **回滚只需一次 revert**：零运行时数据 ⇒ 回滚是无状态操作。
