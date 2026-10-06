---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 测试用例设计（REQ-261005105032-3b02）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11 -->

> 覆盖基线：requirement.md 的 **22 条验收标准**（A 原型门禁 1~10 · B 裁定保真 11~14 · C 同源与校验 15~22），逐条至少一个用例。
> 契约源：`notes/design-brief.md`（下称 brief §N，含 **§10 待定项决议**）；待定点已按 §10 结论回填，§10 未列的一律**不自行发明**。
> 三层：纯函数用例（vitest）· 门禁集成用例（vitest，造标本跑门禁）· 探针（headless Chrome，真实渲染）。
> 被测对象一律带 `模块/函数（brief §N · FR-x）`；`covers`（任务卡编号）**设计阶段不填**——卡还不存在，编造即假引用——落库后由既有 backfill 机制回填（brief §10 #28）。

**命令与期望**

| 层 | 命令 | 期望 |
|---|---|---|
| 类型 | `pnpm typecheck` | 退出码 0 |
| 用例 | `pnpm test` | 全绿（含本表新增用例） |
| 片段同源 | `pnpm prompts:check` | 退出码 0（重生成 + 校验两条） |
| 探针 | `npx tsx scripts/req-*-probe.mts` | 退出码 0；人为改坏必非 0 |
| 文档自检 | `npx tsx scripts/req-doc-validate.mts` | 9 项全绿 |
| 知识层 | `pnpm kb:build && pnpm kb:check` | 全绿 |

**标本（测试数据，全表复用）**

| 标本 | 构造 | 用途 |
|---|---|---|
| S-1 | feature · `sides: [frontend]` · requirement 已登记 · 无 prototype 产物 · 无豁免 | FR-1 门禁基线 |
| S-2 | 同 S-1，但 prototype 已登记并落章；INDEX 一条 `authoritative`；锚点与 geometry 合法 | 放行路径基线 |
| S-3 | feature · `sides: [backend]` · 无 prototype | 非 UI 不受约束 |
| S-4 | INDEX 三态：0 条 / 1 条 / 2 条 `authoritative` | FR-3 权威唯一 |
| S-5 | 两版并存 + `requirement.md` 设计参照指向 `superseded` 版（复刻 REQ-292a） | FR-3 引用一致 |
| S-6 | 锚点缺陷原型三标本：缺 `id="FR-4"` 区块 / 缺 `proto-geometry` 块 / geometry 含阈值字段 | FR-4 判据 |
| S-7 | 裁定三标本：会话有祈使句留痕但无「讨论与裁定记录」节 / 有节但条目缺列 / 会话只有疑问句 | FR-8 落账门 |
| S-8 | UI 卡只贴 `prototypes/x.html#FR-4`，无实现、无编号引用 | FR-11 禁假引用 |
| S-9 | 存量标本：66 条需求旧 `rtm-*.yml`（缺 `prototypes`/`decisions` 节 + 未知 key）与 8 条 archived 需求 | 兼容基线（验收 9） |
| S-10 | 逾期三标本：设计已交完而编号链仍 orphan / 拆分已落库而 UI 卡无锚点 / 实施已收尾而 E2E 覆盖 false | FR-11 阶段时序 |

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

**A 组：原型门禁（FR-1 ~ FR-7 · 验收标准 1~8）**

（错误码：内部码见各用例；会话侧传输名按 brief §10 #35 显式映射——`REQBOARD_MISSING_PROTOTYPE` / `REQBOARD_PROTOTYPE_VERSION_CONFLICT` / `REQBOARD_PROTOTYPE_ANCHOR_MISSING`，未知内部码原样透传。）

