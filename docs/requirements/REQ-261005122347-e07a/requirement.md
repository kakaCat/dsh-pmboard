---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
---

# REQ-261005122347-e07a · 需求分析阶段：收录 UI/UX 提示词 skill（MIT）并按引用交付原型 subagent

## TL;DR

- **是什么**：把 **`ui-ux-pro-max` skill**（用户指定来源）收录进插件，并在**需求分析（brainstorming）节点**
  注入一小节「原型工作原则」——要做原型时**派 subagent 做**，主 agent 只拿**引用**（skill 目录里
  `SKILL.md` 与 `scripts/search.py` 的绝对路径 + 调用命令模板），子代理自己去读、去检索。
- **为什么现在做**：注入提示词现在写死在插件里，brainstorming 节点没有任何"做原型/做 UI"的指引；
  而本仓交付物恰恰是界面类（`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html` 是现攒的）。
- **得到什么**：原型工作有据可依（可检索的设计情报 + 119 条 UX 准则 + 22 个技术栈），
  且**不占主 agent 每轮注入预算**（按引用交付子代理，实测 brainstorming heavy 主 skill 原文已 15,456 字符 / 预算 24,000）。

## 一句话目标 + 可证伪判定标准

**目标**：brainstorming 节点用**一小节**（≤1200 字符）把"要设计原型就派 subagent、并按绝对路径读/跑
`ui-ux-pro-max` skill"变成硬指引；skill 资产以 MIT 归属收录进插件，主 agent 每轮不背全文。

**判定标准（跑什么、看到什么算完成）**：

1. `node scripts/check-prompt-fragments.mjs` → 退出码 `0`（片段 ↔ 生成物逐字节一致；heavy.md ↔ vendor 原文仍一致）。
2. `node scripts/dump-stage-prompts.mjs` 后 `npx vitest run tests/prompt-baseline.test.ts` → 全绿
   （P1 基线快照 `tests/fixtures/stage-prompts-baseline-p1.json` 被**显式**更新）。
3. `npx vitest run tests/stage-prompts.test.ts tests/prompt-cost.test.ts tests/prompt-tiers.test.ts` → 全绿；
   新增断言：brainstorming 注入文本**含**「原型工作原则」节、**含** `search.py` 的绝对路径字符串与
   `--design-system` 命令模板，且 brainstorming(heavy) `charCount ≤ 24000`、`overBudget` 为空。
4. **资产完整性**（新用例）：`node -e` 断言以下文件存在且可读——
   `<skillRoot>/ui-ux-pro-max/SKILL.md`、`scripts/search.py`、`scripts/core.py`、
   `data/styles.csv`、`data/colors.csv`、`data/typography.csv`、`data/products.csv`、`data/ui-reasoning.csv`；
   且 `<skillRoot>` 总体积 ≤ 3 MB（超限即视为裁剪失效）。
5. **检索端到端可用**（新用例 + 人工复核）：以解析出的绝对路径跑
   `python3 <skillRoot>/ui-ux-pro-max/scripts/search.py "internal analytics dashboard" --design-system --variance 8 --density 8`
   → 退出码 `0` 且输出非空（输出摘要落本需求目录，作为证据）。
6. **Python 缺失时的降级可测**（新用例）：把解释器探测函数替换为"找不到" → 注入文本仍完整，
   且带"本轮未做数据库检索、以下为通用默认"的**如实声明**；**不得**出现任何杜撰的检索结果。
7. `npx tsc --noEmit` 新增错误 `0`（与开工基线比对，基线开工时实测写进任务卡）。

## 边界

**做什么**：

1. 收录 `ui-ux-pro-max` skill 的主 skill 目录（自包含资产）+ 归属性 `PROVENANCE.md`（来源、MIT、commit、sha256、裁剪清单）。
2. brainstorming 节点新增「原型工作原则」节：何时做原型 / **必须派 subagent** / skill 两个入口的绝对路径 /
   检索命令模板 / 子代理红线 / 产物落点。
3. 解释器探测（`python3` → `python` → `py -3`）与缺失时的**响亮降级声明**。

**明确不做（本期）**：

1. **不收录同仓另外 6 个 skill**（`ui-styling` 5.6MB、`design`、`design-system`、`brand`、`slides`、`banner-design`）——
   本期只要主 skill；其余各自独立、后续按需。
