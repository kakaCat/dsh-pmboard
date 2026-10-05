# REQ-261001143526-8475 拆分计划 · 技术规范自动沉淀 + 补齐打包/发版工程规范

> 目标 + 做法：把「开发完必须跑什么」从 `package.json`/`scripts` 里提出来写成规范页条目（四要素、四档时机），
> 并用**缺口驱动**把它变成自动动作：`kb-probe` 新增 K10 报缺口 → `kb-conventions-sync.mts` 生成候选骨架 →
> Agent 补「失败怎么办」+ 索引行 → K10 转绿；提示词侧 4 处接入（common floor 三句 + 三阶段各一句）。
> **零 schema 变更、既有 10 条规范语义不动、老片段除新增句子外逐字节不变。**

## 改动盘点

```
新增（3 个代码/脚本 + 1 份生成物 + 2 个测试）
├─ src/domain/knowledge/operations.ts          覆盖清单纯逻辑（表结构 / 缺口判定 / 四要素校验）
├─ scripts/kb-conventions-sync.mts             骨架生成 CLI（--write / --check）
├─ docs/knowledge/operations.tsv               覆盖清单（生成物，永不进上下文）
└─ tests/kb-operations.test.ts                 领域单测
   tests/kb-prompt-wiring.test.ts              提示词接入断言

修改（5 处，均追加式）
├─ scripts/kb-probe.mts                        +K10（覆盖度 + 四要素完整性）
├─ src/domain/prompt/fragments/common/iron-rules.md       +总纲 3 句（floor，永不裁）
├─ .../fragments/brainstorming/{light,heavy}.md           +1 句（判定标准挂可跑校验）
├─ .../fragments/design/{light,heavy}.md                  +1 句（验收口径引用 C-NN）
├─ .../fragments/implementing/{light,heavy}.md            +1 句（开工查/改完自证/收尾沉淀）
├─ docs/knowledge/conventions.md               +「## 工程操作」节（C-11…C-NN 四要素）
├─ docs/knowledge/INDEX.md                     +「## 规范」节对应行
└─ package.json / README.md / docs/architecture/project-manual.md   门禁与文档挂载

不改：台账 schema / 既有 C-01…C-10 语义 / 工具签名 / HTTP 路由 / 看板页
生成物（改动后必须重跑）：src/domain/prompt/generated/*（inline-prompt-fragments 产物）
```

## 条款覆盖对照表

| 需求条款 | 接收任务 | 覆盖说明 |
|---|---|---|
| FR-1 | t1、t5 | 四要素判定（domain）+ 规范页条目落地 |
| FR-2 | t1、t5 | 时机枚举与四档分组 |
| FR-3 | t2、t7 | 骨架生成 CLI + 收尾演练闭环 |
| FR-4 | t1、t3、t7 | 缺口判定 + K10 门禁 + 演练验证 |
| FR-5 | t4、t6 | 4 处提示词接入 + 预算/逐字节回归 |
| FR-6 | t5、t8 | 索引行与检索可达 + 门禁/文档挂载 |
| FR-7 | t6、t8 | 老行为逐字节 + 失败数基线 + 回滚说明 |

**本轮不做**：无（7 条 FR 全部有接收任务）。

## 任务表

| key | 卡 | 层/端 | 依赖 | 关键验收（可跑） |
|---|---|---|---|---|
| t1 | 覆盖清单与四要素判定（纯函数） | domain / backend | — | `npx vitest run tests/kb-operations.test.ts` |
| t2 | 同步脚本 kb-conventions-sync | scripts / backend | t1 | `--write` 连跑零差异 + `--check` 缺口非零退出 |
| t3 | kb-probe 新增 K10 覆盖度门禁 | scripts / backend | t1 | 删一条 → 非零退出并列出缺口 |
| t4 | 提示词接入（floor + 三阶段） | domain/prompt / backend | — | `npx vitest run tests/kb-prompt-wiring.test.ts` |
| t5 | 规范页工程操作节 + 索引行 | doc / doc | t2 | `npx tsx scripts/kb-probe.mts` 全过 |
| t6 | 兼容与预算回归 | test / backend | t4 | HEAD 对比逐字节 + `pnpm test` 失败数 ≤106 |
| t7 | 收尾演练（缺口→骨架→补全→绿） | test / backend | t2、t3、t5 | `pnpm run kb:check` 演练前后对照 |
| t8 | 门禁接入与文档挂载 | doc / doc | t3、t5 | `pnpm run kb:check` 退出码 0 + 文档挂载 |

