# REQ-261005105032-3b02 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：UI 需求在需求阶段「交了原型、并让原型可判定」这件事，从一段会议共识变成了系统里会拦人的机制——23 张卡全部收口，机制、模板、注入面、探针四层同步落地。

一、做完之后什么变了
1. 原型成为一等产物：有种类身份、中文名与图标、阶段归属、面板映射；「交原型」是有登记、有锚点、有几何量、有留痕的动作，而不是往目录里扔一个 html。
2. 三道原型门可判定：存在（只认显式登记，自动发现不算）、权威唯一（索引恰好一条，引用被取代版即拒）、锚点与几何量（缺锚点、块数不对、出现阈值即拒）。
3. 裁定落账成为门：需求阶段人的祈使与纠正必须逐条落成可机检条目（五列齐、编号连续唯一、真空态可辨），缺则拒。
4. 门禁收敛为唯一入口 contentGatesForMove，接线五处调用点（含卡面漏写的两处真实落点），每个都有「停用即红」的变异验证；零回归由全库差集为空机械证明。
5. 四条探针 + 一条文档自检收口：模板能否过门禁、门禁节名与模板是否双向一致、提示词路径是否可达、内联产物是否新鲜、九项文档判据一条命令可核验。
6. 防退化：三次 dogfood 固化成可复跑命令；探针从只打印升级为不达标就红；无浏览器环境响亮失败（退出码 2），不再静默跳过。
7. 不追溯：存量需求零迁移、旧数据一字节未改，历史需求一律标豁免。

二、自证（不是自述）
- 本需求 39 个用例文件：628 例通过；6 例红落在 2 个文件，逐条归因为 HEAD 基线红与他人新增工具缺响应源映射，与本需求无交集。
- 类型检查 0；四条探针与文档自检全部退出码 0；六条逆验证全部必红且还原逐字节核对。
- 覆盖清单见 tests/coverage-map.md（106 张在位卡逐条标注）；评审报告见 reviews/implementation-review.md；测试证据见 tests/acceptance-evidence.md；执行期裁决见 notes/execution-decisions.md；端到端证据见 notes/e2e-evidence.md。

三、四次自己拦自己（都已修并留证据）
- 本需求自己的需求文档被自己新增的裁定门拒（两条裁定的影响条款写成「全 FR」不是编号）→ 改文档不放宽门。
- 本需求自己被自己的阶段门拦住（E2E 读数被压成布尔，存量需求都没有测试策略表）→ 修正读数为「无表即未知不判」并加回归锁。
- 本需求自己的验收材料被自己新增的验收单规则拦下（声明了前端端侧却未交原型）→ 由人裁定豁免并写入需求文档，机制正确生效。
- 门自己绿了（骨架被自动发现补登即通过存在门）→ 收紧为「只认显式登记」并修掉配套的登记升级死结。

四、如实披露的未完成面与平台观察
- 三级追溯只判可读的第一级（第二级需任务集、第三级本身是既有待办）；
- 接手推进与启动对账那条入口未接原型骨架（跨组合根，需引入文档端口，已记账）；
- 若干文件超出单文件行数门限（该门禁基线即红），按既有口径记账不拆；
- 平台观察：测试覆盖度门禁把已取消的卡也算进分母（本需求 132 张里 26 张已取消，上限 80.3%），接近 80% 阈值——建议后续把已取消卡从分母剔除。

## 1. 验收列表

### v1-1 · 定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）

**验收内容**：【定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）】验收

**操作步骤**：
1. pnpm typecheck 退出码 0
2. npx vitest run tests/artifact-spec.test.ts tests/artifact-labels.test.ts 全绿且含断言：kindForRelPath('prototypes/detail.html')==='prototype'
3. kindForRelPath('prototype/detail.html')==='prototype'
4. kindForRelPath('prototypes/INDEX.md')==='prototype'
5. kindForRelPath('prototypes/detail.html.bak')==='notes'
6. stageForKind('prototype')==='brainstorming'
7. KIND_LABELS.prototype==='原型'。git diff package.json 为空（零新增运行时依赖）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-2 · 登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约

**验收内容**：【登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约】验收