2. **不用其 `cli/` 与 npx 安装路径**（`cli/assets/data` 是 2.5MB 重复数据），也不往用户项目落 `.claude/`——
   本插件自带资产，走与 `templates/` 同一条包根解析。
3. **不做 implementing / 子卡链**接线（`generateSubtaskScript` 的 prompt 拼装点本期不动），
   **不做设置项 / git skill 源 / skill 切换工具 / `when` 条件触发**（后续需求）。
4. 不改 `router.ts` 路由算法与 `CATEGORIES`/`PROMPT_STAGES` 受控枚举。

## 交付形态（一张图）

```
     brainstorming 节点（注入 ≤1200 字符的「原型工作原则」节）
   +-----------------------------------------------------------+
   | 1 何时该做原型   2 必须派 subagent   3 两个绝对路径引用     |
   | 4 检索命令模板   5 子代理红线 + 产物落点                    |
   +-----------------------------------------------------------+
                     |
                     |  主 agent 只拿引用（不背全文、不背 3.5MB 数据）
                     v
   +---------------- subagent（原型工） ------------------------+
   | 读  <skillRoot>/ui-ux-pro-max/SKILL.md    <- 先读入口      |
   | 跑  python3 <skillRoot>/.../scripts/search.py "<2-5词>"    |
   |         --design-system --variance N --density N           |
   | 查  data/*.csv  (79风格/192配色/74字体/119UX/22栈)         |
   | 写  docs/requirements/<REQ>/prototype/<原型文件>           |
   | 返  文件路径 + 一句设计说明 + 用了哪次查询                  |
   +-----------------------------------------------------------+
                     |
                     |  Python 缺失 / 路径不可达
                     v
   +-------- 响亮降级：声明「本轮未做数据库检索，以下为通用默认」-+
   |  禁止：把 0 结果或未检索包装成检索结果（上游同名纪律）      |
   +-----------------------------------------------------------+
```

## 产品定义

**这是什么**：插件提示词体系的一次**资产收录 + 交付形态约定**。与前一个候选（一份静态准则文档）的
根本差别：**`ui-ux-pro-max` 是可检索工具**——`SKILL.md` 只是入口说明书，真正的价值在
`scripts/search.py`（Python 3，无外部依赖）查 `data/*.csv`（79 风格 / 192 产品配色 / 74 字体配对 /
119 UX 准则 / 105 图标 / 25 图表 / 22 技术栈）。

三件事同时成立才算数：

1. **资产入库且自包含**：主 skill 目录（`SKILL.md` + `scripts/` + `data/` + `references/`）落在
   **包根可通过绝对路径读取**的位置（与 `templates/` 同一套解析规则，见 `src/adapters/TemplateRoot.ts`）。
2. **注入只给引用**：brainstorming 注入里出现的是**两个绝对路径**（`SKILL.md`、`scripts/search.py`）
   与一条命令模板 + 何时用；**全文与数据不进主 agent 的每轮 system prompt**。
3. **子代理能真跑起来**：它读 `SKILL.md`、按命令模板检索、按结果做原型；跑不了时**如实说"未检索"**，不许编。

**来源选定（本期结论）**：

