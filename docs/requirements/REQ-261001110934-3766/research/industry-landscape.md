# 业界调研：面向 AI Agent 的「代码知识库 / 少 token 快速理解项目」

> 需求：REQ-261001110934-3766 · 调研日期：2026-10-01 · 所有结论附来源链接
> 口径：来源分两类——**一手来源**（官方文档/规范/论文原文，标注「已核实」）与
> **二手转述**（博客/二手整理，标注「转述」）。查不到的写「未查证」，不编造。

## TL;DR（一页结论）

1. **主流不是「把代码库做成向量库」，而是「索引 + 指针 + 按需取」**：Aider 发的是 1k token 的符号骨架，
   Anthropic 明确把「轻量标识符（路径/查询/链接）+ 运行时按需加载」当作 agent 上下文工程的正解。
2. **预算是一等公民**：Aider `--map-tokens` 默认 1k；`llms.txt` 的纪律是「文件本身小到能进上下文，细节在链接后面」。
3. **短而命中胜过全而全塞**：Chroma 的 context rot 报告与 Anthropic 转述都指向——token 越多，召回越差。
4. **知识要有写入者与读取者**：ADR / known-issues / 复盘这类「结论型文档」能被 Agent 消费，前提是有人在流程里写、
   有工具能取；仅有一份模板等于没有知识库。
5. **对本地插件可行的最小形态**：`INDEX.md`（≤8K 字符入口）+ 条目（短、带指针、带失效条件）+ 确定性生成的
   代码地图 + 只读检索工具 + 死链/超预算自检。
6. **两条成本杠杆容易被忽略**：① prompt caching 按**前缀**命中（Anthropic 无分段缓存；OpenAI 省 50%；
   DeepSeek 谷时 ≈1/50），所以「稳定、少动、常驻的索引」其实很便宜，而**频繁改动会让缓存反复失效**；
   ② 工具 schema 是**每轮常驻成本**（未懒加载的 MCP 反例是每会话 120K token），新增工具必须短。
7. **「只加载目录」是主流做法**：Claude Code skills 启动只载 name+description（单条 ≤1536 字符、总预算 ≈ 上下文 1%），
   正文命中才载；Devin Knowledge 也迁移成同一形态（`SKILL.md` 的 description 决定何时加载）。

## 六条主线

| # | 主线 | 代表 | 核心机制 | 一手/二手 |
|---|---|---|---|---|
| 1 | 仓库地图 | Aider repo map | 符号骨架 + 依赖图排序，装进固定 token 预算 | 已核实 |
| 2 | 渐进披露 / JIT 检索 | Anthropic context engineering | 上下文只放指针，细节用工具运行时取 | 已核实 |
| 3 | 单一入口文档 | `llms.txt`（v2） | H1 + 摘要 + 分节文件列表，小文件指路 | 已核实 |
| 4 | 常驻记忆与技能加载 | CLAUDE.md / AGENTS.md / skills | 常驻目录（name+description）+ 正文命中才载；导入不省 token | 已核实 |
| 5 | 预生成索引与符号级工具 | SCIP/LSIF、Cursor indexing、Serena MCP、repomix | 预计算结构化索引 + 按需取符号 + 压缩打包 | 已核实 |
| 6 | 结论型知识与归档复用 | DeepWiki、ADR、Devin Knowledge/Skills | 决策与坑写成短条目、按触发描述按需加载 | 已核实 |

## 逐条详解

### 1. 仓库地图：Aider repo map（已核实）

- **机制**：把整仓压成「文件 → 关键类/函数及其签名」的**简洁地图**；对「文件为节点、依赖为边」的图跑图排序算法
  （PageRank 类），只挑**最常被引用的那部分**塞进 token 预算；`--map-tokens` 默认 **1k**，并随对话状态动态伸缩。
- **关键句**：「It only includes the most important identifiers, the ones which are most often referenced by other
  portions of the code.」
- **对本插件的意义**：本仓实测**签名骨架只占全量 4.21%**（83,998 / 1,997,485 字符）——这是投入产出比最高的一招；
  但 Aider 依赖 tree-sitter 与图排序，本仓若要零新增依赖，可先用 TypeScript 编译器/正则抽取签名（见 design 阶段的取舍）。
