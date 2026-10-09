# 架构设计：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 面向零上下文执行者：本文件 + requirement.md 即拆分与实施的全部依据。
> 类型：refactor（文案/契约级，运行时行为零变化）。

## 设计总览 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

七组漂移共用一条根因纪律：**派生量不手写、细则不住 description、出处住代码注释**。
每组修复都是「改 agent 可见字符串 / 注释 / 元数据 + 用机械检查锁死回归面」，
唯一新增执行面是 FR-1 的探针扩面（只读扫描，exit code 语义不变）。

统一原则（每组设计节不再重复）：

1. **不数数**：凡是从实现派生的数量（问数、工具数、kind 数、写路径清单），
   agent 可见文案一律不写具体数字或清单，写「以实际为准」的定性表述。
2. **出处下沉**：REQ/FR 编号、修复史、日期叙事从 agent 可见字符串挪进同文件代码注释。
3. **细则下沉**：违规才需要看到的规则长文，从每轮常驻的 description 挪到拒绝回执 message。
4. **机械对账**：能被机器检查的口径（路径存在性、禁词前缀）必须挂进既有检查命令，
   不靠人肉体检发现下一批。

## FR-1 死路径修复与探针扩面设计 <!-- serves: FR-1 -->

### 死路径替换表（8 处） <!-- serves: FR-1 -->

| 现场 | 性质 | 处置 |
|------|------|------|
| `src/tools/SubmitTool/prompt.ts:35` | agent 可见（description） | `agent-dh/docs/architecture/requirement-archive.md` → `docs/architecture/archived-entry.md` |
| `src/application/internal/capture-section.ts:161` | agent 可见（注入串） | 同上替换 |
| `src/client/views/verification.ts:253-254` | GUI 可见（2 处） | 同上替换（改后按 kb C-12 跑 `pnpm build:client`） |
| `src/shared/protocol.ts:983` | 代码注释 | 同上替换 |
| `src/domain/artifact/ArtifactSpec.ts:58,75` | 代码注释（2 处） | 同上替换 |
| `src/domain/errors.ts:10` | 代码注释 | 删 `（沿用全仓现有写法，见 docs/standards/tool-development.md）` 的路径引用，保留构造约定描述本身（约定全文本就在本注释内，无外部依赖） |

去向语义说明：`archived-entry.md` 是归档域的 L2 领域篇（含「契约」节与归档条来源标注），
是仓内现存的归档主题权威页；归档材料的字段级规则真正的事实源是
`ArtifactSpec.ts` 的 ARCHIVE_DOC_RULES，文案表述为「规范见 docs/architecture/archived-entry.md」
（指针性质不变，指向活文档）。

### 不在修复范围的 agent-dh 命中（功能性，保留） <!-- serves: FR-1 -->

`support.ts:808`、`conflict-check.ts:30`、`ArtifactPath.ts:7-8,102` 等处的 `agent-dh/`
是**路径归一正则**（容忍历史台账里相对 git 根的写法），不是文档指针，删了会破坏存量兼容；
其余命中（report-path.ts、SubmitArchive.ts:234、artifacts.ts:11 等）是描述该行为的代码注释。
FR-1 判据的 grep 口径因此定为：**agent 可见字符串**（下方探针扫描面）零命中，
而非全仓字面 grep 零命中。

### 机械检查：扩展现有探针，不新建脚本 <!-- serves: FR-1 -->

仓内已有 `scripts/prompt-path-probe.mts`（R3 探针：扫描面内路径 token 必须可达，
exit 0/1/2，自带 `--specimen` 反例模式与白名单准入口径）。当前扫描面只有
`src/domain/prompt/fragments/**` + `round-state.ts`，盖不住工具 description / 注入串 / GUI 文案。
设计 = **扩面**，三处改动：

1. **扫描面扩展**：新增扫描根 `src/tools`（递归 `prompt.ts` 与 `*Tool.ts`/`index.ts`，
   即 description 与 schema 描述的载体）与指定文件
   `src/application/internal/capture-section.ts`、`src/client/views/verification.ts`。
2. **注释剥离**：`.ts` 文件抽取 token 前先剥离 `//` 行注释与 `/* */` 块注释——
   agent 看不到注释，扫注释只会把功能性说明（如上面的路径归一注释）打成误报。
   `.md`（fragments）全文是注入面，维持全扫。