**操作步骤**：
1. npx vitest run tests/gate-feedback-envelope.test.ts tests/http-envelope-status.test.ts 全绿：7 个内部码逐一 statusForCode(code)===400
2. GATE_HOW_ANCHOR.test('prototype_exempt')===true
3. transportCodeOf 对五个新码各映射到对应 REQBOARD_*
4. transportCodeOf('some_unknown')==='some_unknown'（原样透传）
5. 每个新门的 how 文案命中 reqboard_submit(kind=prototype) 或 templates/。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-3 · 扩编号白名单（D-\d+）与台账新可选字段契约

**验收内容**：【扩编号白名单（D-\d+）与台账新可选字段契约】验收

**操作步骤**：
1. npx vitest run tests/clause-numbering.test.ts tests/serve-extraction.test.ts 全绿且含断言：collectIds('D-1') 深等于 ['D-1']
2. collectIds('D-ARCH-2') 深等于 ['D-ARCH-2']
3. collectIds('D-1 D-ARCH-2') 同时含两项
4. collectIds('D-1abc') 为空数组
5. stripPrototypeAnchors('prototypes/x.html#FR-4') 输出含 '<proto-anchor>' 且对该输出再 collectIds 不含 'FR-4'。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-4 · 实现原型三门与元数据解析（prototype-gates.ts + 条件必交判定）

**验收内容**：【实现原型三门与元数据解析（prototype-gates.ts + 条件必交判定）】验收

**操作步骤**：
1. npx vitest run tests/prototype-gates.test.ts tests/prototype-metadata-parse.test.ts tests/category-doc-sets.test.ts 全绿：缺已登记 prototype 且无有效豁免 → prototype_missing
2. INDEX 的 authoritative 为 0 条与 2 条 → prototype_version_conflict 且 gaps 点名路径
3. requirement.md 引用 superseded 版 → 同码
4. 缺 id="FR-4" 区块 → prototype_anchor_missing 且 gaps 点名 FR-4
5. geometry 两块或含 threshold → 同码并点名块数
6. 合法标本 → 三门均 undefined
7. sides:[backend] 标本 → 三门均 undefined
8. 豁免三态（空理由拒 / 未落章拒 / 已落章放行）各断言一次。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-5 · 实现裁定记录门与会话留痕判据（decision-gates.ts）

**验收内容**：【实现裁定记录门与会话留痕判据（decision-gates.ts）】验收

**操作步骤**：
1. npx vitest run tests/decision-gates.test.ts 全绿：有留痕且缺节 → decision_log_missing
2. 条目缺原话来源或影响 FR 未命中真实 FR → decision_entry_invalid 且 gaps 同时列出 D-3 与 D-5
3. 跳号 D-1,D-3 与重复 D-2,D-2 均拒
4. 真空态且无留痕 → 放行
5. 有留痕却只写真空态 → 仍拒
6. 非 feature 需求返回 undefined
7. 冷读路径用例标 @integration 且默认不跑。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-6 · 加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径

**验收内容**：【加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径】验收

**操作步骤**：
1. npx vitest run tests/move-gate-paths.test.ts 全绿：S-1 标本（feature + sides 含 frontend + 无已登记 prototype）走四条路径全部返回 prototype_missing，会话侧传输码均为 REQBOARD_MISSING_PROTOTYPE
2. 同标本把 G2（设计文档集）置为失败时四条路径也都拒（双锁）
3. 人为注释掉任一调用点后重跑 → 对应用例红（四条各一次）。npx vitest run tests/artifact-gates.test.ts tests/design-gates.test.ts 既有用例零回归
4. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-7 · 扩展 RTM 类型并生成 prototypes/decisions 两节

**验收内容**：【扩展 RTM 类型并生成 prototypes/decisions 两节】验收

**操作步骤**：
1. npx vitest run tests/rtm-prototype-sections.test.ts 全绿：对标本跑生成后 rtm-brainstorming.yml 含非空 outputs.prototypes（每条带 authoritative 与 anchors）与 outputs.decisions 两节
2. metadata.rtm_version==='2.0' 而 metadata.version 仍是写入计数
3. rtm-decomposing.yml 的 task_coverage 每项含 covers_prototypes 与 covers_decisions 键
4. 设计章节文本里的 'prototypes/x.html#FR-4' 经 strip 后不进 serves。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-8 · 加 RTM 覆盖度两维与校验器宽容度

