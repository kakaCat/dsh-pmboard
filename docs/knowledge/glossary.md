# 术语表（项目知识层 · 术语页）

> **TL;DR**：本仓的领域词在这里对齐口径——**同一件事只有一个叫法**。
> 读需求/任务卡遇到生词先查这里；新造词请顺手补一行（并在索引 `## 术语` 节登记）。

## 术语表 #terms

| 术语 | 一句话定义 | 落在哪 |
|---|---|---|
| 需求（REQ） | 一件被立项的工作，从 draft 走到 done | 台账 `requirements[]`、`docs/requirements/<REQ>/` |
| 阶段（stage） | 需求生命周期的一段：brainstorming / design / decomposing / implementing / accepting / archived | `src/domain/requirement/RequirementStatus.ts` |
| 人工门 | 必须由人裁决的节点：立项 / 需求确认 / 设计确认 / 计划批准 / 验收 | `src/application/gate/*` |
| 产物（artifact） | 阶段交付物：需求文档 / 设计文档 / 拆分计划 / 验收材料 / 归档材料 | `reqboard_submit(kind=…)` |
| 条款（FR-N） | 需求文档里可被机械识别、且必须被任务卡接收的功能点 | 需求文档「功能点」节 |
| 任务卡 | 拆分后的可执行单元；分父卡与子卡 | `docs/requirements/<REQ>/tasks/<id>.md` |
| 父卡 / 子卡链 | 父卡承载业务目标，子卡按阶段承载（研发→联调→复核→测试） | 看板任务页 / `reqboard_task_tree` |
| 存量卡 | 没有父卡归属的旧式任务卡，走五段状态机（todo→in_progress→testing→in_review→done） | 同上 |
| 验收单 | 提交验收材料时由代码生成的逐项确认清单 | `reqboard_accept_sheet` |
| 节点边界 | 会话被遗弃/换节点时，模型可见面被重置的那个时刻 | `src/application/internal/node-input-package.ts` |
| 节点输入包 | 节点边界后的唯一新起点：路由提示词 + 需求文档投影 + 台账投影 | 同上 |
| 断点 | 记录"跑到哪、下一步干嘛"的一行状态，供新窗口续跑 | `src/domain/checkpoint.ts`、`reqboard_task_amend(op=interruption)` |
| Dive 模式 | 需求 armed 后由系统自动起轮推进的托管模式 | `src/application/dive/*` |
| 台账（ledger） | 需求与门户记录的**分片目录**事实源（只经端口读写；数据根 `~/.dsh/reqboard/`） | `src/application/ports.ts`（`RequirementStore`）· `src/repositories/ShardedRequirementStore.ts` |
| 文档库 | 工作区文件读写端口（产物落盘、存在性校验的唯一入口） | `adapters/FileDocRepository.ts` |
| 注入预算 | 每次注入提示词的字符上限；floor 片段永不裁剪 | `src/domain/prompt/budget.ts` |
| 知识层 | 本目录：索引 + 页面 + 条目 + 机器索引 + 生成器 + 自检 | `docs/knowledge/`、`src/domain/knowledge/*` |
| 知识索引 | 认知入口 `INDEX.md`：一行一条指针（≤8000 字符 / 200 行） | `docs/knowledge/INDEX.md` |
| 条目（kb-NNNN） | 一条短结论：结论/适用条件/证据/失效条件 + 指向原文 | `docs/knowledge/entries/` |
| 页面小节（kb-&lt;页面&gt;-&lt;锚点&gt;） | 页面里的一节，可被按 id 单独取出 | `architecture.md#layers` 等 |
| 机器索引 | 不进上下文的 TSV（全量符号 / 全量类名），只由工具检索 | `code-map.symbols.tsv`、`design-tokens.classes.tsv` |
| 生成区 | INDEX 里由生成器维护的标记块，手写行永不被覆盖 | `<!-- kb:generated:begin/end -->` |
| 死链 / 孤儿 / stale / 漂移 | 知识层四类腐烂：指针不存在 / 条目不在索引 / 过期未复核 / 生成物被手改 | `scripts/kb-probe.mts` |

## 口径约定 #conventions

- **同义不同名要合并**：遇到"卡片 / 任务 / task"这类混用，一律收敛到"任务卡"。
- **能力名用动宾**：工具名用 `reqboard_<动作>`（如 `reqboard_kb`），阶段名用英文枚举。
- **数字口径写单位**：预算一律写"字符数"（不是字节数），行数按 `\n` 计。