## 逐卡实施与验收

### t1 · 覆盖清单与四要素判定（纯函数）

- **implementation**：新建 `src/domain/knowledge/operations.ts`：`SCRIPTS` 映射（script 名 → 时机）、`EXTRA_ENTRIES`（scripts/ 必跑入口白名单）、
  `EXCLUDED`（排除项 + **必填理由**）；`buildCoverage(scripts, extra, excluded)` → 必跑项集合；
  `findGaps(coverage, entries)` → 缺口（命令 + 建议 id）；`validateOperationEntry(entry)` → 四要素问题清单（时机枚举 / 命令 runner 与路径 / 期望锚点 / 失败怎么办指向）。
  零 I/O、零 import 外层（层边界门禁）。
- **acceptance**：`npx vitest run tests/kb-operations.test.ts` → 全绿；且 `grep -c "node:" src/domain/knowledge/operations.ts` = 0。
- **skipIntegration**：是（纯函数，无接口可联调）。

### t2 · 同步脚本 kb-conventions-sync

- **implementation**：`scripts/kb-conventions-sync.mts`：读 `package.json` 的 scripts + t1 的三张表 → 与 `docs/knowledge/conventions.md`
  的 `## 工程操作` 节比对 → `--write` 追加缺失条目骨架（命令/期望/时机自动填，「失败怎么办」留待补）+ 重写
  `docs/knowledge/operations.tsv`；`--check` 有缺口或 tsv 漂移 → 退出码 1。编号取现有 `C-NN` 最大值 +1。
- **acceptance**：`npx tsx scripts/kb-conventions-sync.mts --write` 连跑两次第二次零差异；手改一条既有条目后重跑 `--write`，该条内容不变（grep 手改字样仍在）；删一条覆盖条目后 `npx tsx scripts/kb-conventions-sync.mts --check` 退出码 1。

### t3 · kb-probe 新增 K10

- **implementation**：`scripts/kb-probe.mts` 增 K10：用法 t1 的 `buildCoverage`/`findGaps`/`validateOperationEntry`；
  判据：覆盖清单每项都能在规范页找到条目（`命令：` 文本包含该命令）+ 每条 `C-NN` 四要素齐全 + `operations.tsv` 与当次扫描一致。
  失败 → 退出码 1（无警告放过），`--json` 输出 `{ check:'K10', ok:false, detail, where }`。
- **acceptance**：删掉一条 `C-NN` 条目与其索引行 → `npx tsx scripts/kb-probe.mts` 退出码 1 且输出含 `K10` 与缺失命令；补齐后重启自检 `npx tsx scripts/kb-probe.mts` 退出码 0。

### t4 · 提示词接入（floor + 三阶段）

- **implementation**：`fragments/common/iron-rules.md` 加 3 句总纲（开工前 `reqboard_kb(kind='standard')` 查规范 / 改完按条目自证 / 收尾沉淀新规范并跑 `kb:check`）；
  `fragments/{brainstorming,design,implementing}/{light,heavy}.md` 各加 1 句阶段专属（需求：判定标准挂可跑校验；设计：验收口径引用 `C-NN`；实施：开工查·改完自证·收尾沉淀）。
  改完必须重跑 `node scripts/inline-prompt-fragments.mjs`。