| 编号 | 名称 | 被测对象（设计/FR） | 前置 | 步骤 | 期望 | 覆盖验收标准 |
|---|---|---|---|---|---|---|
| TC-1 | 不交原型出不了需求阶段 | `prototype-gates.checkPrototypePresenceGate`（brief §2 · FR-1） | S-1，无 `prototype_exempt` | ① 会话内 `reqboard_move(to=design)`；② 读错误码与文案 | 拒绝进入 design；内部码 `prototype_missing` / 传输码 `REQBOARD_MISSING_PROTOTYPE`（§10 #35）；消息点名缺什么、放哪、含可执行锚点 `reqboard_submit(kind=prototype)`（§10 #40/#44） | 1 |
| TC-2 | 四条转移路径各断一次门禁（缺任一即红） | `MoveRequirement` / `AskConfirm` 推进块 / `http/routers/requirements.ts` 移动端点 / `ConfirmArtifact`（brief §2 · FR-1） | 四个入口共用同一 S-1 标本 | ① 会话语义 `reqboard_move`；② 弹框确认后自动推进；③ 看板移动端点；④ 看板确认产物后自动推进 | 四条路径**全部**返回 `prototype_missing`（传输码一致，§10 #35）；**任一条放行即用例红**（09-29 快照同步丢过一条） | 1 |
| TC-3 | 交齐原型即放行 | 同上三条门 + 产物登记（FR-1 / FR-2） | S-2 | ① `reqboard_move(to=design)`；② 查产物元数据 | 放行到 design；登记态为已确认；元数据含锚点与 geometry 清单 | 1 |
| TC-4 | 非 UI 需求不受影响 | `DELTA.conditionalStageArtifacts`（`side: 'frontend'`）（brief §1 · FR-1） | S-3 | ① `reqboard_move(to=design)`；② 扫文案 | 放行；产物清单不追加 prototype；消息**不含**原型字样 | 1 |
| TC-5 | 豁免理由为空 → 豁免无效仍拒 | 豁免判定（`prototype_exempt` 理由非空）（brief §1 · FR-1 / D-13） | S-1 + front-matter `prototype_exempt:` 为空串或纯空白 | ① `reqboard_move(to=design)` | 仍拒 `prototype_missing`；不因「字段存在」而放行 | 2 |
| TC-6 | agent 不能自豁免（理由非空但未经人确认） | 豁免判定 × G1 确认门（brief §1 · FR-1 / D-13） | S-1 + `prototype_exempt: 本次仅样式微调`，requirement 未落章 | ① agent 直接 `reqboard_move(to=design)` | 拒；消息点出豁免需**人**确认（搭 G1，不新增弹框） | 2 |
| TC-7 | 人确认后豁免生效并留痕 | G1 确认门 + 豁免判定（FR-1 / D-13） | S-1 + 理由非空 + requirement 已落章 | ① `reqboard_move(to=design)`；② 查留痕 | 放行；写一条需求评论 `[豁免] <理由>`（§10 #7）；且 requirement 的 D-x 里有该豁免裁定行（§10 #10） | 2 |
| TC-8 | 原型产物识别（新路径 + 旧路径迁移提示） | `ArtifactSpec.kindForRelPath` / `NAME_TO_KIND` / `ALL_ARTIFACT_KINDS` / `stageForKind` / `artifact-labels.ts`（brief §1/§10 #1/#3/#33 · FR-2） | 无 | ① 断言 `kindForRelPath('…/prototypes/x.html')==='prototype'`；② 断言 `…/prototypes/INDEX.md` 亦为 `prototype`（不落 notes，§10 #1）；③ 断言旧 `…/prototype/x.html` 亦为 `prototype` 且门禁消息含迁移提示；④ 断言 `notes/x.md` 仍为 `notes`；⑤ 断言 `stageForKind('prototype')==='brainstorming'`（§10 #3）与中文名「原型」（§10 #33） | 五断言全绿；旧目录不被误判为 notes，也不被静默接受 | 3 |
| TC-9 | 幂等落盘 + 登记即刷新 RTM | 模板落盘（`templates/brainstorming/prototype.html`）× `rtm-yaml` 触发点 `submit:prototype`（brief §1/§5/§10 #21 · FR-2） | `prototypes/` 目录不存在；旧 `templates/design/prototype.html` 已 `git mv` 且旧路径不留（§10 #21） | ① 进入 brainstorming；② 再进一次；③ 手改骨架一行后 `reqboard_submit(kind=prototype)` | 骨架只写一次、不覆盖已写内容；`rtm-brainstorming.yml` 被刷新 | 3 |
| TC-10 | 原型作为确定交付物单列 | `QueryDocs` 交付物白名单 × `panels/docs.ts` × `DocPanelKind`（brief §9/§10 #30/#32/#34 · FR-2） | S-2 | ① 拉文档清单；② 核计数恒等式；③ 查权威标记投影 | 原型进 `'prototype'` 单列且行保留 `data-doc-row="1"`（§10 #30）；`prototypeRole`/`supersededBy` 缺省不注入（§10 #32）；`documents` 中台账行数 + Σ`discovered.count` == `artifacts.length`，`data-doc-row` 条数 == `documents.length`（§10 #34） | 3 |
| TC-11 | INDEX 权威恰好一条 | `prototype-gates.checkPrototypeVersionGate`（brief §2/§10 #2/#9 · FR-3） | S-4 三标本；INDEX 由 agent 手写、登记只校验不改写（§10 #9） | ① 各跑一次 `brainstorming → design`；② 查 INDEX 是否被改写 | 0 条与 2 条均拒 `prototype_version_conflict` / `REQBOARD_PROTOTYPE_VERSION_CONFLICT` 并点名；1 条放行；路径按需求目录相对书写并归一（§10 #2）；INDEX 内容零改写 | 4 |
| TC-12 | 引用 superseded 被拒 | 引用一致性门（brief §2 · FR-3 / D-6） | S-5 | ① `brainstorming → design`；② 读 gaps | 拒并同时列出被引路径与 INDEX 权威路径（正对 REQ-292a 事故形态） | 4 |
| TC-13 | 缺 FR 锚点区块 → 拒 | `checkPrototypeAnchorsGate`（brief §2 · FR-4） | S-6 第一标本（INDEX 服务条款含 FR-4，原型无 `id="FR-4"`） | ① `brainstorming → design` | 拒 `prototype_anchor_missing` / `REQBOARD_PROTOTYPE_ANCHOR_MISSING`，点名缺哪条 FR | 5 |
| TC-14 | 缺 geometry 块 / 多块 → 拒 | 同上（brief §1/§2/§10 #4 · FR-4） | S-6 第二标本（无 `<!-- proto-geometry {json} -->`）+ 第四标本（**两块** proto-geometry） | ① 各跑一次 `brainstorming → design` | 缺块拒并点名；**多块亦拒**并点名块数（§10 #4，必须恰好一块） | 5 |
| TC-15 | geometry 含阈值 → 拒（阈值不自证） | geometry 形状校验（brief §1 · FR-4 / D-10） | S-6 第三标本（含 `threshold`/`max`/`min`/`expect` 字段） | ① `brainstorming → design`；② 反查阈值来源 | 拒；断言阈值只允许出现在设计阶段产物，不出现在原型自证路径 | 5 |
| TC-16 | geometry 合法形状放行 + 元数据抽取 | `StageArtifact.prototypeMeta`（brief §1/§10 #5/#8/#41 · FR-4） | 合法 geometry 标本（`unit ∈ {px,count,ratio}`、`at.state ∈ {inflight,terminal}`、`observations[].name` 块内唯一） | ① 登记 prototype；② 读产物元数据；③ 放入越界值与重名两标本 | ① 放行且元数据字段名/形状与 §10 #41 一致；② 越界值或重名被拒；③ 观测值缺省 `source: "prototype"`，人工给的标 `source: "human"`（§10 #8） | 5 |
| TC-17 | UI 卡缺原型锚点 → 拆分覆盖门拒绝 | `coverage-checker` 的 `covers_prototypes` 维 × `TaskRecord.prototypeRefs`（brief §5/§10 #36 · FR-5） | 1 张 UI 卡 `prototypeRefs` 为空（「设计落点」无 `prototypes/x.html#FR-N`） | ① 落库前跑覆盖门 | 拒并点名该卡；补 `prototypeRefs` 后放行 | 6 |
| TC-18 | RTM 插原型节点 + 覆盖度多一维 | `brainstorming-generator` 的 `outputs.prototypes` × `decomposing-generator` × `metadata.rtm_version`（brief §5/§10 #18/#42 · FR-5） | 本需求自身标本 | ① 跑 RTM 生成；② 读 `rtm-brainstorming.yml` 与覆盖度 | `prototypes` 节非空且含权威标记与锚点；覆盖度含 `covers_prototypes`（UI 卡全接锚点时 100%）；`metadata.rtm_version == "2.0"`（与写入计数 `metadata.version` 不是同一个键） | 6 |
| TC-19 | 子卡提示词带原型路径与锚点 | `ExecuteTask.buildSubtaskPrompt`（brief §7/§10 #12 · FR-6） | S-2；一 UI 卡 + 一非 UI 卡 | ① 各生成一次提示词；② 字符串断言小节标题与内容 | UI 卡产出含小节 `【本卡原型（UI 卡）】` 与原型路径、`#FR-N`；非 UI 卡**不追加**该节（不误伤） | 7 |
| TC-20 | UI 卡 acceptance 必含原型对照判据 | acceptance 模板 × 拆分门（brief §4/§8 · FR-6） | UI 卡 acceptance 仅单测断言 | ① 跑门禁；② 补一条结构/几何硬判据后重跑 | 缺原型对照判据即拒；补齐后放行 | 7 |
| TC-21 | 探针几何量逆验证：改坏即红 | `scripts/req-*-probe.mts` 硬判据（brief §6/§10 #25 · FR-6） | 探针基线全绿；显式传 `--window-size` 并回读 PNG 真实像素 | ① 人为改坏一处几何量（如 Tab 栏实测 > 声明上限）；② 重跑探针；③ 在无 Chrome 环境重跑 | ① 退出码非 0 并打印具体判据（复刻 REQ-292a「1118px > 713px」这类漏网项）；② 无 Chrome 环境 **exit 2**（响亮失败，不许静默跳过） | 8 |
| TC-22 | 无「只打印不判失败」的诊断行 | 探针族源码（FR-6） | 无 | ① 扫探针源码中只 `console.log` 几何量、无断言分支的行 | 命中数 = 0（源码级断言） | 8 |
| TC-23 | 验收单自动加「与原型对照截图」项 | `AcceptanceSheetSpec` item source `prototype-compare`（`VerificationItemSource`，brief §9/§10 #31/#37 · FR-7） | UI 标本 + 非 UI 标本 | ① 各生成验收单；② 查三处 taskId 分支 | UI 需求必出现该项（载荷 `{ kind, prototypePath }`）且非 UI 需求不出现；`AcceptSheet.ts` / `accept-sheet-rtm-integration.ts` / `status-rtm-integration.ts` 三处**都不退化为 `undefined` / `fr_id='UNKNOWN'`**（§10 #31） | 由 `interfaces.md` 的 `prototype-compare` 项接口 + 其判据覆盖（§10 #27） |
| TC-24 | verification 缺对照项 → 拒 | 验收材料提交门（brief §10 #38 · FR-7） | 提交材料缺 `prototype-compare` 证据 | ① 提交；② 补截图与差异说明后重交 | 缺项即拒：内部 `verification_prototype_compare_missing` / 传输 `REQBOARD_VERIFICATION_INCOMPLETE`；补齐放行 | 由 `interfaces.md` 的 `prototype-compare` 项接口 + 其判据覆盖（§10 #27） |

