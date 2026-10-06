# 执行中裁决与偏差清单（实施期事实源）

> 用途：实施窗口在执行 23 张卡的过程中，对「卡面与真源/设计不符」「平台缺口」「有意接受的偏差」逐条裁定并留痕。
> 本文是**验收材料与归档索引的骨架**：每条都写明「发生了什么 / 怎么裁 / 证据在哪 / 谁受影响」。
> 维护纪律：只追加不删改（后写的裁决覆盖前条时，两条都留）。

## 0. 执行环境事实

| 事实 | 后果 | 处置 |
|---|---|---|
| 子卡执行引擎按当前 profile **不可达**（`subtask_engine_unreachable`，需求 history 有原始记录） | 自动子卡链跑不动，23 张父卡一张都不会自己开工 | 走平台给出的出路①：**本窗口自证**（`reqboard_task_report` 写 filesChanged/completed 过凭证门） |
| 每张父卡开工即**自动展开 4 张子卡**（研发/联调/复核/测试），agent **无权取消子卡**（`todo>canceled` 也在人工门），也**没有事后改 solo 卡**的入口（`stages: []` 只能在计划落库时声明） | 账务成本 ≈ `23 × (1 + 4×3 + 1) ≈ 320` 次工具调用 | 按批推进、父卡收尾等 60 秒节流；**记录为缺口**：计划应能用 `stages: []` 声明「本卡由本窗口自证、不展开子卡链」，或在引擎不可达时提供「父卡自证即视同子卡链满足」的入口 |
| 非子卡收尾有 **60 秒节流**（事故 C 防线） | 23 张父卡依次收尾 ≈ 23 分钟纯等待 | 设计内节流，不是故障；按卡穿插其他工作 |

## 1. 基线缺陷（不属任何卡，由本窗口修）

| 项 | 事实 | 处置与证据 |
|---|---|---|
| 类型基线红 | `HEAD=5dff7e2`（另一窗口为 REQ-261004222448-292a 归档提交）自带 `tests/receive-mark.test.ts:129` 的 `TS2339: Property 'sort' does not exist on type 'readonly string[]'`；该文件与 HEAD 逐字一致 | 1 行修复（`[...(x ?? [])].sort()`）→ `tsc` 从 1 错归零；该用例 12/12 仍绿。**不属任何卡，单独记账** |
| 尺寸门禁基线红 | 全仓 30+ 个 src 文件 > 400 行，HEAD 即红；本需求触及的 `ExecuteTask.ts` 基线 521 行 | 本需求实施使其增至 646 行（+125），**决定不拆**，作为已知欠债记录 |
| 层边界基线红 | `application/` 下既有 `node:` 导入等越界，HEAD 即红 | 与本需求各卡无交集，未处理 |

## 2. 计划层的洞（拆卡时假定有人做、实际没有卡负责）

| 洞 | 影响 | 处置 |
|---|---|---|
| `TaskRecord.prototypeRefs` / `decisionRefs` **全仓无写侧**（`PlanTask` 无键、submit 工具 schema 未声明、`normalizePlanTasks` 白名单丢弃、`PlanTaskDraft`/`plan-landing` 不写） | RTM 的 `covers_prototypes` 恒空；t12 的 UI 卡锚点门只能靠 `decomposition.md` 兜底；t16 的子卡提示词取不到台账值 | 指派给 **t12** 补写侧（`PlanTask` + `normalizePlanTasks` + 工具 schema + `PlanTaskDraft` + 落库写入），并在验收材料标注这是拆卡遗漏 |
| 设计给的裁定门签名 `(docs, req)` **容不下它自己要求的留痕判据** | 无签名可把会话探针带进门 | t5 用**可选第三参** `opts?: { trace?; sessionProbe?; limit?; windowKeys? }` 补齐（两参调用仍成立）；t6 接线时由 `contentGatesForMove` 自己算 `trace` 再传入 |
| 设计 S-13 只列 `buildSubtaskPrompt` 4 参，但 application 层禁 `node:` 而该函数是同步纯函数 | 读取需求文档与权威索引需要 IO | t16 扩为「4 参 + 可选 docs」，IO 由用例侧读好传入（另动同文件 2 处调用点 + 1 个导入），**接受为偏差** |
| `data-model` §3.3 说「递归扫 JSON **键**」，§3.4 反例 `tabsTopMax` 却是 `name` 的**值** | 按键名规则抓不到该反例 | t4 **只扫键**（扫值会误伤 `passRate` 等合法观测量名）；记录为设计文档自相矛盾 |
| `data-model` §2.3 的 INDEX 不变量 I2/I3（被取代于须指向表内存在行；服务条款须命中真实条款）归在版本门，但**不在 t4 卡面契约与验收清单** | 两条不变量未实现 | t4 按「不扩范围」未做；**显式记录为已知缺口**（不静默） |

