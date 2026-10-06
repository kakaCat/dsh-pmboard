---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 用户场景（REQ-261005105032-3b02） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11

> 本文只承载需求文档放不下的**多角色 / 多分支**场景：谁在什么情形下做什么、系统必须给出什么。
> 契约源 `notes/design-brief.md`；条款源 `requirement.md`（FR-1~FR-11、D-1~D-15）。
> 文中路径、字段、错误码逐字引用 brief，**不自行发明**；`design-brief.md` §10 的 44 条决议（行内以 `#N` 引用）已在本份逐处回填，无遗留待定。

## 场景总览 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11

| UC | 角色 | 一句话 | serves |
|---|---|---|---|
| UC-1 | PM + 需求阶段 agent | 需求阶段交出**唯一权威**、带 FR 锚点与几何量声明的原型 | FR-1, FR-2, FR-3, FR-4 |
| UC-2 | 需求阶段 agent + PM | 讨论中的裁定逐条落账成 D-x（疑问句不算、允许真空态） | FR-8, FR-11 |
| UC-3 | agent + 人 | 门禁拒绝后按 what-why-how 补件；豁免必须由人在 G1 确认 | FR-1, FR-8 |
| UC-4 | 自动链子代理（实施） | 提示词带原型路径、本卡锚点、本卡 D-x 原话 | FR-5, FR-6, FR-9, FR-11 |
| UC-5 | 人（G1 与 G4） | 两道裁决：确认需求文档（含豁免）、验收单「与原型对照」 | FR-1, FR-2, FR-7, FR-9 |
| UC-6 | 接手窗口（交棒 / 新窗口） | 只看节点输入包也能看到原型与 D-x | FR-9, FR-10 |
| UC-7 | PM（非 UI 需求）+ agent | 非 UI 需求不被加仪式：无原型门、无对照项 | FR-1, FR-6 |

UC 编号即引用键；任务侧的 covers 引用在设计阶段**不填**（卡还不存在，编造即假引用），落库后由既有 backfill 机制回填（#28）。

## UC-1 PM 在需求阶段交付原型 serves: FR-1, FR-2, FR-3, FR-4

| 项 | 内容 |
|---|---|
| 角色 | PM（口述功能点、评审原型）· 需求阶段 agent（落盘骨架、填锚点、登记） |
| 触发 | 需求处于 `brainstorming`，分类为 feature/refactor 且 front-matter `sides` 含 `frontend` |
| 前置 | 已立项；无有效的 `prototype_exempt`（见 UC-3） |
| 完成标志 | 存在门 / 权威版本门 / 锚点门三关全过，且 `kind=prototype` 已登记进台账 |
| 后置条件 | `prototypes/` 下唯一权威原型 + `prototypes/INDEX.md`；产物元数据含锚点与几何量清单 |

**主流程**

1. 进入 brainstorming 时按模板 `templates/brainstorming/prototype.html` **幂等落盘**骨架到 `docs/requirements/<REQ>/prototypes/<name>.html`（不存在才写，永不覆盖已写内容）。
2. agent 按 PM 口述填原型：每个功能点一个 `id="FR-N"` 区块（与需求条款同号），并加单块注释 `<!-- proto-geometry {json} -->`。
3. geometry 形状：`{"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]}`——**只放观测量名与实测值，禁止放阈值**（D-10）；值域 `unit ∈ {px, count, ratio}`、`at.state ∈ {inflight, terminal}`，`observations[].name` 块内唯一（#5）。
4. 写权威清单 `prototypes/INDEX.md`（表格，列：`路径 ｜ 状态 ｜ 服务条款 ｜ 被取代于`；状态值域 `authoritative` / `superseded`；`authoritative` **恰好一条**）。
5. 登记 `reqboard_submit(kind=prototype)`：登记时抽取 FR 锚点与几何量清单写进产物元数据，供下游门禁、探针、卡片直接引用。
6. 权威原型必须覆盖「服务条款」列声明的每个 FR；`requirement.md` 与 `design/frontend.md` 引用的原型路径必须**等于** INDEX 的权威路径。