**B 组：裁定保真（FR-8 / FR-9 · 验收标准 11~14）**

（模块：`src/application/internal/decision-gates.ts`（§10 #16）；会话留痕接入 `hasDecisionTrace`，只取 `source.kind === 'user'` 且只扫最近 200 条（§10 #20）。）

| 编号 | 名称 | 被测对象（设计/FR） | 前置 | 步骤 | 期望 | 覆盖验收标准 |
|---|---|---|---|---|---|---|
| TC-25 | 有裁定留痕而缺节 → 拒 | `decision-gates.ts` 裁定落账门 `decision_log_missing`（brief §3/§10 #16 · FR-8） | S-7 第一标本（会话含人的祈使句/指正留痕，文档无「讨论与裁定记录」节） | ① `brainstorming → design` | 拒并点名缺节；内部 `decision_log_missing` / 传输 `REQBOARD_DECISION_LOG_MISSING`；给出节名与五要素格式 | 11 |
| TC-26 | 条目无效逐条点名 | `decision-gates.ts` `decision_entry_invalid`（brief §3/§10 #16 · FR-8） | S-7 第二标本（只有概括句 / 缺原话来源 / 缺影响 FR 三种条目） | ① `brainstorming → design` | 拒；传输 `REQBOARD_DECISION_ENTRY_INVALID`；`gaps` 逐条列无效条目编号（不修一个报一个） | 11 |
| TC-27 | 疑问句不算裁定 + 真空态放行 | 裁定边界判定 + 真空态（brief §3 · FR-8 / D-11） | S-7 第三标本（会话只有疑问句与事实确认） | ① 文档显式写「本节无裁定」；② `brainstorming → design` | 放行；「本节无裁定」**不视为空节**，不要求硬凑条目 | 12 |
| TC-28 | 祈使句被漏记 → 拒 | `decision-gates.ts` 留痕启发式（`改成/不要/必须/加上/应该是/记得/注意/别/要`）（brief §3/§10 #23 · FR-8） | 会话含祈使句留痕，文档写「本节无裁定」 | ① `brainstorming → design` | 拒；启发式**只用于「要求非空」**，不判条目内容好坏；**召回率不假装可测**——词表外裁定漏记由 G2 人评审承担（§10 #23） | 12 |
| TC-29 | D-x 连续唯一 + 五列齐 | `decision-gates.ts` 的 `checkClauseSequence` 思路（独立命名空间）+ 五列校验（brief §3/§10 #16 · FR-8） | 三标本：跳号 D-1/D-3 · 重复 D-2/D-2 · 五列缺一 | ① 各跑一次格式门 | 三种均拒并点名；`影响 FR` 必须命中真实 FR | 12 |
| TC-30 | 未被引用的 D-x 被点名 + 验收单 `decision-compare` 项 | `coverage-checker` 的 `covers_decisions` 维 × `TaskRecord.decisionRefs` × `VerificationItemSource`（brief §5/§10 #14/#36/#37 · FR-9） | D-7 未被任何 FR 明细或卡的 `decisionRefs` 引用 | ① 跑覆盖度；② 生成 UI 需求验收单；③ 提交缺该项的材料 | ① 点名 D-7，该维 < 100%；② 单含 `{ kind:'decision-compare'; decisionIds }` 项；③ 缺项提交被拒（§10 #14/#37） | 13 |
| TC-31 | 子卡提示词带本卡 D-x 原话 | `buildSubtaskPrompt`（brief §7/§10 #12 · FR-9） | 一张带 D-x 关联的卡 | ① 生成提示词；② 字符串断言小节标题与内容 | 产出含小节 `【本卡裁定（D-x 原话）】` 与该裁定**原话**（不只 FR 标题）；无关联 D-x 的卡不追加该节 | 13 |
| TC-32 | 返工顺序：先补 D-x 再改代码 | 返工工单文案与顺序（FR-9） | 人指出「文档里没写」的返工标本 | ① 生成返工工单；② 尝试"直接改代码结单" | 工单要求先补 D-x 条目再改代码；直接结单被拒 | 14 |