## 3. 卡面与真源不符（执行时按真源纠正）

| 卡 | 卡面写的落点 | 真源 | 处置 |
|---|---|---|---|
| t1 | `stageForKind` 在 `src/domain/artifact/ArtifactSpec.ts` | `src/application/internal/artifact-discovery.ts:33` | 按真源加显式 case（实质代码 3 行）；两条穷尽 `Record` 同理落在 `QueryDocs.ts`（PANEL_KIND）与 `client/views/panels/docs.ts`（KIND_ALIAS） |
| t2 | 实施方案只列 5 条传输码 | `interfaces.md` 错误码总表 + brief #38/#39 钉了 7 条；`interfaces.md` 技术方案 #4 要求内部码与传输码**成对**登记 400 | 按 7 + 7 = 14 条登记（纯加性）；未知内部码原样透传 |
| t2 | 「每个新门的 how 文案命中锚点」 | 门实现当时尚未落库（t4/t5） | 用例暂改为机械核验设计文档 7 条 how 模板；**门落库与 t6 接线后由真实触发用例接棒** |
| t3/t4/t16/t17 | 卡面点名的若干测试文件在仓库中**原本不存在** | — | 按新建处理（内容是本次改动专测，非重复既有文件） |
| t14 | 设计模板两处 H2 需 serves（R1 前提） | 全仓 8 份 design 模板的 `关键决策与取舍`/`技术方案与亮点` 都没写 serves，而真实设计文档都写 | 按 A 执行：8 份模板补 serves + `tests/report-template.test.ts` 的数组精确相等断言改为「剥装饰再比」（断言语义不变） |

## 4. 有意接受的偏差（都留了证据）

| 偏差 | 理由 | 证据 |
|---|---|---|
| `transportCodeOf` 由模块私有改为**导出**（t2） | 门落库前没有真实触发点，验收项又要求直接断言该函数 | 导出无行为变化；变异验证 4 条断言承重 |
| 验收证据条目判定**不判端侧字段**（t8）：判据 = feature/refactor + 存在已登记原型产物 | `LedgerRequirementLike` 不含 `sides` | 无原型即无对照项，只有「非 UI 需求却登记了原型」这一假想情形会多出项 |
| 裁定「被引用」口径取宽（t8）：FR 明细/设计章节编号 **并集** 卡的 `requirementRefs`/`decisionRefs` | 只卡任务卡一侧会把「设计已承接、卡未落库」的中间态误判成未引用 | 已写死在 `coverage-calculator.ts` 模块头注释 |
| 两处「缺节」读法并存：健康检查的适用性判据 vs 校验器的容忍度 | 两个口径的语义不同（适用性 vs 形状容忍） | t8/t9 各自注释说明；本表登记避免后人误当重复实现 |
| 面板新增 `DocPanelEntry.prototypeMeta?`（只投影锚点，**不带几何量值/阈值**）（t17） | 设计 `frontend.md` 呈现项要求「显示原型有没有判据」 | 渲染产物断言 `not.toMatch(/threshold|阈值|上限|下限|tolerance|expected|budget/i)` 承重 |
| 交付物白名单补 `prototype/*.html`（旧路径）（t17） | brief §1 明确旧路径仍识别为原型；否则「按新 kind 登记的老目录原型」在页面上等于没交（两份真相） | 补了旧路径进 documents 与兜底归组的断言 |

## 5. Dogfood：本需求自己的文档被自己新增的门拒

- 事实：t5 落成裁定记录门后，拿本需求的 `requirement.md` 实跑 → `decision_entry_invalid`，**点名 D-14 / D-15**（两条裁定的「影响 FR」写的是「全 FR」，不是编号）。
- 处置：**改文档，不放宽门**（`requirement.md` 的 D-14/D-15 改为逐个编号枚举 FR-1…FR-11）→ 再跑 **PASS**。
- 证据：`.tmp-probe/self-gate.mts` 一次性探针（实跑输出 `裁定门对本需求文档 = PASS（放行）`）。
- 意义：这是本需求主题（讨论裁定必须可机械核验）在自身文档上的第一次生效。

