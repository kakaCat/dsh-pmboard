---
requirement_id: REQ-261007200706-89b7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [frontend, backend]
prototype_exempt: 纯文案/注释级修改；唯一触碰的 client 文件是字符串常量替换（client/views/verification.ts 的帮助文案换路径），无视觉、交互、布局变化
---

# 需求说明（REQ-261007200706-89b7）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 排版纪律：段落不超过 4 行；并列项用列表或表格；图一律 ASCII，禁用 mermaid。

## TL;DR

- **现象**：reqboard 插件体检（REQ-261007165643-4275，已归档）裁决的第 2 批问题共 7 组文案/契约漂移
  （G1/G2/G3/G6/G7/G8/G9）：agent 可见文案里 8 处死路径引用、立项「几问」六处口径不一、
  submit prompt 说「五类」漏掉 prototype、12 处 REQ/FR 历史叙事、长文本注记被误挂到一次性副作用工具、
  ask_confirm 拦截清单只列 4 个写路径（实际 9 个）、cordis.patch.yml/package.json 残留旧计数与旧 monorepo 路径。
- **代价**：agent 照文案行动必踩坑——归档每次踩死链、对弹框问数预期错误、不知道原型登记入口存在、
  照「拆成多次调用」指引把一次性动作执行多遍。
- **做完得到**：agent 可见字符串与实现逐字对齐；新增「文案引用的仓内路径必须存在」机械检查，
  漂移从「靠体检报告发现」变成「提交即被拦住」。

## 背景与证据

证据全文：`docs/requirements/REQ-261007165643-4275/design/research-report.md`
（§3.1 C-1~C-6、§3.4、§3.7、§4.3 G 表）；长期摘要：`docs/strategy-research/reqboard-plugin-audit-2026-10-07.md`。
本窗口已逐一复核全部现场，行号与报告一致（2026-10-07 工作树基线，plugin build b23b4a90b389）：

| 组 | 报告证据 | 现场复核（本窗口 2026-10-07） |
|----|---------|------------------------------|
| G1 | C-3 | `grep -rn "agent-dh/docs" src` 命中 7 处（SubmitTool/prompt.ts:35、protocol.ts:983、capture-section.ts:161、ArtifactSpec.ts:58,75、client/views/verification.ts:253-254）；`errors.ts:10` 引 `docs/standards/tool-development.md`，`ls docs/standards` 不存在；`docs/architecture/archived-entry.md` 存在（修复去向） |
| G2 | C-1、C-4 | 实现 5 问（capture-mapping.ts:30-36 CAPTURE_QUESTION_IDS 五键）；文案三问/四问并存：CaptureTool/prompt.ts:2,4,10,11、CreateTool/prompt.ts:6,18、CreateTool.ts:25、capture-section.ts:54,59,377、index.ts:6,903、advance-draft.ts:3,23、QueryState.ts、README.md:12 vs :51；CreateTool.ts:50 有 doc_location 参数而 prompt.ts:11-12 未列 |
| G3 | C-2、3.3 | SubmitTool/prompt.ts:11「kind 区分五类」、头注释「五个提交入口」；实现 6 分派（SubmitTool.ts:29-36 SUBMIT_DISPATCH 含 prototype）；prompt 对 prototype 一字未提；submit 描述 5,881 字符占工具面总量 27% |
| G6 | 3.4 | agent 可见字符串 REQ/FR 编号引用：SubmitTool/prompt.ts:18,27-31、RunStatusTool/prompt.ts:22-26（两段修复史）、CaptureTool/prompt.ts:21、AskConfirmTool.ts:62,63,64,67、SubmitTool.ts:198,432,459,490、StatusTool.ts:159,174、HandoffTool.ts:89；SubmitTool/prompt.ts:15「2026-10-06 12:00 UTC」为功能性判据 |
| G7 | 3.7 | LONG_TEXT_ARG_NOTE（tools/shared.ts:5）含「文本过大拆成多次调用」；一次性副作用工具在挂：HandoffTool.ts:48（reason）、TaskMoveTool.ts:111（reason）、NoteInterruptionTool.ts:24（reason）、AdoptTaskTool:50、RegenerateTool:47、AskConfirmTool:31（内联同文案，未走常量——单源已破） |
| G8 | C-5、C-6 | AskConfirmTool/prompt.ts:16 只列 submit/decompose/move/task_move 四写路径；实际挂 assertNoPendingConfirm 共 9 个工具面（另含 archive_amend/task_refs/task_adopt/task_regenerate/kb）；TaskMoveTool.ts:128-131 budget.expectedWindowIndex 已有属性描述但 budget 父对象描述未提 CAS 参数存在 |
| G9 | 3.5 | cordis.patch.yml:9 注释「13 个 reqboard_* 工具」（实际 27）；package.json repository.directory = `agent-dh/packages/web/dsh-pmboard`（旧 monorepo 残留，本仓无 agent-dh 目录） |