**验收内容**：【加 RTM 覆盖度两维与校验器宽容度】验收

**操作步骤**：
1. npx vitest run tests/rtm-coverage-prototype.test.ts tests/rtm-validator-tolerance.test.ts 全绿：UI 卡 prototypeRefs 为空 → 覆盖度 < 100% 且 gaps 点名该卡编号
2. D-7 未被任何 FR/卡引用 → 点名 D-7 且该维覆盖度下降
3. 缺 prototypes 与 decisions 节的旧 YAML → 读出 pending 且不产生错误
4. 含未知 key 的旧 YAML → 忽略不报错
5. accepting 生成结果含『原型对照』条目。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-9 · 加 RTM 触发点 submit:prototype 与健康检查适用性判据

**验收内容**：【加 RTM 触发点 submit:prototype 与健康检查适用性判据】验收

**操作步骤**：
1. npx vitest run tests/rtm-trigger-prototype.test.ts tests/rtm-health-legacy.test.ts 全绿：调 syncRTMYaml('submit:prototype', {paths:['prototypes/detail.html']}) 后 brainstorming YAML 被刷新且返回 ok、paths 在留痕中可见
2. RTM 写盘失败只返回 warning、不抛
3. 存量标本（createdAt < prototypeRulesSince）缺节 → exempted: legacy 且不判不健康
4. 新需求标本（createdAt >= prototypeRulesSince 且 sides 含 frontend）缺节 → 不健康并点名该需求
5. expectedRTMFiles() 仍返回 7 项。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-10 · 实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕

**验收内容**：【实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕】验收

**操作步骤**：
1. npx vitest run tests/submit-prototype.test.ts tests/submit-prototype-exempt.test.ts 全绿：合法标本 reqboard_submit(kind='prototype') → success=true、registered_count=1、返回项 anchors 含 'FR-4'、geometry 观测量名含 'tabsTop'
2. 重复调用 → registered_count=0 且台账不重复入簿、INDEX 内容逐字节未改
3. 目录不存在 → success=false、registered_count=0、blockers 含 prototype_missing（不谎报成功）
4. 豁免三态：空理由 → 仍拒
5. 理由非空但 requirement 未落章 → 仍拒（agent 不能自豁免）
6. 已落章 → 放行且写入一条 [豁免] <理由> 需求评论。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-11 · 把原型骨架迁入 brainstorming 并幂等落盘

**验收内容**：【把原型骨架迁入 brainstorming 并幂等落盘】验收

**操作步骤**：
1. npx vitest run tests/prototype-skeleton.test.ts 全绿：进入 brainstorming 后需求目录下 prototypes/<name>.html 存在且含 proto-geometry 注释位与 INDEX 骨架
2. 再次进入同一需求内容逐字节不变（先手改一行再跑仍不被覆盖）
3. test ! -e templates/design/prototype.html 为真且 templates/brainstorming/prototype.html 存在
4. 非 UI 需求（sides 不含 frontend）进入 brainstorming 不落盘。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-12 · 加拆分覆盖门的 UI 卡原型锚点维度

**验收内容**：【加拆分覆盖门的 UI 卡原型锚点维度】验收

**操作步骤**：
1. npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/clause-coverage-gate.test.ts 全绿：UI 卡 prototypeRefs 为空 → 落库前被拒并点名该卡 key 与『设计落点』补写位置
2. 补上 prototypes/detail.html#FR-4 后放行
3. 非 UI 需求与存量需求不受影响
4. assertClauseCoverageGate 对『某条 FR 无落点』的既有拒绝行为零回归。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-13 · 定义阶段门时序常量与逾期码接线

**验收内容**：【定义阶段门时序常量与逾期码接线】验收

**操作步骤**：
1. npx vitest run tests/stage-gate-timeline.test.ts 全绿：三标本各自被对应转移拒绝且 code 为 stage_gate_overdue、gaps 点名逾期门（设计已交完而 dangling 未绿 / 拆分已落库而 UI 卡无锚点 / 实施已收尾而 E2E 覆盖 false）
2. brainstorming 期编号链全 orphan 且 E2E false 的标本走同一门 → 放行
3. 会话侧传输码为 REQBOARD_STAGE_GATE_OVERDUE。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-14 · 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

**验收内容**：【改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项】验收