- 来源：[Aider · Repository map](https://aider.chat/docs/repomap.html)

### 2. 渐进披露与 JIT 检索：Anthropic（已核实）

- **机制**：不要预处理所有相关数据，而是**维护轻量标识符**（文件路径、存起来的查询、链接），
  运行时用工具把数据加载进上下文；「agents can assemble understanding layer by layer」。
- **上下文是有限资源**：引用 context rot 研究——token 越多，模型准确召回上下文信息的能力越差；
  「attention budget」每加一个 token 就消耗一点。
- **压缩与笔记**：compaction（摘要后重启窗口，保留架构决策、未解 bug、实现细节，清掉冗余工具输出）；
  structured note-taking（写 `NOTES.md` 之类的外部记忆，之后拉回上下文）；
  官方在 Sonnet 4.5 发布时同步放出 **memory tool**，明确用途包含
  「**build up knowledge bases over time, maintain project state across sessions**」。
- **子 agent 隔离**：子 agent 可以烧几万 token 探索，只回吐 **1,000–2,000 token** 的蒸馏摘要。
- **对本插件的意义**：知识层就是「外部记忆 + 指针」；节点输入包里的整份需求文档属于典型的「该被指针替代」的东西。
- 来源：[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、
  [Context rot（Chroma）](https://research.trychroma.com/context-rot)

### 3. 单一入口：`llms.txt` v2（已核实）

- **规范**：`H1`（项目名，唯一必填）+ `blockquote` 摘要 + 若干普通节 + 若干 `H2`「文件列表」
  （每项 `[name](url)`，可跟 `:` 说明）；约定 `## Optional` 放「上下文紧张时可跳过」的次要信息。
- **纪律原句**：「The file itself stays small enough to fit in context. The detail lives behind the links,
  and is fetched only when needed.」
- **采用面**：数千站点已发布；Mintlify / GitBook / Wix / Yoast 等自动生成；Chrome Lighthouse 把它纳入
  agentic browsing 检查；OpenAI / Anthropic / Gemini 自家开发者文档都发布了 `llms.txt`。
- **对本插件的意义**：`docs/knowledge/INDEX.md` 直接照这个形状做（H1 + 摘要 + 分节列表 + Optional 节），
  并且**照抄它的预算纪律**（本需求定 ≤8,000 字符）。
- 来源：[The /llms.txt file, v2](https://llmstxt.org/)

### 4. 常驻记忆与技能加载：CLAUDE.md / AGENTS.md / skills（已核实）

| 机制 | 事实（原文口径） | 对本插件的启发 | 来源 |
|---|---|---|---|
| CLAUDE.md 层级 | managed → `~/.claude/CLAUDE.md` → `./CLAUDE.md` → `CLAUDE.local.md`，cwd 及以上**全部拼接**；建议 **<200 行**，>4MiB 跳过 | 常驻层要**行数上限** | [memory](https://code.claude.com/docs/en/memory) |
| `@import` | `@path` 递归展开（≤4 跳）；原文明确 **导入文件也在启动时加载，不省 token** | 「引用 ≠ 省 token」：只有**工具按需取**才省 | 同上 |
| auto memory | 只有 `MEMORY.md` **前 200 行 / 25KB** 进会话，topic 文件按需 Read | 索引截断策略可直接照抄 | 同上 |
| auto-compact | 压缩后从磁盘**重注入**根 CLAUDE.md / auto memory / 计划，重读最近 ≤5 文件 | 回档包 = 重注入的同一思路 | 同上 |
| skills 渐进披露 | 启动**只载 name + description**（单条 ≤1536 字符，总预算 ≈ 上下文的 **1%**），正文命中才载；`disable-model-invocation: true` 则零成本 | 知识条目 = 默认只加载「一行摘要」，正文按需取 | [skills](https://code.claude.com/docs/en/skills) |
| AGENTS.md | 60k+ 开源项目采用；嵌套时「最接近被编辑文件者胜」；已由 Linux Foundation（Agentic AI Foundation）托管 | 文件名即约定，工具无关 | [agents.md](https://agents.md/) |
| 记忆层方案 | Cline Memory Bank（仓内 `memory-bank/*.md` 六文件）、basic-memory（Obsidian md + 本地索引 + MCP）、mem0（SQL + 向量 + 实体图）、Letta（常驻 memory blocks + archival 外存） | 本仓最贴近 Cline 形态：**仓内 md + 索引**，不引入服务 | [Cline](https://docs.cline.bot/best-practices/memory-bank) · [basic-memory](https://docs.basicmemory.com/) · [mem0](https://docs.mem0.ai/core-concepts/how-it-works) · [Letta](https://docs.letta.com/v1-sdk/memory/memory-blocks) |

### 7. Token 经济学：缓存与工具定义（已核实）

| 事实 | 数字/条件 | 对本插件的启发 | 来源 |
|---|---|---|---|
| Prompt caching 按**前缀完全匹配** | Anthropic：「There is no per-file or per-segment caching」；改 system 层全失效，改对话层只重算尾部；TTL 5 分钟 / 1 小时 | **稳定且常驻的索引很便宜**（命中缓存），但**频繁改动会反复失效**——索引要少动 | [prompt caching](https://code.claude.com/docs/en/prompt-caching) |
| OpenAI 自动前缀缓存 | >1024 token 自动生效，命中**省 50%** | 同理：把稳定知识放前缀 | [OpenAI](https://openai.com/index/api-prompt-caching/) |
| DeepSeek KV 缓存 | 需完整匹配 cache prefix unit；flash 谷时命中 $0.003 vs 未命中 $0.15 /1M ≈ **1/50** | 本仓用户的直接成本杠杆 | [KV cache](https://api-docs.deepseek.com/guides/kv_cache) |
| 工具定义是常驻成本 | MCP tool search 默认开：上下文里**只放工具名**（示例 ~120 token），schema 由 `ToolSearch` 延后拉取；「能塞进上下文 10% 才预载」；反例：未延迟的 HTTP MCP「**120K tokens loaded upfront on every session**」 | 本仓 20 个工具的说明文本约 17K 字符**每轮常驻**——新增工具必须**短**，且优先「一个工具多用途」 | [context window](https://code.claude.com/docs/en/context-window) · [issue #40314](https://github.com/anthropics/claude-code/issues/40314) |

### 8. 上下文腐化的量化证据（已核实）

- **Chroma（18 个模型）**：输入变长性能**一致下降**（非均匀）；「even a single distractor reduces performance」；
  haystack 结构越连贯反而更差；LongMemEval 上 focused（~300 token）**显著优于** full（~113k token）。
- **NoLiMa（ICML 2025）**：无字面重叠的检索任务，32K 上下文时 11 个模型跌破其短上下文基线的 50%；
  GPT-4o 从 99.3% 掉到 69.7%。
- 来源：[Chroma context rot](https://www.trychroma.com/research/context-rot) · [NoLiMa arXiv](https://arxiv.org/abs/2502.05167)

### 9. 写文档型知识库的 5 条硬规则（B 子调研产出，直接进 design）

1. **单页 ≤200 行；索引页 ≤200 行且 ≤25KB** —— 超限部分根本不会进上下文（对齐 CLAUDE.md / MEMORY.md 既有约束）。
2. **每页必须有 TL;DR + 头部字段**：`id / type / updated / tags / related`；`updated` 让时间成为相关性代理。
3. **索引页一行一页**（一句话 + 路径），正文拆进条目文件，靠按需读取——目录常驻、正文懒加载。
4. **默认只加载目录**（单条 ≤1536 字符，总预算 ≈ 上下文 1%），正文命中或显式调用才载。
5. **同一事实只存一处**，别处用**链接而非复制**（`@import` 仍在启动时加载，不省 token——所以是引用，不是拷贝）。

### 5. 预生成索引与符号级工具（已核实）

| 方案 | 机制 | 可复用/不可复用 | 来源 |
|---|---|---|---|
| Sourcegraph SCIP/LSIF | 编译期生成 protobuf 索引，compiler-accurate 跳转 | 精度最高，但**每语言一个 indexer + 接 CI/索引服务**——本地插件不具备 | [SCIP 公告](https://sourcegraph.com/blog/announcing-scip) |
| Cursor indexing | Merkle 树（文件 SHA-256 + 目录哈希）只同步分歧分支；语法分块 → embedding，按块内容缓存 | 「**增量失效**」思路可抄；embedding 服务不可抄 | [Secure codebase indexing](https://cursor.com/blog/secure-codebase-indexing) |
| Serena MCP | LSP 后端做 find symbol / 文件大纲 / find referencing symbols / 只读符号体 | 卖点即「symbol level…without reading entire files」；需 LSP 守护进程 | [serena-agent](https://pypi.org/project/serena-agent/) |
| mcp-language-server | 把任意 stdio LSP 包成 definition/references/hover/rename | 同上，依赖 LSP | [README](https://github.com/isaacphi/mcp-language-server) |
| ast-grep | AST 模式匹配 + `outline` 抽符号（非索引） | **无 LSP 时的降级路径** | [ast-grep](https://ast-grep.github.io/guide/quick-start.html) |
| repomix / gitingest / code2prompt | 整仓压单文件 + token 统计 + include/exclude 过滤 | `--compress`（tree-sitter 只留签名/结构）与 `--token-count-tree` 直接可抄 | [repomix usage](https://repomix.com/guide/usage.md) · [code-compress](https://repomix.com/guide/code-compress.md) |

**Aider 实现细节（值得照抄的三条，源码级确认）**：

- **tags 缓存**：`.aider.tags.cache.v3`（sqlite/diskcache），value = `{mtime, data}`，**mtime 变化即重算**；
  SQLite 异常降级为内存 dict；CACHE_VERSION 升版整体失效。
- **图排序权重**：被提及符号 ×10、长驼峰/蛇形标识符（≥8 字符）×10、`_` 开头 ×0.1、definer>5 次 ×0.1、
  引用者已在 chat 中 ×50；PageRank 带 personalization。
- **预算落地**：`--map-tokens` 默认 **1024**；无 chat 文件时放大到 `min(map_tokens×8, 上下文−4096)`；
  对排序列表**二分取前缀**，误差 <15% 即停；渲染每行截断 100 字符。

**量化数据（标注可信度）**：

- Cursor 官方评测：语义检索比纯 grep 准确率 **+12.5%**（区间 6.5%–23.5%）——一手，可信。
- 第三方实测（FastAPI 108,075 行）：repomix XML ≈**800k token**，加 `--compress` ≈**400k**（约 2×），
  而 Aider repo map ≈**8k–15k token**——非官方基准，**量级可信、精确值不作为判据**。
- 「结构化索引 vs 无索引：resolve 50.4% vs 41.9%、输入 token −5.8%」——二手博客，其原始 ablation **未独立验证**，按低可信度看待。

### 6. 结论型知识与归档复用（已核实）

| 做法 | 机制 | 对本插件的启发 | 来源 |
|---|---|---|---|
| DeepWiki 自动 wiki | 按仓库生成架构图 + 文档 + 源码链接；`.devin/wiki.json` 可强制指定页面（≤30 页）；**默认自动规划在大仓会漏目录** | 自动生成不可信，需可指定 + 自检 | [Devin DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki.md) |
| Devin Knowledge → Skills | 知识条目 = 名称 + **触发描述** + 正文 + 作用域 + 宏，按触发描述自动召回；现已整体迁移为 `SKILL.md`（description 决定何时加载） | 「按需加载」= 用描述触发，而不是预载进 system prompt | [Knowledge](https://docs.devin.ai/product-guides/knowledge.md) |
| ADR（Architecture Decision Record） | 一决策一记录（背景/选项/后果），集合成 decision log | 本仓 `index_entry` / `merged_into` 可直接升级成条目字段 | [adr.github.io](https://adr.github.io/) |
| 会话恢复 | Claude Code 会话持续落盘 jsonl，`--continue/--resume/--fork` 恢复全量历史 | 「回档」有据可依；本仓已有断点机制，缺的是知识层 | [Sessions](https://code.claude.com/docs/en/sessions) |
| 恢复的反面案例 | `codex resume` 的压缩会丢近期上下文，公开 issue 反映续跑困难 | 回档包必须**指向原文**，不能只留摘要 | [issue #25394](https://github.com/openai/codex/issues/25394) |
| 代码图（CodexGraph 等） | 把仓库导入图数据库，让 agent 自己写图查询 | AST 确定性图 > LLM 抽取图 > 纯向量（多跳架构问答）；但落地成本高，**非本需求范围** | [NAACL 2025](https://aclanthology.org/2025.naacl-long.7/) · [2601.08773](https://arxiv.org/abs/2601.08773) |

**C 子调研给出的「归档 → 知识」最小可用设计**（已并入本需求 FR，逐条见 requirement.md）：

1. 归档即产出一条知识条目（一需求一条，正文 ≤200 字），字段：
   `id / type(decision|pitfall|howto|how-it-works) / tags / req / status / supersedes / updated / source_path`。
2. **决策走 supersede 链**：新决策写 `supersedes: K-012`，索引只列 active，避免同一决策多版本反复被检索。
3. **按需加载而非预载**：以工具调用暴露（`kb_search(tag)` → `kb_get(id)`），不塞 system prompt。
4. **三层索引**：L0 INDEX（全量一句话）→ L1 条目（≤200 字）→ L2 归档原文（按需展开），默认只读 L0。
5. **有界 + 过期**：每类设条目配额，`updated` 超期标 stale 并降权；归档**不复制正文只链接**，避免双份真相。

## 反面教训（要写进设计的红线）

| 教训 | 证据 | 红线 |
|---|---|---|
| 上下文越长召回越差 | context rot（已核实，Anthropic 引用） | 知识索引必须有**硬字符上限**，不许"先堆着" |
| 冗余内容拖垮注意力 | Anthropic：过激压缩会丢关键细节，但工具原始输出应尽早清理（已核实） | 条目只留「结论 + 指针 + 失效条件」，不留过程 |
| 过期索引比没有更糟 | Anthropic：`CLAUDE.md` 是"naively dropped"，而 glob/grep 反而"bypassing the issues of stale indexing"（已核实） | 生成物必须可重跑 + 死链自检 |
| 模板 ≠ 知识库 | 本仓实证：`templates/archived/index.md` 全仓无 `INDEX.md`、无写入者（已核实） | 知识条目必须有**流程内的写入者**与**工具读取者** |
| 入口存在 ≠ 被使用 | Ahrefs 分析 13.7 万站点：**97% 的 `llms.txt` 从未被读取**（转述二手，但方向明确） | 索引不能只落盘，必须**由流程/注入强制读取**（本仓：节点输入包 + 工具） |
| 小库上 RAG 是负收益 | Anthropic：<20 万 token 直接整装 prompt + 缓存（延迟 ↓>2×、成本 ↓90%）；更大才检索 | 本仓知识层（目标 ≤8K 字符）**明确不做向量检索** |
| 长上下文 vs 检索 | QA 基准上长上下文普遍优于 RAG；摘要式检索接近长上下文，**分块检索最差** | 支持「小索引整装 + 按需展开」，反对分块切碎 |
| 图优于向量（结构性问答） | AST 确定性图 > LLM 抽取图 > 纯向量（多跳架构问答正确率，纯向量幻觉风险最高） | 代码地图用**确定性符号抽取**，不用 LLM 生成 |
| 知识层自己会膨胀 | Claude Code 官方建议 `CLAUDE.md` **<200 行**、细化指令移入按需加载 skill；代理团队比普通会话多约 **7× token** | 索引与条目都要**行数/字符上限**，超限即门禁失败 |
| 压缩式恢复会丢上下文 | `codex resume` 的压缩丢近期上下文，公开 issue 反映续跑困难 | 回档包必须留**原文指针**，摘要不能是唯一副本 |

## 对本插件的结论（四件套）

```
INDEX.md(≤8K)  ──指针──▶  entries/<kb-id>.md（结论/契约/坑，带失效条件）
      ▲                        ▲
      │ 写入                   │ 检索
归档流程(reqboard_submit)   reqboard_kb(budgetChars 有闸)
      │
code-map.md（确定性生成物：文件 → 角色 + 导出签名）
```

- **入口**：一份 ≤8K 字符的索引，新窗口读完就有项目认知（对齐 `llms.txt`）。
- **条目**：短、带指针、带失效条件（对齐 ADR / known-issues 与 Anthropic 的 memory tool）。
- **地图**：确定性生成、可重跑、占全量 4% 量级（对齐 Aider repo map）。
- **闸门**：返回有预算、知识有总量上限、死链/孤儿要响亮失败（对齐 context rot 教训）。

### 补充：规范、架构、样式令牌为什么也必须进知识库（2026-10-01 人工门反馈）

| 知识域 | 业界依据 | 本仓现状 | 结论 |
|---|---|---|---|
| 代码规范 | [CLAUDE.md](https://code.claude.com/docs/en/memory) 的核心用途就是「项目须知与约定」；[AGENTS.md](https://agents.md/) 60k+ 项目把「怎么在这个仓里干活」写成一份入口；Devin 把知识条目按**触发描述**召回 | 规范散在 277 个测试 / 1,863,900 字符 + 9 个脚本，无 CONTRIBUTING | 规范必须**条目化 + 每条挂可执行校验**，否则 Agent 只能靠试错（FR-9） |
| 架构 | Anthropic：文件层级与命名本身就是信号，但要「按需展开」；DeepWiki 证明**自动生成的架构文档会漏目录**，需可指定 | 架构只有 README 20 行 + 4 篇专题 | 架构总览要**人可维护 + 索引化**，并挂到具体路径（FR-8） |
| 前端样式/颜色 | `llms.txt` 与 skills 的「目录常驻、正文懒加载」同样适用于设计令牌；结构性事实（颜色/断点/类名）**确定性抽取**比 LLM 摘要可靠 | 12 文件 / 129,888 字符 / 67 色 / 35 变量 / 545 类名 / 4 档断点 | 生成 `design-tokens.md`，重跑 diff 为空（FR-10） |

## 来源清单

| # | 来源 | 类型 | 用于 |
|---|---|---|---|
| 1 | [Anthropic · Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 一手 | 主线 2、反面教训 |
| 2 | [Aider · Repository map](https://aider.chat/docs/repomap.html) | 一手 | 主线 1 |
| 3 | [llms.txt v2](https://llmstxt.org/) | 一手 | 主线 3 |
| 4 | [Chroma · Context rot](https://research.trychroma.com/context-rot) | 一手 | 反面教训 |
| 5 | [Sourcegraph · SCIP](https://sourcegraph.com/blog/announcing-scip) | 一手 | 主线 5 |
| 6 | [Cursor · Secure codebase indexing](https://cursor.com/blog/secure-codebase-indexing) · [semsearch](https://cursor.com/blog/semsearch) | 一手 | 主线 5、量化 |
| 7 | [Serena MCP](https://pypi.org/project/serena-agent/) · [mcp-language-server](https://github.com/isaacphi/mcp-language-server) · [ast-grep](https://ast-grep.github.io/guide/quick-start.html) | 一手 | 主线 5（符号级） |
| 8 | [repomix](https://repomix.com/guide/usage.md) · [code-compress](https://repomix.com/guide/code-compress.md) | 一手 | 主线 5（压缩打包） |
| 9 | [Devin · DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki.md) · [Knowledge](https://docs.devin.ai/product-guides/knowledge.md) | 一手 | 主线 6 |
| 10 | [ADR](https://adr.github.io/) · [Claude Code Sessions](https://code.claude.com/docs/en/sessions) · [Costs](https://code.claude.com/docs/en/costs) | 一手 | 主线 6、防膨胀 |
| 11 | [Anthropic · Contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval) · [arXiv 2501.01880](https://arxiv.org/abs/2501.01880) | 一手 | 反面教训（RAG 取舍） |
| 12 | [CodexGraph (NAACL 2025)](https://aclanthology.org/2025.naacl-long.7/) · [arXiv 2601.08773](https://arxiv.org/abs/2601.08773) | 一手 | 主线 6（代码图取舍） |
| 13 | [Ahrefs · llms.txt 研究](https://ahrefs.com/blog/llmstxt-study/) · [Redocly](https://redocly.com/blog/llms-txt-still-overhyped) | 二手（转述，方向性参考） | 反面教训 |
| 14 | [dev.to · 4 种打包工具实测](https://dev.to/thegdsks/i-tested-4-codebase-to-ai-tools-on-fastapi-108k-lines-here-are-the-token-costs-4bmc) | 二手（非官方基准） | 量化（仅量级） |
| 15 | [Claude Code · Memory](https://code.claude.com/docs/en/memory) · [Skills](https://code.claude.com/docs/en/skills) · [Context window](https://code.claude.com/docs/en/context-window) · [Costs](https://code.claude.com/docs/en/costs) | 一手 | 主线 4、7 |
| 16 | [AGENTS.md](https://agents.md/) | 一手 | 主线 4 |
| 17 | [Chroma · context rot](https://www.trychroma.com/research/context-rot) · [NoLiMa (ICML 2025)](https://arxiv.org/abs/2502.05167) | 一手 | 反面教训（量化） |
| 18 | [Anthropic prompt caching](https://code.claude.com/docs/en/prompt-caching) · [OpenAI prompt caching](https://openai.com/index/api-prompt-caching/) · [DeepSeek KV cache](https://api-docs.deepseek.com/guides/kv_cache) | 一手 | 主线 7 |
| 19 | [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank) · [basic-memory](https://docs.basicmemory.com/) · [mem0](https://docs.mem0.ai/core-concepts/how-it-works) · [Letta](https://docs.letta.com/v1-sdk/memory/memory-blocks) | 一手 | 主线 4（记忆层方案） |
| 20 | [claude-code issue #40314](https://github.com/anthropics/claude-code/issues/40314) | 一手（issue） | 主线 7（工具定义成本） |