与第 1 批（REQ-261007193530-3133，H1/H2-role/M2/M6 运行时行为修复）无文件交集冲突面：
本批只动文案、注释、schema 描述与检查脚本，不碰状态机与收敛点逻辑。

## 业务流程图

```
体检报告 G 表（7 组漂移）
        │
        ▼
逐组修复 ──────────────────────────────────────────┐
  G1 死路径 → 改指 docs/architecture/archived-entry.md 等真实路径
  G2 问数   → 文案不数问数 / 以 CAPTURE_QUESTION_IDS 为唯一事实源
  G3 submit → 「六类」+ prototype 支一句话；plan/archive 细则下沉拒绝回执
  G6 叙事   → REQ/FR 编号挪代码注释（功能性日期判据除外）
  G7 注记   → LONG_TEXT_ARG_NOTE 只挂幂等/追加语义工具
  G8 清单   → ask_confirm 改「全部写路径」；budget 描述补 expectedWindowIndex
  G9 残留   → cordis.patch.yml 计数 / package.json directory 清理
        │
        ▼
机械检查（G1 附带）：文案引用的仓内路径必须存在 → 挂 prompts:check / 测试体系
        │
        ▼
pnpm test 全绿 + pnpm typecheck 0 + 漂移负例被新检查拦下
```

## 产品定义

一句话：让 agent 可见的每一句话都与实现同一份事实，并给「文案引用仓内路径」装上机械门。

- **是什么**：7 组文案/契约修复 + 1 个机械检查脚本/测试。
- **不是什么**：不改任何运行时行为（状态机、门禁判定、工具分派、回执字段形状一律不动）；
  不做 G4（错误码注册表）、G5（错误码清单补全）、G10（双字段归一）——后续批次。

## 现状

- agent 可见字符串与实现漂移 7 组（G1/G2/G3/G6/G7/G8/G9），逐组现场见「背景与证据」复核表：
  8 处死路径引用、问数三/四/五并存、submit 说「五类」漏 prototype、12 处 REQ/FR 叙事、
  长文本注记挂错语义工具、拦截清单枚举 4 个（实际 9 个）、2 处 monorepo 残留。
- 防漂移检查现状：`scripts/prompt-path-probe.mts` 已存在，但扫描面只盖
  prompt fragments 与 round-state.ts，工具 description / 注入串 / GUI 文案是盲区；
  且未挂进任何 `pnpm` 检查命令。

## 目标结构

- 文案与实现同一份事实：派生量（问数/工具数/kind 数/写路径清单）在 agent 可见文案中
  不再以手写数字或枚举出现；细则住拒绝回执 message；出处住代码注释。
- 机械对账：prompt-path-probe 扩面到工具 description、注入串与 GUI 文案，
  新增禁词前缀硬规则（agent-dh/、docs/standards/ 不可白名单豁免），并挂进 `pnpm prompts:check`。
- 数据层结构不变：无新表、无新字段、无迁移。

## 行为不变式

- 工具 schema 结构与键名、submit 分派表、全部错误码、拒绝回执的 code 与键结构、
  状态机与门禁判定逻辑、探针退出码语义——逐字不变。