**C 组：同源与校验（FR-10 / FR-11 · 验收标准 15~22）**

（脚本口径：**4 个新脚本文件**——`template-gate-probe` / `doc-section-parity` / `prompt-path-probe` / `req-doc-validate`——加 `package.json` 接线；**没有第五个脚本**（§10 #17）。）

| 编号 | 名称 | 被测对象（设计/FR） | 前置 | 步骤 | 期望 | 覆盖验收标准 |
|---|---|---|---|---|---|---|
| TC-33 | R1 模板产物必过门禁（含逆验证） | `scripts/template-gate-probe.mts` × `scripts/template-render-map.json`（brief §6/§10 #26 · FR-10） | 各模板就位；映射表含 `{{TASK_ID}}`→`t-000000`、`{{DESIGN_SERVES}}`→`FR-1` 等 | ① 用映射表渲染 `templates/**/*.md` 占位符 → 跑 `missingCategoryDocs` + `checkRequirementDocFormatGate` + `checkDesignSectionsHaveServes`；② 人为改坏某模板必填节标题后重跑；③ 塞一个**未在映射表内**的占位符后重跑 | ① 0 缺口；② **必红**（D-5 教训固化为可失败断言）；③ **exit 1 并点名该占位符**（防新占位符没人管，§10 #26） | 15 |
| TC-34 | R2 节名集合双向一致（含逆验证） | `scripts/doc-section-parity.mts`（brief §6 · FR-10 / D-12） | 门禁 BASE+DELTA 集合与模板 H2 集合 | ① 双向比对；② 造「模板多一节」「门禁少一节」两标本重跑 | ① 双向相等且体现「讨论与裁定记录」**仅 feature 模板**；② 两标本均失败 | 16 |
| TC-35 | R3 提示词路径可达（含逆验证） | `scripts/prompt-path-probe.mts`（brief §6 · FR-10） | 片段源 + `round-state.ts` 文本 | ① 扫路径 token；② 插一个指向不存在文件的指针后重跑 | ① 全部可达或属已知产物名；② 失败并点名该指针 | 17 |
| TC-36 | R4 脚本接线（含逆验证） | `package.json` 的 `prompts:check` + `check-prompt-fragments.mjs`（brief §6/§10 #17/#26 · FR-10 / D-8） | 无 | ① 断言 `prompts:check` = inline + check 两条且进提交前清单；② 改片段不重生成后跑 check | ① 接线成立且脚本口径 = 4 个新脚本 + `package.json`（无第五个，§10 #17）；② 该命令 exit 非 0（堵「静默注入旧纪律」） | 18 |
| TC-37 | D-x 进编号白名单 + dangling | `content-gates.collectIds` / `ID_PATTERN`（brief §3/§4 · FR-11 / D-9） | 无 | ① 断言 `collectIds('D-1') === ['D-1']`；② 断言 `D-ARCH-2` 仍命中；③ 引用未定义的 D-99 | ① 命中；② 不冲突；③ 判 dangling 并点名 | 19 |
| TC-38 | 贴锚点不刷覆盖度 | `stripPrototypeAnchors`（固定占位符 `<proto-anchor>`）+ `protoRefs` 单列（brief §4/§10 #6 · FR-11） | S-8 | ① 只贴锚点 → 跑覆盖度；② 再补真实实现 | ① 覆盖度**不上升**，锚点只进独立 `protoRefs` 列，strip 产物为固定 token `<proto-anchor>`（§10 #6）；② 补实现后才上升 | 20 |
| TC-39 | strip 后 `collectIds` 不再产出该 FR | `stripPrototypeAnchors`（纯函数）（brief §4/§10 #6 · FR-11） | 无 | ① `collectIds('prototypes/x.html#FR-4')` 原样；② strip 后重跑 | ① 当前产出 `['FR-4']`（缺陷基线）；② strip 后**不含** FR-4，且输出含占位符 `<proto-anchor>` | 20 |
| TC-40 | 阶段门时序：逾期即红、未到期放行 | `StageGateTimeline` 常量 + 各阶段门（brief §6/§10 #39 · FR-11） | S-10 三标本 + 一个 brainstorming 期标本 | ① 各阶段跑门；② 对未到期标本跑同一门 | ① 三门各自逾期即拒并点名，内部 `stage_gate_overdue` / 传输 `REQBOARD_STAGE_GATE_OVERDUE`；② 编号链全 orphan 在 brainstorming 期**不判失败**（防假红） | 21 |
| TC-41 | 自检脚本并入 R1（含自身逆验证） | `scripts/req-doc-validate.mts`（brief §6 · FR-11） | 无 | ① 断言脚本跑 9 项且被 R1 调用；② 人为改坏必填节后重跑 | ① 9 项全绿、接线成立；② exit 非 0 | 22 |