- **acceptance**：`node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs` 退出码 0；`npx vitest run tests/kb-prompt-wiring.test.ts tests/prompt-gates.test.ts` 全绿（三阶段合成文本各含 `reqboard_kb`、总字符 ≤ DEFAULT_PROMPT_BUDGET、floor 未被裁）。

### t5 · 规范页工程操作节 + 索引行

- **implementation**：在 `docs/knowledge/conventions.md` 加 `## 工程操作 #operations` 节：时机四档说明 + `C-11…C-18` 八条（typecheck / build:client / verify:client / 提示词重生成 / kb:build+check / test / build+typecheck 发版前 / sync-to-github）；
  每条四要素齐全；在 `docs/knowledge/INDEX.md` 的 `## 规范` 节补对应索引行（`kb-conventions-c-NN · standard · … · → conventions.md#c-nn`）。
- **acceptance**：`npx tsx scripts/kb-probe.mts` 退出码 0（九项 + K10 全过）；`grep -c "^### C-" docs/knowledge/conventions.md` ≥ 18；`grep -c "kb-conventions-c-1" docs/knowledge/INDEX.md` ≥ 8。
- **skipIntegration**：是（纯文档）。

### t6 · 兼容与预算回归

- **implementation**：用 HEAD worktree 对比法验证「老片段除新增句子外逐字节不变」；跑全量测试记录失败数；核对 `kb-probe` 的 K1/K3（索引与页面预算）。
- **acceptance**：`git worktree add -d /tmp/kb-base HEAD` 后两侧各跑一次 `resolveStagePrompt` 合成，diff 仅出现在新增句子处；`pnpm test` 失败数 ≤ 106；`pnpm run kb:check` 退出码 0。

### t7 · 收尾演练（缺口→骨架→补全→绿）

- **implementation**：演练脚本或手工：删掉 `conventions.md` 里一条 `C-NN` 与其索引行 → 跑 K10（应红）→ 跑 `--write`（生成骨架）→ 按骨架补全四要素 → 跑 `kb:check`（应绿）；全程留档。
- **acceptance**：演练四步的退出码依次为 1 → 0（骨架生成）→ 0（补全后自检）→ 0（`pnpm run kb:check`）；索引 `## 规范` 节行数恢复原值；证据留档 `evidence/t7-drill.txt`。

### t8 · 门禁接入与文档挂载

- **implementation**：`package.json` 增 `kb:conventions`（`tsx scripts/kb-conventions-sync.mts --check`）并把它并进 `kb:check`；
  `README.md` 的「项目知识层」章补「工程操作」一段与命令；`docs/architecture/project-manual.md` 知识层章补一行指向工程操作条目；把拆页判据写进 `docs/knowledge/conventions.md` 的说明。
- **acceptance**：`pnpm run kb:check` 退出码 0；`grep -c "kb-conventions-sync" package.json README.md` 两者均 ≥1；`grep -c "工程操作" docs/architecture/project-manual.md` ≥1。
- **skipIntegration**：是（文档与脚本接线）。

## 风险与对策

| 风险 | 触发信号 | 对策 |
|---|---|---|
| 规范页超 200 行 | `kb-probe` K3 红 | 按数据模型的拆页判据把 `## 工程操作` 拆到 `operations.md`，索引行改指新页 |
| 排除表被滥用 | 有人把必跑项塞进 `EXCLUDED` | `EXCLUDED` 条目**必填理由**，空理由即抛错（t1 单测锁死） |
| 骨架覆盖手写内容 | 重跑 `--write` 把人工补的措辞冲掉 | 按条目 id 判定，已有条目一字不改（t2 验收锁死） |
| 提示词预算超限 | `prompt-gates` 红 | 4 处新增合计 ≤900 字符；超限则只在 floor 保留总纲 |
| 门禁自己坏掉 | K10 恒绿 | 演练（t7）必须演示"删一条即红" |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 交棒；未获批准不得落库。