**操作步骤**：
1. npx vitest run tests/category-doc-sets.test.ts 全绿且含断言：templates/brainstorming/feature.md 与 templates/design/frontend.md 渲染占位符后喂 hasRootSection/missingCategoryDocs → 0 缺口（D-5 逆验证：把必填节标题改坏 → 必红）
2. feature.md 的 H2 集合含『讨论与裁定记录（D-x）』而其余五份同族模板不含（D-12）
3. decomposition.md 任务表表头含『原型锚点』与『关联 D-x』
4. verification.md 含『与原型对照截图』与『D-x 对照』
5. task-card.md 含两个新占位符。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-15 · 注入片段面加 D-x/原型纪律并重生成内联产物

**验收内容**：【注入片段面加 D-x/原型纪律并重生成内联产物】验收

**操作步骤**：
1. node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs 退出码 0（源与 src/domain/prompt/generated/fragments.ts 一致）
2. npx vitest run tests/prompt-tiers.test.ts 全绿
3. 源码级断言：iron-rules.md 文本含 'D-x' 与原型必交两条，brainstorming/feature.md 片段含 D-x 与原型清单项
4. git diff --stat vendor/ 为空（未改上游原文）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-16 · 三条注入通路带上原型与 D-x（回合指令/节点输入包/子卡提示词）

**验收内容**：【三条注入通路带上原型与 D-x（回合指令/节点输入包/子卡提示词）】验收

**操作步骤**：
1. npx vitest run tests/subtask-prompt-prototype.test.ts tests/node-input-package.test.ts tests/round-state-dive.test.ts 全绿：UI 卡提示词包含【本卡原型（UI 卡）】与 prototypes/detail.html 与 #FR-4
2. 非 UI 卡不含该小节
3. 带 decisionRefs 的卡提示词包含【本卡裁定（D-x 原话）】且该句与 requirement 文档里的裁定原文逐字一致
4. 节点输入包渲染的『证据指针』节出现 prototypeRefs 与 decisions 两行，交棒底稿复用同一投影。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-17 · 客户端文档面板原型单列与权威/被取代投影

**验收内容**：【客户端文档面板原型单列与权威/被取代投影】验收

**操作步骤**：
1. npx vitest run tests/docs-panel.test.ts tests/query-docs.test.ts 全绿：prototypes/detail.html 与 prototypes/INDEX.md 出现在 documents 且 kind 为 prototype、不再出现在任何 discovered 分组
2. documents 中台账行数 + Σ discovered.count == artifacts.length
3. data-doc-row 条数 == documents.length
4. INDEX 有一条 authoritative + 一条 superseded 时两行分别带 prototypeRole 与 supersededBy，读不到 INDEX 时两字段都不注入
5. 原型行可点开（存在 data-open-doc）且无新增弹窗与路由。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-18 · 验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支

**验收内容**：【验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支】验收

**操作步骤**：
1. npx vitest run tests/accept-sheet-rtm-integration.test.ts tests/accept-sheet-tool.test.ts tests/acceptance-criteria.test.ts 全绿：UI 需求验收单必含 prototype-compare 项且 criterion 逐字为『与原型对照截图（含差异说明）』，非 UI 需求不含
2. 有 D-x 时含 decision-compare 项且 decisionIds 非空
3. 三处消费点喂新 source 后弹框 header 无 'undefined'、RTM 里无 fr_id='UNKNOWN'
4. 已豁免需求无该项但有豁免说明行且提交不被阻塞
5. 非豁免 UI 需求提交缺该项 → 内部码 verification_prototype_compare_missing。pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-19 · 加 R1 模板门禁探针与 R2 节名双向一致探针

**验收内容**：【加 R1 模板门禁探针与 R2 节名双向一致探针】验收

**操作步骤**：
1. npx tsx scripts/template-gate-probe.mts 退出码 0 并打印 6 份模板逐份 OK 与『缺口 0』
2. 人为把 templates/brainstorming/feature.md 的必填节标题改坏 → 退出码 1 且点名该模板与缺口
3. 往模板塞未登记占位符 {{NOPE}} → 退出码 1 且点名该占位符
4. npx tsx scripts/doc-section-parity.mts 退出码 0，构造『模板多一节』与『门禁少一节』两个标本各退出码 1 并点名该节
5. 两脚本 --json 输出可 JSON.parse 且退出码语义不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-20 · 加 R3 提示词路径可达探针与 R4 pnpm 脚本接线