**异常流**

| 异常 | 触发条件 | 机制 | 错误码 | 恢复 |
|---|---|---|---|---|
| 缺锚点 / 缺几何量 | 权威原型未覆盖某条「服务条款」，或缺 `proto-geometry` 块，或 geometry 里出现阈值字段 | `checkPrototypeAnchorsGate` 拒并点名缺哪条 | `prototype_anchor_missing` | 补 `id="FR-N"` 区块 / 补观测块；阈值移出原型，改由设计阶段按真实页面数据定死（D-10） |
| 两版并存 | INDEX 缺失、`authoritative` 条数 ≠ 1（多条或零条） | `checkPrototypeVersionGate` 拒并点名两份路径 | `prototype_version_conflict` | 旧版在 INDEX 标 `superseded` 并填「被取代于」，只留一条 `authoritative` |
| 引用作废版 | `requirement.md` / `frontend.md` 里的原型路径指向 `superseded` 版本 | 同一门禁拒（正对 REQ-292a「需求文档指上一版」事故形态，D-6） | `prototype_version_conflict` | 把引用改指权威路径；**不为迁就旧引用而改 INDEX** |
| 落在旧目录 | 原型在旧路径 `prototype/*.html`（REQ-292a 形态） | 仍识别为 prototype，门禁消息提示迁移 | （随存在门消息给出的迁移提示） | 迁到 `prototypes/`，同步 INDEX 与引用 |
| 观测块不止一块 | 原型内出现**多块** `proto-geometry` 注释 | `checkPrototypeAnchorsGate` 拒并点名块数（必须恰好一块，#4） | `prototype_anchor_missing` | 合并为一块观测块后重登记 |

**决议（brief §10）**

- 观测值**量原型稿自身渲染**，且必须显式带窗口宽与状态——避免 REQ-292a「漏传窗口宽量错」；无法量化者由人给并标 `source: "human"`（缺省 `"prototype"`）（#8）。
- `INDEX.md` 由 **agent 手写**，登记只**校验不改写**（保持"登记不改产物内容"纪律）（#9）。

## UC-2 agent 在 brainstorming 逐条落账 D-x serves: FR-8, FR-11

| 项 | 内容 |
|---|---|
| 角色 | 需求阶段 agent（落账者）· PM（裁定的产生者） |
| 触发 | 讨论中人的祈使 / 纠正 / 补充；或交需求文档前的自查（片段与回合指令已提示落账） |
| 前置 | `requirement.md` 已有（或正在写）需求正文；分类为 feature（该节仅 feature 模板，D-12） |
| 完成标志 | `## 讨论与裁定记录（D-x）` 节存在且条目全部有效（或显式真空态） |
| 后置条件 | 每条 D-x 可被设计章节、拆分阶段任务表、实施提示词、RTM、验收单引用（见 UC-4 / UC-5） |

**主流程**

1. 在 `requirement.md` 的 `## 讨论与裁定记录（D-x）` 节用**表格**逐条落账：`编号 ｜ 原话来源 ｜ 裁定 ｜ 影响 FR ｜ 判据`（五列齐）。
2. 编号写作 `D-1`、`D-2`…——**连续、唯一**，与 `FR-x` 各自独立命名空间（编号白名单新增 `D-\d+`，现测 `collectIds('D-1')` = `[]`）。
3. `原话来源` 非空（会话消息 id 或时间戳 + 引用原话）；`影响 FR` 必须命中真实 FR 条款。
4. 门禁的「留痕」判据是**启发式**：会话中人类消息含祈使标记（`改成 / 不要 / 必须 / 加上 / 应该是 / 记得 / 注意 / 别 / 要`）→ 视为存在裁定留痕；**该启发式只用于"要求本节非空"，不判条目内容**。
5. 落完账再交需求文档；G1 确认后随需求文档一起进设计（见 UC-5）。