## 4b. t6（接线卡）相关裁决与实测

| 事项 | 事实 | 裁决 |
|---|---|---|
| 卡面只列 4 条路径 / 4 个文件 | 实测真实落点是 **5 个调用点**：`internal/confirm-settle.ts` 才是「弹框首次确认 → 自动推进」的**唯一实现**（`AskConfirm.ts` 那处只是早退块）；看板路径④的真实落点在 `http/routers/requirements.ts:handleArtifactConfirm` | **按实测接线**（只照卡面清单改 = 「首次确认」绕开新门，正是 REQ-292a 的后门形态）；5 个调用点**各做一次变异验证** |
| 裁定门适用面 | 三份设计文档口径打架：`interfaces.md` 暗示 feature 全判；`architecture.md` #46 说只有 UI 生效；`backend.md` 说那条只约束**三个原型门** | **按需求文档 FR-8 裁定**：三个**原型门**限 UI（feature/refactor 且 sides 含 frontend）；**裁定门对所有 feature 需求生效**（纯后端 feature 一样有讨论裁定，否则 FR-8 对其完全失效）。随之修被合法打破的既有夹具（只补夹具、不改断言语义） |
| 同步门的条件必交并集 | 同步契约不取 docs，拿不到 sides → 退化为基线并集 | **接受，且这是必须而非折中**：若同步门把 prototype 当 `missing_artifact` 拦，`prototype_exempt`（人已确认的豁免）永远走不到豁免判定 → 豁免形同虚设 |
| `docs` 端口未装配时 | 先做 fail-closed 会打断既有看板用例 | **放行（fail-open）并留痕**：缺端口连「是不是 UI 需求」都判不了，硬拦会连纯后端/文档需求一起拦；生产组合根恒传 docs（`src/index.ts:907`）。列为偏差，不掩盖 |
| 尺寸门禁 | `content-gate-wiring.ts` 826→923、`confirm-settle.ts` 408→438、`http/routers/requirements.ts` 760→812 | 三者 **HEAD 已超 400 行门限**；卡面把入口钉在 `content-gate-wiring.ts`，**不拆**，记账 |
| 零回归的证明方式 | 全库跑两次（A=带改动 / B=五个调用点全停用），`comm -23 A B` = 空 | 机械证明「改动后失败集合 ⊆ 停用门禁后失败集合」→ 零新增失败（比"我看了没红"强） |

## 4c. t15 / t18 相关裁决

| 事项 | 事实 | 裁决 |
|---|---|---|
| 轻档 2500 字符硬上限 vs 新增两条铁律 | `iron-rules` 是 floor（轻档也注入），实施轻档原本只剩 28 字符余量；两条新铁律约 330 字符，物理放不下 | **压旧条款、不放宽上限、不挪进 heavy-only**：删连接词、格式括注与一个溯源标签，**七条可执行 token 一条未丢**。理由：新纪律必须进**默认的轻档**；挪进 heavy-only = 默认路径拿不到，规则白加。代价如实记账（见 5b） |
| 卡面清单外的第 4 个消费点 | `src/client/stage-panel.ts` 的内联 source 类型只有两值，不改会渲染 `undefined` 标题；不改则 `tsc` 非 0 | **批准最小穷尽化改动**（与 t6 多找到的两个真实落点同类：卡面清单漏写，按真源补齐） |
| 裁定对照项没有独立拒绝码 | 设计说「有 D-x 却缺 decision-compare 项 → 拒」，但协议只给了原型缺项那条码 | **不另立拒码**：有 D-x 条目就必然组装该项，**结构上缺不了** → 设计里那条判据不可达；不为此扩协议面 |
| 提示词片段未写 `templates/…` 指针 | `templates/brainstorming/prototype.html` 当时尚未迁移（t11 未落地），写了就是悬空指针 | 片段里只写 `prototypes/<name>.html` 与 `prototypes/INDEX.md`（与回合指令侧 token 一致）；**t11 的迁移必须落地**，否则设计模板里那条指针悬空 |
| `brainstorming/heavy-extra.md` 仍写旧目录 `prototype/` | heavy-only 档，非 t15 文件 | 交 t20：**显式登记为兼容期白名单**（比悄悄改文案更可审计） |
| t11/t12 的门禁：被合法打破的既有夹具 | 裁定门放宽到「所有 feature」后，7 处夹具（feature + 已登记需求产物 + 盘上无需求文档）被正确拦下 | **批准改夹具**（只补一份含裁定真空态的需求文档，**零断言语义改动**，合计 +40/−1）；护栏设为"第二波再停一次"，实测未触发第二波 |