3. **禁词前缀硬规则**：新增 `FORBIDDEN_PATTERNS`（不接受白名单豁免）：
   `(?<![\w/])agent-dh/`、`docs/standards/`——这两类前缀在扫描面内出现即缺口（exit 1 点名）。
   它们不是 SCAN_ROOTS 能覆盖的形态（`agent-dh` 不是根、`docs/standards` 不在根表），
   没有硬规则时改名后的死路径换个写法又能溜回来。

### 接线与反例 <!-- serves: FR-1 -->

- `package.json` 的 `prompts:check` 追加 `&& tsx scripts/prompt-path-probe.mts`
  （G1 原表「可挂现有 prompts:check」；`prompts:verify` 不同步追加——verify 是只校验
  fragments 的轻量口，探针有独立命令与 kb 登记）。
- 探针 `--specimen` 模式为新增扫描面补一条内置反例（一段含 `agent-dh/docs/…` 的
  模拟 description 文本），断言必红——防「扩面后探针空转」。
- 扩面后首跑若暴露**既有**不可达 token：按探针既有纪律处置——修指针，或带理由登记白名单
  （白名单准入条件不变：说不清为什么该存在 = 缺口）。本设计不预设白名单条目。

## FR-2 立项问数口径设计 <!-- serves: FR-2 -->

**事实源**：`capture-mapping.ts` 的 CAPTURE_QUESTION_IDS（5 键）是唯一事实源，
该文件自身注释保留「五问」字样（事实源记自己的账，准确）；
其 :12 附近「四处同一口径」的破产承诺改写为「本文件是问数唯一事实源，文案不数问数」。

**改写规则（全仓统一）**：除事实源文件外，`三问`/`四问`/`五问` 字样全仓清零——
agent 可见字符串、代码注释、README、台账留痕文案一律不数问数，
需要列举时列内容不列数（如「需求名称 / 类型 / 难度 / 文档位置」）。

**改动面（2026-10-07 复核全量）**：

| 文件 | 处数 | 性质 |
|------|------|------|
| `src/tools/CaptureTool/prompt.ts`、`src/tools/CreateTool/prompt.ts`、`src/tools/CreateTool/CreateTool.ts:25` | 5 | agent 可见 |
| `src/application/internal/capture-section.ts:54,59,377`、`src/application/query/QueryState.ts:223` | 4 | agent 可见（注入串/状态 note） |
| `src/domain/gate/GateCatalog.ts:28`、`src/application/internal/support.ts:894,900,951`、`src/application/use-cases/CreateRequirement.ts:130` | 6 | 弹框问题卡/台账留痕（未来记录生效，不回改历史） |
| `src/index.ts:6,903`、`src/shared/protocol.ts:2177`、`src/wiring/pm-capture-root.ts:164`、`src/application/internal/advance-draft.ts:3,23,24`、`src/application/internal/volatile-notice.ts:329`、`src/application/use-cases/CaptureRequirement.ts:221`、`src/domain/prompt/difficulty-mapping.ts:2`、`src/domain/gate/GateSpec.ts:27` | 12 | 代码注释 |
| `README.md:12,51` | 2 | 人读文档（两处内部不一致同源消除） |

**CreateTool doc_location 补齐**：`CreateTool/prompt.ts` 参数清单补 `doc_location`
（语义与 `CreateTool.ts:50` schema 逐字同源：工作区相对目录，不传回落
`docs/requirements/<REQ>/` 并在 defaults_used 标注）。prompt 里「三问取值」相关表述
一并按不数数规则改写。

**验证**：`grep -rn "三问\|四问\|五问" src README.md --include=*.ts` 仅命中
`capture-mapping.ts`（事实源）；既有 capture/create 契约测试不红
（断言了三问号样的测试同步改断言文本，不断言数字）。

## FR-3 submit 描述瘦身与细则下沉设计 <!-- serves: FR-3 -->

**description 目标形态**：开头一句「提交阶段产物（kind 区分产物类型，提交后请人确认/审核）」
——不数类数；每 kind 一句话（requirement / design / plan / verification / archive / **prototype**），
prototype 支文案：「kind=prototype（brainstorming 阶段）：登记权威原型——path 缺省扫
`docs/requirements/<REQ>/prototypes/*.html`（旧目录 `prototype/*.html` 仍识别并提示迁移），
传了只登记该份；抽锚点与几何量写产物元数据」。头部注释「4 个/五个」等计数一并消除。

**细则下沉去向**（规则文本不丢失，只换位置）：