- 允许的变化面仅两类：agent 可见文本（description / 注入串 / GUI 文案 / 拒绝 message 文本）
  与代码注释；拒绝 message 变长是有意行为变化（FR-3 细则下沉），code 不变。
- 台账历史记录不回改；探针白名单准入条件不放宽。

## FR-1 死路径引用清零 + 仓内路径存在性机械检查（G1） <!-- serves: FR-1 -->

**是什么**：① 7 处 `agent-dh/docs/architecture/requirement-archive.md` 引用改指
`docs/architecture/archived-entry.md`（SubmitTool/prompt.ts:35、protocol.ts:983、
capture-section.ts:161、ArtifactSpec.ts:58,75、client/views/verification.ts:253-254）；
② `errors.ts:10` 的 `docs/standards/tool-development.md` 死引用改为指向真实存在的规范载体
或删路径只留约定描述（设计阶段定夺）；③ 新增机械检查：扫描 agent 可见字符串
（prompt.ts / schema description / client 文案）中的仓内相对路径引用，断言全部存在于工作树，
挂进 `prompts:check` 或测试体系。

**为什么**：agent 每次归档都踩死链（ retro 已记录「归档时 agent 真会去读它」）；
GUI 帮助文案同样可见。只修不防 = 下次漂移照旧，所以机械检查必须同批落地。

**可核验判据**：
- `grep -rn "agent-dh/docs" src --include=*.ts` 零命中；`grep -rn "docs/standards" src --include=*.ts` 零命中；
- 新检查（脚本或 vitest 用例）对当前工作树退出码 0，且含负例用例：
  人为注入一个不存在路径引用时检查失败（断言被触发）；
- 检查被 `pnpm prompts:check` 或 `pnpm test` 覆盖（CI 可跑，不是只存在于文档里的约定）。

## FR-2 立项问数口径统一（G2） <!-- serves: FR-2 -->

**是什么**：以 `capture-mapping.ts:30-36` CAPTURE_QUESTION_IDS（5 键）为唯一事实源。
agent 可见文案统一改为**不数问数**（只说「立项弹框」/「逐问作答」），消除三问/四问/五问并存；
README.md:12 与 :51 同源修正；`CreateTool/prompt.ts` 参数清单补 `doc_location`
（实现 CreateTool.ts:50 已有该参数，自称「降级路径的第四问」——prompt 漏列导致 agent 永远不设文档位置）。

**为什么**：「几问」是派生量，凡是手写数字的地方都会随实现演化而漂移（6 处漂移已证实）。
不数问数 = 没有可漂移的字面量；问数变化时只有 CAPTURE_QUESTION_IDS 一处改。

**可核验判据**：
- `grep -rn "三问\|四问\|五问" src README.md --include=*.ts` 在 agent 可见字符串中零命中
  （代码注释如保留须不含问数承诺；capture-mapping.ts 自身注释除外——它是事实源所在文件）；
- `grep -n "doc_location" src/tools/CreateTool/prompt.ts` 命中，且描述与 CreateTool.ts:50 schema 语义一致；
- 既有 capture/create 相关测试（capture-output-contract.test.ts 等）不红。

## FR-3 submit prompt「六类」+ prototype 支 + plan/archive 细则下沉（G3） <!-- serves: FR-3 -->