## 4d. t10/t11/t12/t13 相关裁决与新发现（本轮最重的几条）

| 事项 | 事实 | 裁决 |
|---|---|---|
| **门自己绿了**（t11 探针实测） | 产物自动发现会把落盘骨架补登成 `kind=prototype`，而存在门只按 `kind` 过滤 → 实测「只落骨架、人一个字没填 → 存在门/版本门/锚点门**全 PASS**」。触发条件极低：看板 stages 路由**每请求**都跑 `syncAllReqArtifacts` | **收紧为「只有显式登记才算交」**（`autoDiscovered !== true`，与门自己的 how 文案「登记才算数，落盘未登记不算」完全一致）；版本门/锚点门是形状校验，**保持宽容** |
| **登记永远升不了级**（t11 探针实测，配套死结） | `registerArtifact` 对「同 stage+kind+path 已存在」一律 `return false` → 自动发现条目**永远升不成显式登记** → 门一严，agent 照 how 文案登记也**永远判未登记**（实测修前 `registered_count: 0`） | **改为就地升级**（同 path 且是自动发现条目 → 清标记 + 用本次字段覆盖）；判据单点化（存在门 / 登记回执 / 升级 / 编排**四处共用**一个模块） |
| 我给错的一条落点（t11 用证据纠正） | 我说「弹框确认推进的落盘在 `confirm-settle`」，实测 `GATE_CATALOG` **没有任何门的起点是 `draft`** → 那条分支永不触发 | **采信证据**：整段撤回（零残留），改接**真实入口**（`CaptureRequirement` 的立项推进 + 看板 `/req/move`） |
| t13「未到期不判」口径 | t6 用例断言 `design→decomposing` 返回 `undefined`，与 t13 卡面「该转移也判门」冲突 | **批准该口径**：阶段产物不在位 = 未到期不判。「**没交**」归既有门（G2 `design_doc_incomplete`），「**交了却没转绿**」归时序门——一处坏不出两种码，且不必改他人断言 |
| t13 三级追溯只判第一级 | 第二级需任务集（转移门禁签名拿不到，§10 #46 不许改调用点）；第三级在既有实现里本身是 TODO | **接受并如实披露**（未硬判，防假红）；写进本表以免被读成"全覆盖" |
| t10 尺寸欠债 | `SubmitArtifact.ts` 396→713 行（卡面把落点钉在该文件；该门禁 HEAD 即红） | **记账不拆**（与 `ExecuteTask.ts`、`AcceptanceSheetSpec.ts` 同口径） |
| t10 两条失败通道 | 「豁免写歪」（理由空 / 未落章）→ 抛错；「压根还没画原型」→ 结构化失败体（`success=false` + `blockers`） | **接受**：两种语义不同——**写歪了** vs **还没画** |
| R4 卡面验收自相矛盾（t20 报告，父窗口实测确认） | 卡面既要求检查命令含「重生成 + 校验」，又要求「改了源不重生成必须失败」——前者会先重生成，后者**不可能成立**；真正要堵的「提交了过期内联产物」会滑过去 | 保留卡面要求的命令，**加性**补一条只校验不重生成的守卫（实测：改源不重生成 → exit 1 并打出首个差异偏移与两侧字节数） |
| t11 未接入口（按护栏停手报批） | `rollup.ts` 的接手推进 / 启动对账那条路径需引入文档端口且跨组合根（>2 行） | **记账为已知缺口**；该路径推进出的需求不会静默卡死（门会给可执行 how） |

## 4e. **本需求被自己拦住**：E2E 读数口径修正（t21 发现 → 父窗口修）