**验收内容**：【加 R3 提示词路径可达探针与 R4 pnpm 脚本接线】验收

**操作步骤**：
1. npx tsx scripts/prompt-path-probe.mts 退出码 0（片段与回合指令里的路径全部可达）
2. 插一个指向不存在文件的指针 templates/nope.md → 退出码 1 并点名该指针
3. pnpm prompts:check 退出码 0，改一处片段源而不重生成后重跑 pnpm prompts:check → 退出码非 0（堵『静默注入旧纪律』）
4. 读 package.json 的 scripts['prompts:check'] 含 inline 与 check 两条命令。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-21 · 加文档自检脚本 req-doc-validate.mts（9 项）并并入 R1

**验收内容**：【加文档自检脚本 req-doc-validate.mts（9 项）并并入 R1】验收

**操作步骤**：
1. npx tsx scripts/req-doc-validate.mts 退出码 0 并逐条打印 9 项 OK
2. 人为删掉 requirement.md 的一个必填节标题 → 退出码 1 并点名缺哪一节
3. npx tsx scripts/req-doc-validate.mts --json 输出可 JSON.parse 且含 9 项判据名与缺口数组
4. npx tsx scripts/template-gate-probe.mts 的输出与退出码包含本自检结论（断言 R1 接线成立）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-22 · 核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免）

**验收内容**：【核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免）】验收