| 细则块 | 现位置 | 下沉位置 |
|--------|--------|---------|
| kind=plan 任务表硬性要求 ①②③ | `SubmitTool/prompt.ts` | `SubmitArtifact.ts`（:364-387 一带）与 `artifact-gates.ts` 的 plan 门禁拒绝回执 message——哪条门禁拒，哪条 message 带对应细则要点 |
| kind=archive 必填文档与去向限定 | `SubmitTool/prompt.ts` | `SubmitArchive.ts` 的缺项/非法去向拒绝回执 message（附 ARCHIVE_DOC_RULES 该 category 的限定表） |
| kind=requirement / verification 的既有细则 | `SubmitTool/prompt.ts` | **不动**（G3 原表只批 plan/archive 下沉；这两块是 2026-10-06 加固时明确选择放 description 的，改动超出本批授权） |

**预算判据（校准值）**：实测口径 = 工具工厂产物的 description 字符数（report §3.3 同口径）。
基线 description 1,980 → 目标 **≤ 1,300**（下沉两块约 700 字符）；总量（desc+params）
从 5,881 降到 **≤ 5,200**（params 不动）。新增 vitest 断言 `SUBMIT_PROMPT.length ≤ 1300`
（挂在既有 prompt 契约测试体系，阈值随断言文本同文件可审计）。

**行为等价**：description 文本变化不改工具 schema、分派表与任何错误码；
下沉后拒绝回执的 **code 不变**、message 文本变长（message 非契约键，既有断言
message 精确串的测试同步更新）。

## FR-4 历史叙事清理设计 <!-- serves: FR-4 -->

**删除/改写清单（12 处 agent 可见 + 功能性例外 1 处）**：

| 现场 | 处置 |
|------|------|
| `SubmitTool/prompt.ts:18`（「2026-09-21 起设计阶段只写设计文档」） | 删日期叙事，保留规则本身（「设计阶段只写设计文档」） |
| `SubmitTool/prompt.ts:27-31`（REQ-261006092213-4f5b FR-1/FR-2） | 删编号引用，规则保留；出处挪同文件头注释 |
| `RunStatusTool/prompt.ts:22-26`（两段修复史） | 整段删（形状说明保留）；修复史挪同文件头注释 |
| `CaptureTool/prompt.ts:21`（REQ-260922012924-2e29 FR-5） | 删编号，「拒绝粘滞」规则保留；出处挪头注释 |
| `AskConfirmTool.ts:62,63,64,67` schema 描述内编号 | 删编号前缀，描述正文保留 |
| `SubmitTool.ts:198,432,459,490` schema 描述内编号 | 同上 |
| `StatusTool.ts:159,174` schema 描述内编号 | 同上 |
| `HandoffTool.ts:89` schema 描述内编号 | 同上 |
| **例外** `SubmitTool/prompt.ts:15`（「2026-10-06 12:00 UTC 之后立项」） | **保留原文**——功能性 cutoff 判据（门禁真拿它做时间比较），不引入版本标记新机制（收益低、改动面超本批） |

**验证**：对 agent 可见面 `grep -rn "REQ-2[0-9a-z]\|REQ-e" src/tools/**/prompt.ts 及各 Tool.ts 的 description 行`
零命中；`RunStatusTool` description 字符数较 810 基线下降；引叙事做断言的测试同步改断言。

## FR-5 长文本注记拆分设计 <!-- serves: FR-5 -->

**常量拆分（`src/tools/shared.ts`）**：

- `LONG_TEXT_STYLE_NOTE` = 「写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号」（新）
- `LONG_TEXT_SPLIT_NOTE` = 「；文本过大拆成多次调用」（新）
- `LONG_TEXT_ARG_NOTE` = STYLE + SPLIT（保留导出，兼容现有引用语义）

**逐点处置表**（10 处引用，判定依据 = 该工具重放同一入参是否产生第二次副作用）：

| 现场 | 处置 | 理由 |
|------|------|------|
| `TaskReportTool.ts:23,26,34`（summary/completed/next_step） | 保留全句 | 幂等追加（重复汇报追加段落不重复登记），拆分调用是设计用途 |
| `AskConfirmTool.ts:31`（question） | 保留全句 | 同门复用幂等（重复发起返回既有 ticket，不开第二框） |
| `SubmitTool.ts:51`（summary） | 保留全句 | 登记幂等（重复登记跳过）；注：plan 重交作废旧批准是 change_note 路径的既定语义，非本注记引入 |
| `CaptureTool.ts:46`（summary） | **撤 SPLIT 留 STYLE** | 一次性（作答即立项建 REQ），拆两次 = 立两条 |
| `HandoffTool.ts:48`（reason） | **撤 SPLIT 留 STYLE** | 一次性（换 owner + 投底稿），拆两次 = 交接两回 |
| `TaskMoveTool.ts:111`（reason） | **撤 SPLIT 留 STYLE** | 一次性（状态推进 + 60s 节流），拆两次第二次吃节流/非法迁移 |
| `NoteInterruptionTool.ts:24`（reason） | **撤 SPLIT 留 STYLE** | 一次性（同一需求只留一个断点，后写覆盖——虽幂等但「拆成多次」指引语义错误，理由原文应一次写全） |
| `AdoptTaskTool.ts:50`、`RegenerateTool/index.ts:47`（reason） | **撤 SPLIT 留 STYLE** | 一次性补救动作（挂载/补链），重复执行无意义且理由应单条完整 |