**D 组：兼容、非功能与工程门（验收标准 9~10 + FR-10 的输入包通路）**

| 编号 | 名称 | 被测对象（设计/FR） | 前置 | 步骤 | 期望 | 覆盖验收标准 |
|---|---|---|---|---|---|---|
| TC-42 | 存量 RTM 旧文件读取不报错、不被判不健康 | `rtm/validator.ts` 宽容度 + `rtm-health.ts` 适用性判据（brief §5/§10 #19 · FR-5 / FR-11） | S-9（66 条 + 缺节 + 未知 key） | ① 全量读取；② 跑健康检查 | 缺 `prototypes`/`decisions` 节 = `pending`，不判损坏；未知 key 忽略不报错；只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince` 的需求缺节才判不健康；存量一律 `exempted: legacy` 并如实报告（§10 #19） | 9 |
| TC-43 | 已归档需求不被追溯拒绝 | 门禁 `isLegacy` 豁免口径（FR-1 / FR-2） | S-9 的 8 条 archived | ① 跑新门禁；② 查是否回填 | 不被拒；不回填原型与 `frontend.md` | 9 |
| TC-44 | 门禁只读锚点区块、单次 < 100ms | 门禁性能（brief §2 · FR-1 / FR-4） | S-2 大体积原型 | ① 计时跑门禁；② 断言未整体加载渲染 | 单次判定 < 100ms；只做目录级存在性 + 小文件解析 | 10 |
| TC-45 | 不新增运行时依赖 + layer-boundary 全绿 | `package.json` × layer-boundary 用例（FR-10） | 无 | ① 比对依赖清单；② 跑 layer-boundary 用例 | 无新增运行时依赖；`application/` 无 `import node:` | 10 |
| TC-46 | 工程门全绿 | `pnpm typecheck` / `pnpm test` / `pnpm kb:build && pnpm kb:check` / `STATUS_BY_CODE`（全 FR） | 本轮改动就位 | ① 依次跑三条命令；② 核新错误码登记 | 三条全绿；新增用例全过、既有用例无回归；每个新错误码逐条登记 `src/http/envelope.ts` 的 `STATUS_BY_CODE` = **400**（漏登会落 500，#43）；`artifact-labels.ts` 中文名护栏用例绿（#33） | 10 |
| TC-47 | 会话裁定抽取不新增数据源 | `hasDecisionTrace(sessionProbe, req, opts)`（brief §3/§10 #20 · FR-8） | 有真实会话留痕的需求 | ① 走快照事件优先路径（单测）；② 走持久化冷读回落路径（标 `@integration`，真机会话标本） | 只取 `source.kind === 'user'`；只扫最近 200 条（默认）；**不新增数据源**，只新增判据；冷读不混进单测（§10 #24） | 12 |
| TC-48 | 节点输入包 / 交棒底稿带原型与 D-x | `node-input-package.ts` × `IsolateNodeContext` / handoff 底稿（brief §7/§10 #15 · FR-10） | 一个已登记原型、有 D-x 的需求；走一次交棒或节点隔离 | ① 重建节点输入包；② 断言「证据指针」节字段与行数 | `NodeInput.prototypeRefs` / `NodeInput.decisions` 存在，渲染在「证据指针」节两行（§10 #15）；新窗口只读输入包即可见原型路径与 D-x——缺任一即断链 | 17 |