**边界（D-11：什么算裁定）**

| 情形 | 判定 | 后果 |
|---|---|---|
| 祈使句 / 纠正 / 补充要求 | **算裁定** | 必须落账，否则门禁拒 |
| 疑问句、事实确认 | **不算裁定** | 不要求落条 |
| 讨论中确实没有裁定 | 整节写「本节无裁定」（**真空态**） | 不视为空节，放行；禁止硬凑条目过门禁 |
| 只有概括句 / 缺 `原话来源` / 缺 `影响 FR`（或 FR 不命中真实条款） | **无效条目** | `decision_entry_invalid`，gaps **逐条点名编号** |
| 分类不是 feature | 本节仅 feature 模板要求（D-12） | 同族其余模板按需再补，本需求不锁 |

**异常流**

| 异常 | 触发条件 | 机制 | 错误码 | 恢复 |
|---|---|---|---|---|
| 缺节 | 会话有裁定留痕，但需求文档没有该节 | 需求阶段门禁拒 | `decision_log_missing` | 按模板补该节骨架并逐条落账 |
| 空节 | 有节但零条目，且写不出「本节无裁定」的反证（确有人下过裁定） | 同上门禁拒 | `decision_log_missing` | 回到会话逐条落账（含原话引用） |
| 条目无效 | 五列缺一、`原话来源` 空、`影响 FR` 指空 | 逐条点名 | `decision_entry_invalid` | 按点名编号补列 |

## UC-3 门禁拒绝与恢复（what-why-how + 豁免需人确认） serves: FR-1, FR-8

| 项 | 内容 |
|---|---|
| 角色 | agent（被拒方、补件方）· 人（豁免的裁决者） |
| 触发 | 调四条转移路径之一把需求从 `brainstorming` 推向 `design` 时被拒 |
| 前置 | 需求已绑定本窗口；产物登记与门禁读盘同根 |
| 完成标志 | 补件后再次推进通过；或豁免被人生效且留痕 |
| 后置条件 | 拒绝**不改台账状态**；补件/豁免过程可审计 |

**主流程**

1. 门禁按序判：原型存在门 → 权威版本门 → 锚点门 → 裁定记录门；任一门不过即拒（`brainstorming → design` 不放行）。
2. 拒绝消息用统一信封：**lead 一句结论 + what（缺什么：点名路径 / 条目 / 版本）+ why（为什么算缺）+ how（放哪、用什么命令补）**。
3. 接线方式（#46）：**不动**同步单点 `assertArtifactGates(req, from, to)`（保持产物存在 / 确认职责）；新增**唯一** async helper `contentGatesForMove(docs, req, from, to)`（放 `content-gate-wiring.ts`，内部按转移分派到原型门 / 裁定门），四条路径在同步门**之后**调用它。
4. 四条路径判据一致：`MoveRequirement`（会话语义 `reqboard_move`）· `AskConfirm` 的推进块 · 看板移动端点 · `ConfirmArtifact` 的自动推进；回归用例每条各断言一次，**同时锁既有 G2 与新门**——缺任一即红（REQ-292a 教训：某条路径漏门 = 后门）。
5. **不合并既有 G2 调用**（避免把本需求扩成重构）；未来若要收敛成单一 async 入口，另立项（#46）。
6. 补件后重试同一动作；门禁为纯判据，不自动改产物、不自动改 INDEX。
7. **豁免路径**：`requirement.md` front-matter 写 `prototype_exempt: <理由>`；生效条件是**理由非空 + requirement 产物已落章（G1 已确认）**——不新增弹框，搭 G1 的车（D-13）。

**错误码 → 缺什么 → how 补**

