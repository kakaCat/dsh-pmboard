---
req: REQ-261001143526-8475
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 测试策略 · 八条断言怎么跑、看到什么算过（REQ-261001143526-8475）

> **TL;DR**：原则**修前必红、修后必绿**。分三层：domain 单测（覆盖清单与四要素判定）、
> 脚本门禁（覆盖度 / 骨架确定性 / 四要素完整性）、集成与回归（提示词接入、预算、老行为逐字节不变、收尾演练）。

## 断言与用例对照 `serves: FR-1, FR-2, FR-3, FR-4`

| 需求断言 | 测试 | 命令 | 通过条件 |
|---|---|---|---|
| A1 工程操作条目化 | T3 | `npx vitest run tests/kb-operations.test.ts` | `## 工程操作` 节存在且覆盖清单 8 类动作各一条 |
| A2 每条命令真能跑 | T4 | `npx tsx scripts/kb-conventions-sync.mts --check` + 抽 5 条实跑 | 命令存在；抽查 5 条退出语义与条目「期望」一致 |
| A3 覆盖度机器可查 | T1、T2 | `npx tsx scripts/kb-probe.mts` | K10 通过；人为删一条 → 非零退出并列出缺口 |
| A4 提示词接入 | T5 | `npx vitest run tests/prompt-gates.test.ts tests/kb-prompt-wiring.test.ts` | 三阶段合成文本各含 `reqboard_kb`；预算内、floor 未裁 |
| A5 自动沉淀演练 | T8 | 演练脚本 + `pnpm run kb:check` | 收尾后知识库多出 ≥1 条 `C-NN` 且索引 +1 行；`kb:check` 退出码 0 |
| A6 沉淀必须可验 | T6 | 故意写缺「期望」的条目 → 跑自检 | 非零退出并指出 `C-NN` |
| A7 零回归 | T7 | HEAD worktree 对比 + `pnpm test` | 除新增句子外注入逐字节不变；失败数 ≤ 106（基线） |

## T1–T3 · 覆盖清单与条目判定（domain 单测） `serves: FR-3, FR-4`

| 用例 | 输入 | 期望 |
|---|---|---|
| T1 覆盖清单构建 | `package.json` 夹具 + `EXTRA_ENTRIES` + `EXCLUDED` | 必跑项集合确定；`EXCLUDED` 缺理由 → **抛错** |
| T2 缺口判定 | 清单里有 `pnpm build:client`、规范页无对应条目 | 判定为缺口，输出含命令与建议 id（`kb-conventions-c-NN`） |
| T3 四要素校验 | 缺 `- 期望：` / 时机写「随便」/ 命令非 runner 起头 | 逐条报错并带条目 id；合法的四要素通过 |

**修前必红**：T1–T3 依赖 `src/domain/knowledge/operations.ts`（尚不存在）→ import 失败即全红；
实现后全绿。这是本需求"修前必红"的最低标准。

## T4–T6 · 脚本门禁 `serves: FR-1, FR-2, FR-3, FR-4`

| 用例 | 步骤 | 期望 |
|---|---|---|
| T4 骨架生成确定性 | `kb-conventions-sync --write` 连跑两次 | 第二次零差异（无 `（待补…）` 之外的随机/时间内容）；已有条目一字不改 |
| T5 只加不改 | 手改一条既有条目 → 再跑 `--write` | 该条**保持手改内容**（不覆盖）；缺口条目照常补 |
| T6 缺校验即红 | 造一条无「期望」的条目 → `kb-probe` | 非零退出 + `K10` + 条目 id；补全后转绿 |
| T6b `--check` 漂移 | 手改 `operations.tsv` 一行 → `kb-conventions-sync --check` | 非零退出并指出漂移 |

## T7–T8 · 集成与回归 `serves: FR-5, FR-6, FR-7`

| 用例 | 步骤 | 期望 |
|---|---|---|
| T7 提示词接入 | `resolveStagePrompt({stage:'brainstorming'|'design'|'implementing'})` 合成文本 | 三段各含 `reqboard_kb`；`prompt-gates` 全绿（≤ `DEFAULT_PROMPT_BUDGET`、floor 未被裁） |
| T7b 老行为逐字节 | HEAD worktree 对比同一输入的合成文本 | 除新增句子外的部分**逐字节相同**（差分只出现在预期位置） |
| T8 收尾演练 | 删掉一条 `C-NN` 与其索引行 → 跑 K10 → `--write` → 补全 → `kb:check` | 缺口出现→骨架生成→补全→**退出码 0**；索引行恢复 |
| T8b 索引与预算 | 演练后统计 | 索引 ≤8,000 字符 / ≤200 行；`conventions.md` ≤200 行；`kb-probe` K1/K3/K5 全绿 |
| T8c 检索可达 | `reqboard_kb(kind='standard', query='打包')` | 命中 ≥1 条（含"打包/构建"的操作条目） |

## 门禁接入 `serves: FR-4, FR-7`

| 门禁点 | 命令 | 说明 |
|---|---|---|
| 单测 | `npx vitest run tests/kb-operations.test.ts tests/kb-prompt-wiring.test.ts` | 新增 2 个测试文件 |
| 知识层 | `pnpm run kb:check` | 既有 K1–K9 + **新增 K10** |
| 生成物 | `npx tsx scripts/kb-conventions-sync.mts --check` | 覆盖清单与骨架漂移 |
| 提示词 | `node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs` | 片段改动后必须重生成并校验 |
| 类型 | `pnpm typecheck` | 新增模块 0 错误 |
| 规模回归 | `pnpm test` | 失败数不高于基线 106 |

## 与验收材料的关系 `serves: FR-4, FR-5`

验收证据 = ① `kb-probe --json` 输出（含 K10）② `kb-conventions-sync --check` 输出 ③ 三阶段合成文本片段（含新增句子）
④ T8 收尾演练的前后对照（缺口 → 骨架 → 补全 → 绿）⑤ `pnpm test` 与 HEAD 基线的失败数对比（≤106）
⑥ 规范页新增条目截图/摘录（含四要素）。