## 测试覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

**FR → 用例矩阵**

| 需求条款 | 覆盖用例 | 覆盖的验收标准 | 覆盖状态 |
|---|---|---|---|
| FR-1 | TC-1, TC-2, TC-3, TC-4, TC-5, TC-6, TC-7, TC-43, TC-44 | 1, 2, 9, 10 | ✅ 已覆盖 |
| FR-2 | TC-8, TC-9, TC-10, TC-43 | 3, 9 | ✅ 已覆盖 |
| FR-3 | TC-11, TC-12 | 4 | ✅ 已覆盖 |
| FR-4 | TC-13, TC-14, TC-15, TC-16, TC-44 | 5, 10 | ✅ 已覆盖 |
| FR-5 | TC-17, TC-18, TC-42 | 6, 9 | ✅ 已覆盖 |
| FR-6 | TC-19, TC-20, TC-21, TC-22 | 7, 8 | ✅ 已覆盖 |
| FR-7 | TC-23, TC-24 | 由 `interfaces.md` 的 `prototype-compare` 项接口 + 其判据覆盖（§10 #27） | ✅ 已覆盖（需求级验收标准缺口由设计侧补足） |
| FR-8 | TC-25, TC-26, TC-27, TC-28, TC-29, TC-47 | 11, 12 | ✅ 已覆盖 |
| FR-9 | TC-30, TC-31, TC-32 | 13, 14 | ✅ 已覆盖 |
| FR-10 | TC-33, TC-34, TC-35, TC-36, TC-45, TC-46, TC-48 | 15, 16, 17, 18, 10 | ✅ 已覆盖 |
| FR-11 | TC-37, TC-38, TC-39, TC-40, TC-41, TC-42 | 19, 20, 21, 22, 9 | ✅ 已覆盖 |