| 错误码 | 缺什么 | how | 会话侧传输码（#35） |
|---|---|---|---|
| `prototype_missing` | sides 含 frontend 且无已登记 prototype，且无有效豁免 | 补 `reqboard_submit(kind=prototype)`；或走豁免（理由非空 + 人确认） | `REQBOARD_MISSING_PROTOTYPE` |
| `prototype_version_conflict` | INDEX 缺失 / `authoritative` ≠ 1 / 文档引用指向 `superseded` | 收敛到唯一权威版本并在 INDEX 标注状态 | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` |
| `prototype_anchor_missing` | 权威原型缺 `id="FR-N"` 覆盖、缺 `proto-geometry` 块、或 geometry 含阈值 | 补区块与观测块；阈值移出原型 | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` |
| `decision_log_missing` | 缺 `## 讨论与裁定记录（D-x）` 节，或有留痕而节为空 | 补节并逐条落账，或写「本节无裁定」 | `REQBOARD_DECISION_LOG_MISSING` |
| `decision_entry_invalid` | 条目五列不齐 / 来源空 / 影响 FR 空 | 按 gaps 点名的编号逐条补齐 | `REQBOARD_DECISION_ENTRY_INVALID` |

**豁免异常流（D-13）**

| 情况 | 结果 |
|---|---|
| `prototype_exempt` 理由为空 | 豁免无效，仍拒 `prototype_missing` |
| 理由非空、但 requirement 产物**未落章** | 仍拒——**agent 不能自己豁免自己** |
| 理由非空 + G1 已被人确认 | 放行；豁免理由随 G1 留痕可审计 |

**决议（brief §10）**

- 豁免不靠弹框文案兜底：`prototype_exempt` 必须在 requirement 的 D-x 里有一条裁定记录，人确认文档时必然看到；弹框文案带该行写进片段纪律（**不作机器强制**）（#10）。
- 拒绝消息只定 what/why/how 模板与**必含 token**（文件路径 + 可执行命令），逐字文案由实现按既有 `envelope` 风格落地（#11）；新门的 `how` **必须含可执行锚点**（`reqboard_submit(kind=prototype)` 或 `templates/…`），`prototype_exempt` 已并入 `GATE_HOW_ANCHOR`（#40、#44）。
- 会话侧传输码走**显式映射表**，未知内部码**原样透传**（不静默降级为 `MISSING_ARTIFACT`）（#35）。

## UC-4 实施子代理按原型锚点与本卡 D-x 原话干活 serves: FR-5, FR-6, FR-9, FR-11

| 项 | 内容 |
|---|---|
| 角色 | 自动链子代理 / 实施窗口 agent |
| 触发 | 父卡开工展开子卡链，`reqboard_task_run` 投递当前 ready 的子卡 |
| 前置 | 拆分阶段任务表里该 UI 卡「设计落点」已填原型锚点（形如 `prototypes/detail.html#FR-4`）、acceptance 含可失败的原型对照判据、卡上带关联 D-x |
| 完成标志 | 该卡 done，且原型对照判据（结构 + 几何量）在探针里硬判通过 |
| 后置条件 | E2E 探针几何量硬判据全绿；诊断行不再"只打印不判失败" |

**提示词必须带什么**

| 通路 | 文件 / 函数 | 带什么 |
|---|---|---|
| 子卡提示词 | `ExecuteTask.buildSubtaskPrompt` | **UI 卡**：原型路径 + 本卡锚点（`【本卡原型（UI 卡）】`）；**所有卡**：本卡关联 D-x 的**原话**（`【本卡裁定（D-x 原话）】`）+ `【验收判据】`（不只是 FR 标题，#12） |
| 回合指令 | `round-state.renderDiveRoundText` | implementing 回合提本卡 D-x / 锚点 |
| 片段注入 | `fragments/{implementing}/*.md` 与 `heavy/overrides.md` | 各节点"引用原型锚点 / D-x"的纪律（本仓段） |