| 候选 | 许可 | 结论 |
|---|---|---|
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)（133k stars） | **MIT**（GitHub API `license.spdx_id=MIT`） | **收录主来源（用户指定）**；只取主 skill 目录，按 §FR-1 裁剪 |
| [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)（MIT） | MIT | **本期不收录**（可选补充：它是规范性清单，与可检索情报互补），留作后续按需 |
| [anthropics/skills · frontend-design](https://github.com/anthropics/skills) | 仓库未声明许可 | **不收录**（仅阅读参考） |

**路径契约（必须处理）**：上游 `SKILL.md` 里的调用示例写的是 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...`。
本仓**没有** `CLAUDE_PLUGIN_ROOT` 这个变量 ⇒ 注入里给的是**我方解析出的绝对路径**，
并在注入文本中写清完整命令（含真实路径），不留任何需要子代理猜的占位符。

## 用户与角色

- **原型 subagent（一等使用者）**：需求分析阶段被派出去做原型的子代理。它读 `SKILL.md`、跑 `search.py`、
  产出原型文件。**不参与**需求推进。注入文本的写法按它来设计，不是按主 agent。
- **主 agent（窗口）**：只拿引用与派活原则，判断"这次要不要做原型"并派活，不背全文与数据。
- **人（需求提出者 / 验收者）**：确认需求文档；看原型、提意见；要能回答"这次原型是按哪份 skill、哪一版做的"。
- **插件维护者**：改片段走 C-16/C-17；上游 skill 更新 = 显式替换 + 更新指纹，不靠静默漂移。

## 功能点

- **FR-1: 收录 ui-ux-pro-max 主 skill 目录（裁剪后自包含）**
  收录 `.claude/skills/ui-ux-pro-max/` 到本仓 skill 资产根，保留 `SKILL.md`、`scripts/`（含 `search.py`、
  `core.py`、`design_system.py`）、`data/`（CSV 目录）、`references/`；**剔除**：`scripts/tests/`（上游自测，252KB）、
  `data/phosphor-icons-upstream.json`（805KB，上游图标刷新用）、`data/google-font-licenses.json`（423KB，许可展示用）。
  剔除后总体积目标 ≤ 3MB。**两个 JSON 是否真不被检索依赖，必须由判定标准 5 的真实查询验证**——
  若查询失败则改为保留，不得靠"应该不需要"推断。

- **FR-2: 资产在构建态与装机态都可读 + 归属性留痕**
  落点与 `templates/` 一致（`resolveTemplateRoot` 同一套规则解到包根）；
  `package.json` 的 `files` 清单补齐该目录（现状只含 `dist/lib/cordis.patch.yml/README/LICENSE/CHANGELOG`，
  不补则装机后读不到——「dev 能跑、装起来 404」的静默缺口）；同目录写 `PROVENANCE.md`：
  来源 URL、MIT 许可证全文或指向、**上游 commit sha**、取得日期、各文件 `sha256`、裁剪清单与理由。

- **FR-3: brainstorming 注入「原型工作原则」节**
  作为**可裁优先级**（非 floor）的片段/追加节注入，五要素固定：① 何时该做原型（有界面/交互产物时）；
  ② **必须派 subagent 做**；③ 两个绝对路径（`SKILL.md` 与 `search.py`）+ "子代理必须先读 `SKILL.md`"；
  ④ 检索命令模板（`python3 <abs>/scripts/search.py "<2-5 个词>" --design-system --variance/-motion/-density`）；
  ⑤ 子代理红线与产物落点。整节字符上限 1200，超限即设计错误（用例断言）。

- **FR-4: 子代理红线与产出契约写进注入**
  明确：子代理**不得**调用任何 `reqboard_*` 状态推进工具、不得改需求/任务状态、不得写
  `docs/requirements/<REQ>/` 以外的地方（含**不得**往用户项目落 `design-system/` 目录，除非人显式要求）；
  产物只落 `docs/requirements/<REQ>/prototype/`（该目录文件由既有 `artifact-discovery` 以 `notes` 兜底登记，
  见 `src/application/internal/artifact-discovery.ts`，本期不新增 `ArtifactKind`）；
  返回 = 产出文件路径列表 + 一句设计说明 + **用了哪个 skill/哪次查询**。

- **FR-5: 解释器探测与缺失时的响亮降级**
  探测顺序 `python3` → `python` → `py -3`；全部缺失时：注入文本仍完整，且**明确要求**主 agent/子代理
  声明"本轮未做数据库检索，以下为通用默认"，并禁止把 0 结果或未检索包装成检索结果
  （这与上游 `SKILL.md` 自带的纪律一致："Never present a 0-result search as if it returned data"）。
  插件侧对"解释器缺失"写 warn 留痕，不静默。

- **FR-6: 引用不可达时响亮降级并留痕**
  若子代理读不到 skill 路径或无法执行（跨沙箱/路径失效），注入文本规定降级为"主 agent 至少把
  `SKILL.md` 的**优先级表**原文放进派发 prompt"，并**如实说明降级原因**；不静默用空准则跑完。

- **FR-7: 门禁与预算不破**
  改片段后重跑 `node scripts/inline-prompt-fragments.mjs`（C-16）并过 `check-prompt-fragments.mjs`（C-17）；
  P1 基线快照必须显式更新；`src/domain/prompt/generated/fragments.ts` 是生成物**不得手改**（C-10）；
  不得触碰 `budget.ts` 的 `DEFAULT_PROMPT_BUDGET = 24000` 与 floor 不裁口径。

- **FR-8: 来源版本可追溯（防静默漂移）**
  `PROVENANCE.md` 记上游 commit sha 与各文件 `sha256`；换版本 = 显式替换 + 更新指纹 + 重跑 C-16/C-17，
  并在本需求目录留变更说明。"内容变了但指纹没变"由用例拦截。

## 现状证据（开工时复核）

- **E-1 注入写死**：`src/domain/prompt/fragments/` 经 `scripts/inline-prompt-fragments.mjs` 构建期内联为
  `src/domain/prompt/generated/fragments.ts`，运行时**不读盘**（该文件头部注释写明理由："有过读盘失败静默降级的事故"）。
- **E-2 brainstorming 无原型/UI 指引**：`fragments/brainstorming/` 下只有节点轻/重档、类型档与 overrides。
- **E-3 预算吃紧**：`budget.ts` 注释实测 heavy 注入 max ≈ 18.3K、`DEFAULT_PROMPT_BUDGET = 24000`；
  brainstorming heavy 主 skill 原文 15,456 字符 ⇒ skill 全文与数据**不能**塞进主 agent 节点档。
- **E-4 模板资产解析路径**：`src/adapters/TemplateRoot.ts` 按模块位置解 `<pkg>/templates`（源码态/构建态同解）——
  "包根非 TS 资产如何被运行时读取"的既有唯一范式。
- **E-5 原型现为 notes 兜底**：`ArtifactSpec.ts` 注释明确 `notes` = 过程产物兜底（"原型 html / 笔记等"）。
- **E-6 来源体量实测**（本次调研，2026-10-05）：主 skill 目录 73 文件/3.5MB；
  其中 `data/phosphor-icons-upstream.json` 805KB、`data/google-fonts.csv` 730KB、
  `data/google-font-licenses.json` 423KB、`scripts/tests/` 252KB、`data/styles.csv` 146KB、
  `data/ui-reasoning.csv` 75KB；同仓 `ui-styling` 另占 5.6MB、`cli/assets/data` 2.5MB（重复数据）。

## 风险与未决

1. **子代理能否读插件包内路径 + 能否执行 Python**（最大风险，设计阶段必须实测并记录结论）：
   DSH subagent 的文件/命令工具通常限工作区。若两者都不可行，本需求的交付形态要改成
   "把 skill 资产**投放到用户项目**里再由子代理使用"或"主 agent 内联优先级表"——**先实测再定稿**。
2. **Python 运行时前置**：本插件是 Node 生态，检索依赖 Python 3。本机/CI 是否可用要实测；
   缺失时按 FR-5 降级（不是失败）。相关：`docs/architecture/plugin-runtime-prerequisites.md`。
3. **裁剪判断错误**：剔除两个大 JSON 是我的判断（检索走 CSV），必须由判定标准 5 的真实查询否定或确认。
4. **上游同步成本**：vendored 资产每次上游更新都要人工同步；`PROVENANCE.md` 指纹是唯一防漂移手段。
5. **落点未最终定**：本期写"包根新目录（与 `templates/` 同级）"；备选 `src/domain/prompt/vendor/`
   （现有 `vendor/superpowers/`）——但 `vendor/` 现为构建期镜像源、不参与运行时读取，故倾向包根新目录。

## 下一步

brainstorming 产物 = 本文件。登记后请人确认：

- `reqboard_submit(kind=requirement)` 登记本文件 → `reqboard_ask_confirm(target=artifact, kind=requirement)`。
- 确认后进入 **design**：产出 `docs/requirements/REQ-261005122347-e07a/design/` 下设计文档，
  必须包含：① **子代理可读性/可执行性实测结论**（风险 1）；② 落点定稿与裁剪定稿（风险 3/5）；
  ③ 注入节逐字稿（≤1200 字符）；④ 子代理派发指令骨架；⑤ 解释器探测与降级路径的实现位置。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |
| FR-6 | 🔴 **未被接收** | — |
| FR-7 | 🔴 **未被接收** | — |
| FR-8 | 🔴 **未被接收** | — |

> 🔴 **未被接收（8 条）**：FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8

<!-- reqboard:marks:end -->