**验收标准 → 用例反查（1~22 逐条）**

| 验收标准 | 用例 | 验收标准 | 用例 |
|---|---|---|---|
| 1 | TC-1, TC-2, TC-3, TC-4 | 12 | TC-27, TC-28, TC-29, TC-47 |
| 2 | TC-5, TC-6, TC-7 | 13 | TC-30, TC-31 |
| 3 | TC-8, TC-9, TC-10 | 14 | TC-32 |
| 4 | TC-11, TC-12 | 15 | TC-33 |
| 5 | TC-13, TC-14, TC-15, TC-16 | 16 | TC-34 |
| 6 | TC-17, TC-18 | 17 | TC-35, TC-48 |
| 7 | TC-19, TC-20 | 18 | TC-36 |
| 8 | TC-21, TC-22 | 19 | TC-37 |
| 9 | TC-42, TC-43 | 20 | TC-38, TC-39 |
| 10 | TC-44, TC-45, TC-46 | 21 | TC-40 |
| 11 | TC-25, TC-26 | 22 | TC-41 |

**缺口与口径说明**

- 验收标准 1~22 **逐条至少一个用例**已满足；FR-1~FR-11 全部有用例。
- **FR-7 没有对应编号的需求级验收标准**（1~22 中无一项描述验收单对照项）→ 按 brief §10 #27 **由设计侧补足**：`interfaces.md` 定义 `prototype-compare` 项接口并声明判据「UI 需求验收单缺该项即提交被拒」；需求侧是否补一条**留给用户决定**。本表 TC-23/TC-24 的覆盖列即按此口径填写。
- **用例总数 48**；其中带逆验证（人为改坏 → 必红）的 **6** 条：TC-21、TC-33、TC-34、TC-35、TC-36、TC-41。
- 前一轮报的 4 个难测点已由 brief §10 拍板：#23 裁定边界只锁启发式命中（召回由 G2 人评审承担）· #24 冷读路径标 `@integration` · #25 探针显式 `--window-size` + 回读 PNG 真实像素、无 Chrome exit 2 · #26 R1 用 `scripts/template-render-map.json`、未命中 exit 1。