| 事项 | 事实 | 处置 |
|---|---|---|
| 症状 | t21 的文档自检把「E2E 覆盖」标为「读数未知，不判」，并在 `conflictsWith` 里写明它**与时序门口径不一致**：本需求（以及**全部由现有模板产出的需求**）没有「测试策略（层级…）」表 → `checkE2ECoverage` 恒返回 `false` → 时序门在 **implementing → accepting（实施收尾）** 判 `stage_gate_overdue`。**即：本需求进不了验收，被自己新增的门拦住** | 必须修，且不能靠改本需求文档绕过（那会追溯拦住所有存量需求） |
| 修法（父窗口亲自改，1 处） | `src/application/internal/content-gate-wiring.ts` 的 `e2eCoverageOf`：**没有「层级」表 = 读数未知 → `undefined`（不判）**；**有表但缺 E2E 行 = `false`（照旧拦）**。判据本身（时序门）早就写了 `undefined = 读数未知（不判）`，此前是**喂进去的读数把未知压成了布尔** | 与「未到期不判」（t13）、「读数未知不追加」（既有 E2E 读数契约）、「存量豁免」（t9/t22）**同一条口径**：假红比漏报更难查 |
| 证据 | ① 时序门既有 19 例全绿（「有表缺 E2E 行 → 拒」语义未变）；② 本需求实跑：`implementing → accepting` **PASS**（修前会被判 overdue），另两条转移也 PASS；③ **新增回归锁**：`tests/stage-gate-timeline.test.ts` 加「没有测试策略表 → 读数未知 → 放行」一例，并做**变异验证**（把判据改回恒 `false` → 正好只有这条红：`1 failed | 19 passed`，还原后 20/20） | 见左 |
| 遗留改进项 | 模板里应加「测试策略（层级，含 E2E 行）」表，让**将来的**需求能被真正判定 E2E 覆盖（而不是永远"读数未知"） | 记账为后续项：属模板面（t14/t20 家族），本轮**不追溯**改动存量需求文档 |

## 5b. 已知技术欠债（接受但需后续收口）

| 欠债 | 事实 | 为什么现在不收 | 收口方式 |
|---|---|---|---|
| ~~触发点集合有两处~~ **已收口** | 一度宿主侧自建 `RtmYamlTrigger` + `runSubmitPrototypeTrigger` | — | 已按裁决收编进 vendor 的 `RTMTrigger` 联合与 `filesForTrigger`，宿主壳删除；并新增**源码级断言**禁止宿主再自建第二份（`两处触发点=两份真相必漂移` 变成会失败的检查） |
| `ExecuteTask.ts` 646 行 | 基线 521 行已超单文件 400 行门限，本需求 +125 | 拆文件会扩大本卡改动面与回归风险 | 后续把提示词渲染辅助函数抽成独立模块 |
| 另三处尺寸超标 | `content-gate-wiring.ts` 826→923、`confirm-settle.ts` 408→438、`http/routers/requirements.ts` 760→812（三者 HEAD 已超 400 行） | 卡面把入口钉在该文件；拆分 = 另立项 | 记账；后续按模块职责拆 |
| `AcceptanceSheetSpec.ts` 580→721 行 | 同上（HEAD 已超限，白名单只允许 client/ 与 shared/protocol.ts） | 拆 domain 文件超出本卡范围 | 记账；后续另立拆卡 |
| 提示词轻档余量仅 32 字符 | t15 的两条新铁律吸收了几乎全部余量（最紧的一档 brainstorming 2468/2500） | 见 4c 的取舍 | 后续再加纪律前需先评估：或精简 floor 正文，或为"必须有"的纪律单列预算 |
| 设计文档两处表述与实测不符 | ① `expectedRTMFiles()` 设计写「7 份」，实测最多 6 份（第 7 份是按任务生成的 `rtm-implementing/<task>.yml`，status 推不出）；② `data-model` §3.3 说扫键、§3.4 反例却是值 | 设计已确认，改设计要走确认门 | 本表记录为准；归档时把两处表述一并修正进合并去向文档 |

## 5c. Dogfood②：本需求自己过不了自己的原型门

用 t6 交付的门禁链，拿**本需求自己**做输入实跑（探针 `.tmp-probe/self-chain.mts`，一次性）：

```
本需求 front-matter: sides: [frontend, backend]
brainstorming → design      : prototype_missing   ← 被自己的门拦下
design → decomposing        : PASS
decomposing → implementing  : PASS
```

- 事实：本需求声明了 `frontend` 端侧，但产物簿里没有已登记的 `kind=prototype` 产物 → 存在门按设计报 `prototype_missing`。
- 判读：**门真的在工作**（不是只在夹具上绿），且它拦的正是本需求要消灭的那类事——「UI 需求在需求阶段没交原型」。
- 处置：本需求创建于 2026-10-05，早于规则生效日（`prototypeRulesSince = 2026-10-06T00:00:00Z`，t9 常量），按 **t9 的适用性判据走 `exempted: legacy` 侧**，不追溯、不返工。这是设计内行为，不是缺陷。
- 附带结论：这条也解释了为什么本需求的**模板/注入/门禁三面必须同源**——规则一旦生效，凡是声明了 frontend 的新需求，需求阶段不交原型就出不去；模板不落骨架、注入不提醒、门禁不拦人，三者缺一都会让规则变成纸面文字。