1. 子代理按锚点**可以**去看原型——"只完成这一张卡、不要扩大范围"不构成不看原型的理由。
2. 卡片 acceptance 至少一条**可失败**的原型对照判据：结构断言（区块存在 / 顺序 / 层级）+ 几何量硬判据。
3. 判据的**阈值来自设计阶段按真实页面数据定死**，不由原型自证（D-10）；原型只提供观测口径。
4. 锚点引用走独立字段 `protoRefs`，**不计入 serves**（禁假引用：`collectIds('prototypes/x.html#FR-4')` 现状返回 `['FR-4']`）。

**异常流**

| 异常 | 触发条件 | 机制 | 恢复 |
|---|---|---|---|
| UI 卡缺原型锚点 | 任务表「设计落点」为空 | 拆分覆盖门在 `reqboard_decompose` 前拒 | 回拆分阶段补「设计落点」原型锚点 |
| acceptance 无对照判据 | 卡片验收只有"单测通过"类断言 | 计划提交/拆分内容门禁拒 | 补结构断言 + 几何量硬判据 |
| 探针"只打印不判失败" | 诊断行只打印几何量、不断言 | 源码级断言拒 | 升为硬判据，并做逆验证（人为改坏 → 必红） |
| 贴锚点刷覆盖度 | 只贴原型锚点、不写实现 | 锚点引用单列，覆盖度**不上升** | 补真实实现与判据 |

**决议（brief §10）**