**单源恢复**：8 处内联整句复制全部改回常量拼接（STYLE 或 STYLE+SPLIT），
`grep "文本过大拆成多次调用" src/tools` 的命中行必须全部可归属到上表「保留全句」行。
shared.ts:35 的既有注释同步更新三锚点说明。

## FR-6 ask_confirm 拦截清单与 budget CAS 描述设计 <!-- serves: FR-6 -->

**拦截清单改写（`AskConfirmTool/prompt.ts:16`）**：枚举四工具名改为定性表述——
「阻塞期间本窗口**全部写路径**（提交/拆分/推进/任务推进/修缮/kb 等写工具）被
REQBOARD_CONFIRM_PENDING 拦住」。不枚举即无漂移面（实测已挂 9 个：
submit/decompose/move/task_move/archive_amend/task_refs/task_adopt/task_regenerate/kb）。
不选机械派生方案（从 assertNoPendingConfirm 挂载面生成文案）：成本高、文案生成质量差，
且「全部写路径」的定性表述已穷尽语义。
`tests/ask-confirm-prompt.test.ts` 断言同步改（断言「全部写路径」字样在场、四工具枚举不在场）。

**budget 父对象描述（`TaskMoveTool.ts` budget.description）**：末尾补一句
「可带 expectedWindowIndex（CAS 号）：与你看到的窗口号一致才换窗，不一致拒绝并回当前号」
——属性级描述已有，父对象补存在性指引。schema 结构零变化。

## FR-7 残留清理设计 <!-- serves: FR-7 -->

| 现场 | 处置 |
|------|------|
| `cordis.patch.yml:9` 注释「13 个 `reqboard_*` 工具」 | 改「全部 `reqboard_*` 工具」（不数数，与 FR-2 同纪律） |
| `package.json` `repository.directory: agent-dh/packages/web/dsh-pmboard` | **删除该键**（本仓即仓库根，无子目录语义） |
| `package.json` `repository.url: git+https://github.com/kakaCat/pi-investment.git` | 改为 `git+https://github.com/kakaCat/dsh-pmboard.git`（与 `git remote -v` origin 一致；原 url 同为 monorepo 残留） |

验证：`pnpm build`、`pnpm typecheck` 不受影响（repository 字段不参与构建）；
`grep -n "13 个" cordis.patch.yml` 零命中。

## 文件结构改动清单 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

**修改**（按组归并，一处一行）：

- FR-1：`src/tools/SubmitTool/prompt.ts`、`src/application/internal/capture-section.ts`、
  `src/client/views/verification.ts`、`src/shared/protocol.ts`、
  `src/domain/artifact/ArtifactSpec.ts`、`src/domain/errors.ts`、
  `scripts/prompt-path-probe.mts`（扩面+注释剥离+禁词前缀+specimen）、`package.json`（prompts:check 接线）
- FR-2：`src/tools/CaptureTool/prompt.ts`、`src/tools/CreateTool/prompt.ts`、`src/tools/CreateTool/CreateTool.ts`、
  `src/application/internal/capture-section.ts`、`src/application/query/QueryState.ts`、
  `src/domain/gate/GateCatalog.ts`、`src/application/internal/support.ts`、
  `src/application/use-cases/CreateRequirement.ts`、`src/application/internal/capture-mapping.ts`（注释口径）、
  及上表 12 处注释文件、`README.md`
- FR-3：`src/tools/SubmitTool/prompt.ts`、`src/tools/SubmitTool/SubmitTool.ts`（头注释）、
  `src/application/use-cases/SubmitArtifact.ts`、`src/application/internal/artifact-gates.ts`、
  `src/application/use-cases/SubmitArchive.ts`（拒绝 message 附细则）