## 6. 交接清单（给尚未开工的卡）

- **t11（原型骨架）**：① 仍须把 `templates/design/prototype.html` 迁到 `templates/brainstorming/prototype.html`（文件内注释也还写着 design 路径）；② 补**恰好一块** `<!-- proto-geometry {"observations":[…]} -->` 注释位（禁阈值字段）；③ 补 `prototypes/INDEX.md` 四列表格骨架（路径/状态/服务条款/被取代于）；④ 补权威版本标记位；⑤ 现在只有一个 `id="FR-1"` 示例区块，须写明「每个 FR 一个区块、须覆盖服务条款声明的全部 FR」；⑥ `{{TITLE}}/{{REQ_ID}}/{{DATE}}` 若进 R1 渲染映射表要登记；⑦ `tests/template-address.test.ts` 的 allowlist 写的是 `design/prototype.html`，迁移后须同步。
- **t19（R1/R2 探针）**：① R1 必须**按文档类分派**——需求模板 → `missingCategoryDocs` + `checkRequirementDocFormatGate`；设计模板 → `checkDesignSectionsHaveServes`（无差别喂三个门禁必红：feature 7 条、decomposition 4 条、task-card 8 条、verification 5 条）；② `scripts/template-render-map.json` 需新增 `{{PROTOTYPE_REFS}}`、`{{DECISION_REFS}}`（否则按 #26 exit 1 点名）；③ R2 的「门禁侧集合」需并入裁定门节名 `讨论与裁定记录（D-x）` 并体现「仅 feature」（D-12），否则字面双向相等必红。
- **t13（阶段门时序）**：消费 t8 交付的两维读数 `CoverageChecker.checkPrototypeTraceability`（`prototype_anchors` / `decision_refs`，`blocking:false`）。
- **t12（拆分覆盖门锚点维）**：除门禁外，补第 2 节所列的**写侧**（`PlanTask` 两键 + 白名单搬运 + 工具 schema + `PlanTaskDraft` + 落库写入），否则门禁无数据可查。

## 7b. 交付时刻的最终数字（可直接引用进验收材料）

**本需求全部相关用例**（30 个文件，一次跑完）：

```
Test Files  30 passed (30)
     Tests  495 passed | 2 skipped (497)
```

覆盖：产物契约、错误码契约、编号与字段契约、原型三门、裁定门、四路径接线、追溯两节、覆盖度两维、触发点与健康、原型登记编排、骨架落盘、拆分锚点门、阶段门时序、六份模板、三条注入通路、文档面板、验收单两支、存量兼容。

**全量套件**（同一时刻，仅用于归因）：

```
Test Files  37 failed | 446 passed | 3 skipped (486)
     Tests  68 failed | 5583 passed | 22 skipped (5673)
```

逐条核对结论：
- **本需求的 30 个用例文件，无一出现在 39 个失败文件清单里**（按文件名逐一比对，非抽样）。
- 唯一「被本需求触及、又落在红名单里」的文件是 `tests/output-contract.test.ts`：单独核实其 4 条红，全部是**别的窗口新增的四个工具**（`defineTaskAdoptTool` / `defineKnowledgeTool` / `defineRegenerateTool` / `defineSkillInstallTool`）缺响应源映射，**`prototype` 关键字命中数 = 0**。
- 其余红（layer-boundary、size-budget、design-registration、decompose-tools、dive-*、failure-alert 等）均为 HEAD 基线红或并行窗口在飞改动；各卡在汇报里都附了对照实验（HEAD 覆盖 / stash 回退 / 干净 worktree）作为归因证据。

## 7. 全量红的归因方法（供验收复核）

各卡汇报里的「全量红」均已用**对照实验**归因，方法统一为下面之一：
1. 用 `git show HEAD:<file>` 覆盖本卡改动后重跑，比较失败集合是否相同；
2. `git stash` 只回退本卡文件后重跑；
3. 在 `git worktree add --detach … HEAD` 的干净检出上跑同一命令。

结论一致：本需求各卡相关用例全绿；全量红全部来自**并行窗口的在飞改动**（layer-boundary 越界、设计登记门禁接线、多个新工具缺响应来源声明、尺寸门禁白名单漂移等），与本需求无交集。