- 三段渲染为**小节标题**（非 JSON 字段）：`【本卡原型（UI 卡）】`、`【本卡裁定（D-x 原话）】`、`【验收判据】`（#12）。
- 卡片承载编号的字段名与既有命名对齐：`TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（#36）。

## UC-5 人的两道裁决：G1 确认需求文档（含豁免）与 G4 验收 serves: FR-1, FR-2, FR-7, FR-9

| 项 | 内容 |
|---|---|
| 角色 | 人（G1 确认者、G4 验收者） |
| 触发 | ① `kind=requirement` 已登记未确认且原型门已过 → 弹「确认需求文档」（G1）；② 验收材料提交后验收单逐项裁决（G4） |
| 前置 | ① 需求阶段产物齐（requirement + prototype，UI 需求）；② `kind=verification` 已提交 |
| 完成标志 | ① G1 落章并自动推进 `brainstorming → design`；② 验收单逐项裁决完，缺项已补 |
| 后置条件 | 豁免随 G1 一并生效并留痕；G4 通过后归档 |

**两道裁决对照**

| 门 | 位置 / 载体 | 人裁决什么 | 缺失后果 |
|---|---|---|---|
| G1（确认需求文档） | `brainstorming → design`；`requirement` 产物已登记未确认 → 弹框 / 看板确认 | 需求文档是否成立；`prototype_exempt` 是否放行（**豁免一并裁决**，D-13）；"人看过原型"（原型产物确认，FR-2） | 不确认则推不动；豁免不生效 |
| G4（验收） | `accepting → archived`；验收单**逐项裁决**（per-item） | 每项验收，含 `prototype-compare`「与原型对照截图（含差异说明）」；**已批准 `prototype_exempt` 的需求不强制该项**，改为渲染一行豁免说明（#45） | UI 需求缺该项 → 提交验收材料即拒；**豁免已批准时不阻塞提交**（#45） |

1. G1 的肯定项 = 落章 + 自动推进；**不新增弹框**，豁免搭同一道门（D-13）。
2. G4 验收单对 UI 需求**自动增加** `prototype-compare` 项；每项可追 `FR-x` / `D-x`。
3. **豁免分支（#45）**：`prototype_exempt` 已批准 → 不强制 `prototype-compare`（批准不做原型 = 无原型可对照，否则自相矛盾）；验收单改为渲染一行**豁免说明**「本需求已豁免原型（理由：…）」，该项**不阻塞**验收材料提交。
4. **返工顺序固定**：验收时人发现"文档里没写" → **先补 D-x 条目，再改代码**，不允许直接改代码结单（FR-9）。
5. 非 UI 需求不出现「与原型对照」项（见 UC-7）。

**异常流**

| 异常 | 触发条件 | 机制 | 恢复 |
|---|---|---|---|
| 缺对照项 | UI 需求的验收材料无「与原型对照截图」 | 提交验收材料被拒：内部 `verification_prototype_compare_missing` + 传输 `REQBOARD_VERIFICATION_INCOMPLETE`（#38） | 补截图 + 差异说明后重交 |
| 已豁免却仍被要求对照 | `prototype_exempt` 已批准 | **不适用**：渲染豁免说明行、**不阻塞**提交（#45） | 无需补件；豁免理由随 G1 留痕可审计 |
| 验收项无编号追溯 | 验收项追不到 `FR-x` / `D-x` | 验收四件套（验什么 / 对应编号 / 怎么验 / 预期）缺口点名 | 补「对应编号」 |
| 人指出"文档没写" | 要求只存在于会话 | 返工工单要求先补文档 | 先补 D-x，再改代码 |

**决议（brief §10）**

- 原型门禁**只要求已登记**；确认章为可选加强；G1 确认需求文档时**一并展示原型路径**（#13）。
- 验收单第二个 item source 定名 **`decision-compare`**（与 `prototype-compare` 并列），载荷为 `{ kind:'prototype-compare'; prototypePath }` 与 `{ kind:'decision-compare'; decisionIds }`（#14、#37）。
- `prototype-compare` 的接口与判据（"UI 需求验收单缺该项即提交被拒"）由 `interfaces.md` 定；需求级验收标准是否补条目**留给用户决定**（#27）。

## UC-6 交棒 / 新窗口只靠节点输入包接手 serves: FR-9, FR-10

| 项 | 内容 |
|---|---|
| 角色 | 接手窗口（交棒后的新 owner） |
| 触发 | 上下文遗弃（交棒 / 节点边界）后新窗口 `reqboard_status` 重建节点输入包 |
| 前置 | 需求台账可读；节点输入包投影已生成 |
| 完成标志 | 新窗口只看输入包即可说出：原型是哪一版、覆盖哪些 FR、本阶段有哪些 D-x、下一步命令 |
| 后置条件 | 不依赖旧窗口对话即可续跑（对话不在投影里） |

**主流程**

1. 「证据指针」投影**含原型路径与 D-x**：`NodeInput.prototypeRefs?: string[]` 与 `NodeInput.decisions?: string[]` 两行（#15；`node-input-package.ts`，交棒底稿同源）。
2. 投影给的是事实指针（路径 / 编号 / 原话），不是复述：原型指向 INDEX 权威版本，D-x 指向需求文档条目。
3. 新窗口据此读 `prototypes/INDEX.md`、原型锚点、`## 讨论与裁定记录（D-x）`，无需旧上下文。
4. 断点（当前阶段 + 下一步命令）与输入包一起，构成续跑的全部依据。

**异常流**

| 异常 | 触发条件 | 机制 | 恢复 |
|---|---|---|---|
| 投影缺原型 / D-x | 输入包只带台账投影与产物路径（现状缺陷） | 视为契约缺陷，由路径可达性回归与输入包用例守住 | 补齐投影字段后重投 |
| 交棒底稿投递失败 | 目标窗口未收到底稿 | **不回滚交接**：目标窗口仍是 owner | 新窗口按断点 + 文档目录接手，台账可见 |
| 指到被取代版本 | 投影写死了非权威原型路径 | 引用一致性门（见 UC-1） | 改指 INDEX 权威路径 |

**决议（brief §10）**：字段名为 `NodeInput.prototypeRefs?: string[]`、`NodeInput.decisions?: string[]`，渲染在「证据指针」节的**两行**（#15）。

## UC-7 非 UI 需求不被加仪式 serves: FR-1, FR-6