## 关键决策与取舍 `serves: FR-1, FR-5, FR-7, FR-10, FR-11`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| `covers` 字段怎么填 | 编造卡编号占位 | **设计阶段不填**，落库后由既有 backfill 机制回填（§10 #28） | 卡还不存在，编造编号即假引用（正是 FR-11 要禁的） |
| 四条转移路径怎么测 | 一条路径一个用例 | **一条用例对四条路径各断言一次** | 要锁的不变量是「缺任一即红」，写在一起才让"漏一条"直接表现为该用例红 |
| 逆验证放哪 | 每条回归另建一条用例 | 与正向断言**同一条用例**第二步 | 正向+逆验证成对出现，"只绿不红"的假回归一眼可见；也避免用例数翻倍 |
| 用例粒度 | 一个断言一条 TC | 一个**机制**一条 TC，多断言写在期望里 | 门禁类机制天然多断言（如 INDEX 三态）；拆碎会让覆盖矩阵看不出机制边界 |
| 存量兼容怎么造标本 | 只造 1 条旧 YAML 标本 | 用 S-9 的 **66 条真实存量 + 8 条 archived** | 兼容是硬约束（验收 9），构造标本覆盖不到真实字段漂移 |
| 假引用怎么断言 | 断言覆盖度绝对值 | 断言覆盖度**不上升**（相对量） | 绝对值会随无关改动漂移；"贴锚点前后不上升"才是禁假引用的判据本身 |
| FR-7 无需求级验收标准怎么办 | 自行编号补一条 | 交由设计侧 `interfaces.md` 的 `prototype-compare` 项接口与判据补足（§10 #27），需求侧留给用户 | 测试用例不能替需求发明条款编号；判据落接口层才能被机械核验 |
| FR-10 的第 3 条注入通路没被测怎么办 | 只测片段与子卡提示词 | 补 TC-48（节点输入包 / 交棒底稿，§10 #15） | 四条通路「缺一断链」；输入包是遗弃上下文后新窗口的唯一可见面，不测等于没守住 |

## 技术方案与亮点 `serves: FR-1, FR-6, FR-10, FR-11`

- **三层测试 + 标本驱动**：纯函数层（`collectIds` / `stripPrototypeAnchors` / `checkClauseSequence`）不碰 IO；门禁集成层用 S-1~S-10 统一标本跑真实门禁；探针层用 headless Chrome 测真实渲染。标本表是**单一事实源**，避免各用例各造一套数据。
- **逆验证成对**：六条机械回归（TC-21、TC-33~TC-36、TC-41）都带「人为改坏 → 必红」，把 brief §6 的「机械守住」变成可失败断言，而不是评审纪律。
- **门禁四路径断言表**：TC-2 用四个入口跑同一标本，直接对标「09-29 快照同步丢过一条」的历史缺陷——结构性防御，不依赖人记得改。
- **四条注入通路各自有断言**：片段（TC-35 / TC-36）· 回合指令（TC-35）· 节点输入包与交棒底稿（TC-48）· 子卡提示词（TC-19 / TC-31），避免「改了三处漏一处」。
- **覆盖度用相对断言**：TC-38 断言「贴锚点前后不上升」，比断言某个百分比更能防假引用（百分比可能被别的维度抬高而掩盖锚点混算）。
- **探针复刻真实漏网项**：TC-21 用 REQ-292a 的「1118px > 713px」形态做逆验证标本，确保几何量判据不退回"只打印不判失败"。
- **兼容用真实存量跑**：TC-42/TC-43 直接吃 66 条存量 + 8 条 archived，避免"构造标本全绿、真机崩"。
- **可核验指向**：每条用例的被测对象都指向 brief 的模块/函数与 FR-x，实现落点与判据一一对应（见上四张表）。