- FR-4：`src/tools/SubmitTool/prompt.ts`、`src/tools/RunStatusTool/prompt.ts`、
  `src/tools/CaptureTool/prompt.ts`、`src/tools/AskConfirmTool/AskConfirmTool.ts`、
  `src/tools/SubmitTool/SubmitTool.ts`、`src/tools/StatusTool/StatusTool.ts`、`src/tools/HandoffTool/HandoffTool.ts`
- FR-5：`src/tools/shared.ts`（常量拆分）、上表 10 处引用点文件
- FR-6：`src/tools/AskConfirmTool/prompt.ts`、`src/tools/TaskMoveTool/TaskMoveTool.ts`
- FR-7：`cordis.patch.yml`、`package.json`
- 测试同步：`tests/ask-confirm-prompt.test.ts` 及引用了被改文案做断言的既有测试
  （实施时以 `pnpm test` 红绿为准逐一定位）

**新建**：`tests/prompt-path-probe-tools-surface.test.ts`（或并入既有探针测试文件——
断言新扫描面在场、禁词前缀规则生效、specimen 必红）、submit description 预算断言用例
（挂既有 prompt 契约测试文件或独立 `tests/submit-prompt-budget.test.ts`）。

**删除**：无。

## 接口与契约 <!-- serves: FR-1, FR-3 -->

**探针契约（扩展后）**：命令 `tsx scripts/prompt-path-probe.mts [--json|--specimen]`；
退出码语义不变（0 全过 / 1 有缺口逐条点名 / 2 前置错误）；输出形态不变
（token + 文件:行 + 修复提示）。新增契约面仅两处：扫描面清单（SCAN_DIRS/SCAN_FILES
增加条目）与 `FORBIDDEN_PATTERNS`（命中即缺口、不可白名单）。
`prompts:check` = `inline-prompt-fragments + check-prompt-fragments + prompt-path-probe` 三段与门。

**description 预算契约**：`SUBMIT_PROMPT.length ≤ 1300`（vitest 断言，阈值常量在断言旁
注释基线与校准日期）；kind=prototype 支一句话文案在场断言。

**不变契约（逐字不动）**：全部工具 schema 结构与键名、SUBMIT_DISPATCH 分派表、
全部错误码（大写码与小写领域码）、拒绝回执的 code 与键结构、状态机与门禁判定逻辑、
探针的退出码语义与白名单准入条件。

## 依赖与调用方清单（refactor 档） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 改动点 | 谁调用/谁读 | 怎么验证没漏 |
|--------|------------|-------------|
| 各 prompt.ts / schema description | 宿主工具注册面（每轮请求发给 LLM） | `tests/readme-tool-face.test.ts`、`output-contract.test.ts` 等工具面契约测试 + 预算断言 |
| `capture-section.ts` 注入串 | 会话注入面（pm-capture-root 组装） | 既有 capture 相关测试 + grep 判据 |
| `client/views/verification.ts` | 看板验收页（GUI 渲染） | `pnpm build:client` + verify:client（kb C-12）；D-1 裁定：纯字符串替换，无视觉/交互变化（豁免依据） |
| `scripts/prompt-path-probe.mts` | `prompts:check`、`scripts/kb-conventions-sync.mts` 命令登记、`scripts/reverse-drill-matrix.mts`、`tests/kb-operations.test.ts` | 三处引用方逐一跑通；`--specimen` 反例必红 |
| `LONG_TEXT_ARG_NOTE` 常量 | 10 处引用点（见 FR-5 表） | grep 全量引用点逐一归属；layer-boundary 测试不红 |
| 拒绝回执 message（plan/archive） | 调用 submit 的 agent / 看板 | 负例用例：构造违规提交，回执 code 不变、message 含细则要点 |
| `package.json` repository | npm 元数据（发布/展示） | `pnpm build && pnpm typecheck` 退出码 0 |
| `cordis.patch.yml` | DSH bundle 装载器 | 注释改动不影响 YAML 结构；装载行为不变 |

## 边界与不做 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 只做 requirement.md「边界」节授权的七组 + 机械检查；G4/G5/G10、工具面精简 S1~S6、
  H3、M1/M3/M4/M5 一律不动。
- requirement/verification kind 的 description 细则不动（FR-3 表内声明）。
- `SubmitTool/prompt.ts:15` 的日期 cutoff 判据原文保留（FR-4 表内声明）。
- 探针只判「路径可达 + 禁词前缀」，不判内容对不对（既有判据边界声明沿用）。
- 台账历史记录（既有需求评论里的「三问」字样）不回改，只改未来留痕的模板文案。