**是什么**：① SubmitTool/prompt.ts「kind 区分五类」→「六类」，补 kind=prototype 一句话
 （原型登记：扫 prototypes/*.html 或指定单份，抽锚点与几何量写产物元数据）；
 头注释「4 个/五个」数字同步消除。② kind=plan / kind=archive 的细则长文从工具 description
 下沉到对应拒绝回执消息（description 每 kind 只留一句话）——细则在「被拒那一刻」给出，
 与 G3 原表一致（证据 C-2 + §3.3：submit 描述 5,881 字符占工具面 27%）。

**为什么**：只读描述的 agent 不知道原型登记入口存在；而 description 每轮请求常驻，
细则放在 description 里 = 每轮为极少数违规场景付费。下沉后违规者仍能在回执里拿到完整规则。

**可核验判据**：
- `grep -n "六类" src/tools/SubmitTool/prompt.ts` 命中；prompt 含 prototype 支；
  `grep -n "五类\|五个提交入口" src/tools/SubmitTool` 零命中；
- 用 tsx 实测 reqboard_submit 的 description+参数描述字符数，较 5,881 基线显著下降
  （目标 ≤ 4,000，设计阶段可校准），且 plan/archive 细则文本不再出现在 description；
- 负例：构造缺 requirement_refs 的 plan 提交 / 缺必填文档的 archive 提交，
  拒绝回执 message 含对应细则要点（规则没有随下沉丢失）。

## FR-4 agent 可见字符串中的 REQ/FR 历史叙事清零（G6） <!-- serves: FR-4 -->

**是什么**：删除/改写 §3.4 清单 12 处 agent 可见字符串中的 REQ 编号与修复史叙事：
SubmitTool/prompt.ts:18（「2026-09-21 起」纯叙事）、:27-31（REQ-261006092213-4f5b FR-1/FR-2）、
RunStatusTool/prompt.ts:22-26（两段修复史）、CaptureTool/prompt.ts:21（REQ-260922012924-2e29 FR-5）、
AskConfirmTool.ts:62,63,64,67、SubmitTool.ts:198,432,459,490、StatusTool.ts:159,174、
HandoffTool.ts:89 的 schema 描述内编号。出处信息挪进同文件代码注释（人可读，agent 不可见）。
**例外**：SubmitTool/prompt.ts:15「2026-10-06 12:00 UTC 之后立项」是功能性日期判据
（门禁真拿它做 cutoff），不在删除范围；是否改版本标记留设计阶段定夺（本 FR 不强制）。

**为什么**：新用户无法判断这些编号是否需要行动，被引 REQ 文档未必存在，查了可能扑空；
12 处合计数百字符常驻每轮请求。

**可核验判据**：
- 对 agent 可见字符串面（`src/tools/**/prompt.ts`、各 Tool.ts 的 schema description）
  执行 `grep -rn "REQ-2[0-9]\|REQ-e\|REQ-47939a"` 零命中（代码注释除外——注释不进 description）；
- RunStatusTool 描述字符数较 810 基线下降且不含修复史段落；
- 既有 output-contract / prompt 相关测试不红（引用叙事做断言的测试同步更新）。

## FR-5 LONG_TEXT_ARG_NOTE 从一次性副作用工具撤下（G7） <!-- serves: FR-5 -->

**是什么**：「文本过大拆成多次调用」注记只保留在幂等/追加语义工具（task_report 等），
从一次性副作用工具的参数描述撤下：HandoffTool.ts:48（reason）、TaskMoveTool.ts:111（reason）、
NoteInterruptionTool.ts:24（reason）、AdoptTaskTool.ts:50（reason）、RegenerateTool/index.ts:47（reason）。
撤下的字段保留「每条短句 ≤60 字 / 引号用「」」的写法指引，只删「拆成多次调用」半句。
顺带把 8 处内联复制统一回 LONG_TEXT_ARG_NOTE 常量引用（拆成「写法指引」与「可拆调用」两段常量，
幂等工具拼全句，一次性工具只拼写法指引）——单源化是 G 表 S6 的同一纪律。

**为什么**：对一次性副作用工具，「拆成多次调用」= 指引 agent 把同一个动作执行多遍
（交接两遍、推进两遍），是危险指引；报告 §3.7 实测 11 处复用，其中多数挂在错误语义的字段上。

**可核验判据**：
- 上述 5 处一次性副作用字段的 description 不含「拆成多次调用」；
  `grep -rn "拆成多次调用" src/tools` 命中行全部属于幂等/追加语义工具（task_report/submit/capture/ask_confirm 问题字段等，逐行可归属）；
- LONG_TEXT_ARG_NOTE 拆分后的常量被全部引用点使用，`grep` 不再出现内联复制的整句
  （单源恢复）。

## FR-6 ask_confirm 拦截清单「全部写路径」+ budget CAS 参数描述（G8） <!-- serves: FR-6 -->

**是什么**：① AskConfirmTool/prompt.ts:16 的拦截清单「reqboard_submit / reqboard_decompose /
reqboard_move / reqboard_task_move」改为「本窗口全部写路径」（不枚举工具名——枚举必漂移，
实测已挂 9 个：另含 archive_amend/task_refs/task_adopt/task_regenerate/kb）。
② TaskMoveTool.ts budget 父对象 description 补一句：可带 expectedWindowIndex（CAS 号）
防并发覆盖（属性自身描述已有，父对象未提）。

**为什么**：阻塞期 agent 调未列出的写工具吃到「文案没说」的拒绝（C-5）；
budget 的 CAS 参数有 schema 而父描述不提，agent 不知道可以带号防并发覆盖（C-6）。

**可核验判据**：
- `grep -n "全部写路径" src/tools/AskConfirmTool/prompt.ts` 命中，且 prompt 不再枚举
  具体工具名清单（或枚举处明确写「以实际拦截为准」并改为派生检查——若设计阶段选机械派生，
  须有测试断言 prompt 与 assertNoPendingConfirm 挂载面一致）；
- `grep -n "expectedWindowIndex" src/tools/TaskMoveTool/TaskMoveTool.ts` 在 budget
  父对象描述中命中（不仅属性级）；
- 既有 ask-confirm-prompt.test.ts 断言同步更新并保持绿。

## FR-7 计数与旧 monorepo 路径残留清理（G9） <!-- serves: FR-7 -->

**是什么**：① cordis.patch.yml:9 注释「13 个 reqboard_* 工具」改为不数数的表述
（或对齐当前 27——推荐不数数，与 FR-2 同一纪律）；② package.json
`repository.directory = agent-dh/packages/web/dsh-pmboard`（旧 monorepo 残留）删除该键
或改为本仓真实相对位置（本仓即仓库根，删除即可）；顺带核对 repository.url 是否仍有效，
无效一并处理（设计阶段确认归属）。

**为什么**：旧计数与旧路径是 monorepo 拆分残留，误导打包与问题定位（3.5 节同源性记录）。

**可核验判据**：
- `grep -n "13 个" cordis.patch.yml` 零命中；
- `python3 -c "import json;print(json.load(open('package.json'))['repository'].get('directory'))"`
  输出 None 或不含 `agent-dh` 的值；
- `pnpm build` / `pnpm typecheck` 不受影响（package.json 改动不破坏发布脚本）。

## 失败与并发路径

- **失败路径**：本批全部为文案/注释/描述级修改 + 新增只读检查脚本，不引入新的运行时可失败点；
  唯一新增执行面是机械检查脚本，其失败语义 = 退出码非 0 并打印违规清单（标准检查脚本形态）。
- **并发重复**：检查脚本是只读扫描，可重复执行、无副作用；文案修改无状态。
- **状态机非法迁移**：不适用——不触碰状态机、转移表、门禁判定与回执字段形状
  （FR-3 的细则下沉只改拒绝回执的 message 文本内容，不改错误码与回执键结构）。
- **存量兼容**：已归档/进行中需求台账不受任何影响；client 文案改动随插件重构建生效，无数据迁移。

## 复现步骤

| 组 | 最小重现 |
|----|---------|
| G1 | agent 归档时读 prompt 指引的 `agent-dh/docs/architecture/requirement-archive.md` → 文件不存在 |
| G2 | 对照 CaptureTool/prompt.ts「四问」与 CreateTool/prompt.ts「三问」；调 reqboard_create 照 prompt 列参 → 永远不设 doc_location |
| G3 | 只读 reqboard_submit 描述 → 不知道 kind=prototype 存在；描述实测 5,881 字符 |
| G6 | 首次接触 agent 读 RunStatusTool 描述 → 两段修复史无法判断是否需要行动 |
| G7 | agent 照 handoff reason 的「拆成多次调用」指引 → 同一交接执行两遍 |
| G8 | 阻塞期调 reqboard_task_refs → 吃到 REQBOARD_CONFIRM_PENDING，而 prompt 清单里没列它 |
| G9 | 读 cordis.patch.yml 注释以为 13 个工具；按 package.json directory 找 monorepo 路径 → 不存在 |

## 根因

- **monorepo 拆分残留**（G1/G9）：文档与包元数据引用旧仓布局路径，拆分后无人清扫。
- **派生量手写**（G2/G9 计数）：问数、工具数是派生量，凡是手写数字的文案都会漂移；
  根治 = 不数数或从事实源派生。
- **description 当文档写**（G3/G6）：细则与历史叙事堆进每轮常驻的 description；
  正确位置是拒绝回执（细则）与代码注释（出处）。
- **好指引无语义边界**（G7）：LONG_TEXT_ARG_NOTE 为幂等工具设计，被无差别复制到一次性工具，
  且 8 处内联复制绕开常量单源。
- **枚举清单无机械对账**（G8）：prompt 枚举写路径清单，实现侧挂载面演化后无人同步。

## 边界

- **本批只做**：G1/G2/G3/G6/G7/G8/G9 七组 + G1 附带的机械检查。
- **不做**：G4（REQBOARD_* 错误码注册表）、G5（错误码 prompt 清单补全）、G10（双字段归一）——
  后续批次另立项；不动工具面精简（S1~S6）；不改任何运行时行为与回执字段形状；
  不做 H3（跨进程写锁）、M1/M3/M4/M5（第 3 批候选）。
- **留设计阶段定夺**：errors.ts:10 的替代指向；SubmitTool/prompt.ts:15 功能性日期判据
  是否改版本标记；G8 ① 选「全部写路径」措辞还是机械派生 + 对账测试；package.json
  repository.url 有效性处置；机械检查挂 prompts:check 还是 vitest。

## 回归

- 全部既有测试不动语义地保持绿：`pnpm test` 与基线（scripts/test-baseline.mts）比对无新增失败；
  引用被删叙事做断言的测试（ask-confirm-prompt.test.ts 等）同步更新断言文本。
- `pnpm typecheck` 退出码 0；`pnpm prompts:check` 退出码 0（含新增路径存在性检查）。
- `pnpm build` 成功（client 文案改动经 build:client + verify:client 验证）。

## 验收标准（汇总）

1. FR-1~FR-7 各自可核验判据全部通过（grep 证据 + 实测命令 + 负例用例）；
2. `pnpm test` 全绿且与基线比对无新增失败，`pnpm typecheck` / `pnpm prompts:check` 退出码 0；
3. 运行时行为零变化：状态机、门禁判定、工具分派、回执字段形状（错误码与键结构）逐字不变——
   只允许 description/message 文本与注释变化；
4. 不夹带：G4/G5/G10、工具面精简、H3、M1/M3/M4/M5 均不在本批。

## 裁定记录

| 编号 | 议题 | 结论 | 依据 |
|------|------|------|------|
| D-1 | 本需求声明 frontend 端侧（G1 触碰 client/views/verification.ts 帮助文案），是否需要原型 | 不需要，申请 prototype_exempt 豁免：唯一 client 改动是把死路径字符串常量替换为真实路径，无视觉、交互、布局变化，没有可供原型表达的内容 | front-matter `prototype_exempt` 理由 + 本裁定；豁免经人确认 requirement 产物后生效（agent 不能自己豁免自己） |

## 回滚

全部修改按组独立可回滚（`git revert` 单提交）；新增检查脚本删除即还原；
无数据迁移、无台账格式变化、无配置项新增。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-516ddb、t-540531、t-11f25a |
| FR-2 | ✅ 已接收 | t-d36c56、t-11f25a |
| FR-3 | ✅ 已接收 | t-ee9299、t-11f25a |
| FR-4 | ✅ 已接收 | t-352e17、t-11f25a |
| FR-5 | ✅ 已接收 | t-5acdf4、t-11f25a |
| FR-6 | ✅ 已接收 | t-6f52a8、t-11f25a |
| FR-7 | ✅ 已接收 | t-fed418、t-11f25a |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