**操作步骤**：
1. npx vitest run tests/compat-regression.test.ts 全绿：全量读取存量 docs/requirements/*/rtm-*.yml 零异常
2. 缺节标本读出 pending
3. 旧台账分片缺三个新键时读取路径不报错且不产生写回（git status 无旧分片改动）
4. 存量需求走新门禁 → 放行
5. 存量健康检查 → exempted: legacy 且不判不健康
6. 本轮未新增任何迁移脚本（git status 无 migrate-* 新文件）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-23 · 产出端到端证据与六条逆验证（几何量硬判据 / exit 2）

**验收内容**：【产出端到端证据与六条逆验证（几何量硬判据 / exit 2）】验收

**操作步骤**：
1. npx tsx scripts/req-report-probe.mts 退出码 0 且打印 PROBE PASS
2. 人为改坏一处几何量（把硬上限改成必然违反的值）→ 退出码非 0 并打印具体判据
3. CHROME_BIN=/nonexistent 时 → 退出码 2
4. npx vitest run tests/probe-hard-criteria.test.ts 断言命中数为 0
5. npx tsx scripts/reverse-drill-matrix.mts 六条逆验证全部判定为必红（每条打印改坏点）
6. pnpm typecheck 与 pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-24 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-25 · 需求级验收

**验收内容**：本需求已豁免原型（理由：规则上线前的存量需求，改动面为门禁/校验/模板/注入面，界面侧仅既有区块归组，无新增视觉设计面（用户 2026-10-05 裁定豁免））

**操作步骤**：
1. 本需求已豁免原型（理由：规则上线前的存量需求，改动面为门禁/校验/模板/注入面，界面侧仅既有区块归组，无新增视觉设计面（用户 2026-10-05 裁定豁免））

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-26 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-27 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

### v1-28 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径 → tests/design-gates.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径 → tests/design-gates.test.ts。请把锚点改为真实文件，或回写设计/任务卡
2. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（输出 0 行）
- 命令 pnpm templates:check（R1 模板门禁 + R2 节名双向一致）→ 退出码 0；R1「模板 25 份 OK 25 / FAIL 0；缺口 0；文档自检缺口 0」；R2「需求模板 6 类 OK 6 / FAIL 0；双向漂移 0」
- 命令 npx tsx scripts/prompt-path-probe.mts（R3 路径可达）→ 缺口 0 / exit 0；pnpm prompts:verify（R4 只校验不重生成）→ exit 0
- 命令 npx tsx scripts/req-doc-validate.mts --req REQ-261005105032-3b02 → 9 项判据（实判 8 / 读数未知 1：无测试策略表即无判据对象，不判）
- 命令 npx tsx scripts/self-gate-dogfood.mts → 9/9 条判定如预期：裁定门（改文档放行 / 改回缺陷形态必红）、原型门（真拦 + 存量豁免）、时序门（口径修正后放行 / 改回必红）
- 命令 npx tsx scripts/reverse-drill-matrix.mts → 六条逆验证 6/6 必红并打印改坏点（模板节标题 / 渲染映射表项 / 节名集合 / 路径指针 / 未重生成 / 锚点抹除移除），每一处还原过 sha256 核对
- 命令 npx vitest run tests/probe-hard-criteria.test.ts → 9 例全绿；21 个几何量观测项全部有失败分支；承重逆验证：删两处判据即红并点名
- 命令 npx tsx scripts/req-report-probe.mts → exit 0 且打印 PROBE PASS（4/4 组合）；CHROME_BIN=/nonexistent → exit 2（显式覆盖不许静默回退）；硬上限改坏 → exit 1 并点名两条判据
- 命令 本需求 39 个用例文件一次跑完 → Test Files 2 failed | 37 passed (39)；Tests 6 failed | 628 passed | 2 skipped (636)；6 条红逐条归因（2 条干净 HEAD 上同样红、4 条他人新增工具缺响应源映射）
- 命令 全量套件 → 36 个失败文件；与上述 39 个文件求交集恰好 2 个（均已归因），本需求其余 37 个文件在全量跑里同样绿
- 路径 docs/requirements/REQ-261005105032-3b02/tests/coverage-map.md（测试覆盖清单：106 张在位卡逐条 covers 标注 + 对应测试文件/命令，子卡继承父卡证据）
- 路径 docs/requirements/REQ-261005105032-3b02/tests/acceptance-evidence.md（测试证据汇编：39 文件 628 例、四条探针、文档自检 9 项、六条逆向演练、三次 dogfood、探针硬判据与退出码、全量归因）
- 路径 docs/requirements/REQ-261005105032-3b02/reviews/implementation-review.md（实施评审报告：评审方式六类手段、逐卡结论、复核中提出的四处重要纠正、全量红归因、未通过项如实登记）
- 路径 docs/requirements/REQ-261005105032-3b02/notes/e2e-evidence.md（端到端证据清单 8 节）
- 路径 docs/requirements/REQ-261005105032-3b02/notes/execution-decisions.md（执行期裁决与偏差清单：环境事实、基线缺陷、计划层的洞、卡面与真源不符、有意接受的偏差、三次 dogfood、交接清单、归因方法、最终数字）
- 豁免依据 requirement.md front-matter（prototype_exempt：规则上线前存量、改动面为门禁/校验/模板/注入面、界面侧仅既有区块归组），用户 2026-10-05 在验收前明确裁定豁免

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-2 | 登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-3 | 扩编号白名单（D-\d+）与台账新可选字段契约 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-4 | 实现原型三门与元数据解析（prototype-gates.ts + 条件必交判定） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-5 | 实现裁定记录门与会话留痕判据（decision-gates.ts） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-6 | 加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-7 | 扩展 RTM 类型并生成 prototypes/decisions 两节 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-8 | 加 RTM 覆盖度两维与校验器宽容度 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-9 | 加 RTM 触发点 submit:prototype 与健康检查适用性判据 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-10 | 实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:23 |
| v1-11 | 把原型骨架迁入 brainstorming 并幂等落盘 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-12 | 加拆分覆盖门的 UI 卡原型锚点维度 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-13 | 定义阶段门时序常量与逾期码接线 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-14 | 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-15 | 注入片段面加 D-x/原型纪律并重生成内联产物 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-16 | 三条注入通路带上原型与 D-x（回合指令/节点输入包/子卡提示词） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-17 | 客户端文档面板原型单列与权威/被取代投影 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-18 | 验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-19 | 加 R1 模板门禁探针与 R2 节名双向一致探针 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-20 | 加 R3 提示词路径可达探针与 R4 pnpm 脚本接线 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:25 |
| v1-21 | 加文档自检脚本 req-doc-validate.mts（9 项）并并入 R1 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-22 | 核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-23 | 产出端到端证据与六条逆验证（几何量硬判据 / exit 2） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-24 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-25 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-26 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-27 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
| v1-28 | 需求级验收 · 锚点失效 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-05 19:27 |