| 项 | 内容 |
|---|---|
| 角色 | PM（纯后端 / 文档需求）· agent（实施） |
| 触发 | 立项 / 需求阶段判定 `sides` 不含 `frontend`（或分类不在 feature、refactor 内） |
| 前置 | `requirement.md` front-matter 的 `sides` 可解析 |
| 完成标志 | 需求正常走完需求阶段，全程未出现原型相关要求 |
| 后置条件 | 无原型产物、无原型 RTM 节、无对照验收项 |

**有 / 无原型的差异**

| 项 | UI 需求（feature / refactor 且 sides 含 frontend） | 非 UI 需求 |
|---|---|---|
| 需求阶段必备产物 | 追加 `kind=prototype`，缺则拒（`prototype_exempt` 已批准时放行，见 UC-3） | **不要求**，不落盘 `prototypes/` 骨架 |
| 权威版本 / 锚点门 | 生效 | 不生效 |
| RTM `prototypes` 节 | 必出现；缺 = 不健康并点名 | 不要求，缺节视为 `pending`（不判损坏） |
| `design/frontend.md` | 按既有条件必交 | 不要求 |
| 子卡提示词 | UI 卡带原型路径 + 锚点 | **不追加**原型段 |
| 验收单 | 自动加 `prototype-compare` 项；`prototype_exempt` 已批准时改渲染豁免说明、**不阻塞**提交（#45） | 不出现该项 |

**异常流**

| 异常 | 触发条件 | 机制 | 恢复 |
|---|---|---|---|
| sides 漏判 | front-matter 写法导致 `frontend` 未被解析（REQ-292a 形态） | `sides` 括号写法解析已在本窗口修好（同工作树已就位） | 修正写法即可；门禁只看解析结果 |
| 存量需求 | 已归档 8 条 + REQ-292a 在途 | 新门禁**不追溯**；RTM 旧文件读取不报错、不判不健康；健康判据带**适用性参数**——只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince` 的需求才判，存量一律 `exempted: legacy` 并如实报告（#19） | 不回填；REQ-292a 另行收尾 |

## 关键决策与取舍 serves: FR-1, FR-8, FR-10

> 主体写在 `architecture.md` 同名节；本份只列与本份主题（角色与分支）直接相关的取舍。

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 裁定进提示词的形式 | 只带 FR 标题 | **带 D-x 原话** | 概括不可证伪，原话才可核验（D-3 / FR-9） |
| 豁免怎么裁决 | 新增独立弹框 | **搭 G1 既有确认门**（理由非空 + 人确认） | 不新增弹框，人已有一次确认动作（D-13） |
| 非 UI 需求 | 一律要求原型 | **按 `sides` 条件必交** | 不给纯后端 / 文档需求加仪式（边界第 4 条） |
| 判据强度 | 像素 / 视觉相似度 | **结构 + 几何量 + 令牌** | 渲染差异会长期假红；阈值由设计阶段定死（D-10） |

## 技术方案与亮点 serves: FR-3, FR-4, FR-5, FR-11

> 同上：主体写进 `architecture.md`；本份只写与场景直接相关的手法差异。

| 差异点 | 常规做法 | 本方案 | 可核验指向 |
|---|---|---|---|
| 原型元数据抽取 | 引 HTML 解析库 | 单块注释 `<!-- proto-geometry {json} -->` + 正则抽取（与既有 doc 解析同风格） | 锚点门 `checkPrototypeAnchorsGate` 用例 |
| 权威版本 | 事后手写 README 说明 | `prototypes/INDEX.md` 两态表格（`authoritative` / `superseded`），复用既有表格解析 | 权威版本门用例（两版并存必红） |
| 锚点统计 | 锚点即 FR 引用（现状 `collectIds` 会误算） | `stripPrototypeAnchors` + 独立字段 `protoRefs`，不与编号引用混算 | 覆盖度**不上升**用例（禁假引用） |
| 门禁接线 | 只接一条转移路径 | 四条路径同一判据 + 一条用例各断言一次 | 缺任一即红（防后门） |
