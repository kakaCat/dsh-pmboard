/**
 * reqboard_submit 提示词（REQ-47939a t8；REQ-260924213231-b1c4 T-3 增 design）——各提交入口
 * （requirement / design / plan / prototype / verification / archive）的 description 合并为一条，
 * 靠 kind 参数区分（工具面 13→9，设计 §4.3）。
 *
 * 纪律（REQ-261007200706-89b7 FR-3）：**每 kind 一句话**，不数类数；违规才需要看到的细则
 * 一律住**拒绝回执 message**，不住这里——description 每轮请求常驻，细则放这儿等于让所有人为
 * 少数违规场景付费。细则的落点（改文案时别把它们删了，每处都可由负例复现）：
 *   · sides 声明 / 「失败与并发路径」节 → category-doc-sets.ts 的 sidesDeclarationGap、
 *     content-gate-wiring.ts 的 docSectionGateFailure；
 *   · requirement_refs 唯一覆盖通道 → content-gate-wiring.ts 的 requirement_uncovered；
 *   · dep_reasons 伪依赖理由 → 计划回执的 dependency_warnings（提示语自带写法）；
 *   · 计划文档任务表覆盖 tasks[].key → SubmitArtifact.ts 的任务表门禁 message；
 *   · 「验收」「工作量」列 → plan-doc-table.ts 的 plan_doc_warnings；
 *   · stages / template / skipIntegration(+Reason) → tasks[] 的 schema 参数描述；
 *   · 归档必填文档与合法去向 → protocol.ts assertArchiveMaterials 的分类限定 message。
 *
 * @module dsh-pmboard/tools/SubmitTool/prompt
 */
export const SUBMIT_PROMPT =
  '提交阶段产物（kind 区分产物类型，提交后请人确认/审核）：'
  + 'kind=requirement（brainstorming 阶段）：需求文档已落盘 → 登记 requirement 产物，'
  + '人工确认门（brainstorming→design）要求该产物已登记且经人确认；path 不传默认 '
  + 'docs/requirements/<REQ>/requirement.md，summary=一句话摘要，change_note=已确认后重写时的变更原因（必填）。'
  // 文档质量门禁（2026-10-06）：三条硬性要求的**正文**在下沉后的回执里（sides 声明 /
  // 「失败与并发路径」节 / 每条 FR 的可核验判据），description 只留存在性指引——
  // 照模板写文档天然满足，被拒时回执给全文。
  + '本次提交的文档硬性要求（sides / 「失败与并发路径」节 / 每条 FR 判据）由校验回执逐条给出。'
  + 'kind=design（design 阶段）：登记设计文档——path 不传则扫 docs/requirements/<REQ>/design/*.md 全目录，'
  + '传了只登记该份；幂等（registered_count 只数新登记），返回 design_docs 逐份登记态；未登记时 design→decomposing 被拒。'
  + 'kind=plan（decomposing 拆分阶段）：提交拆分计划（path=decomposition.md、summary=目标+做法、tasks=任务表）；'
  + '任务表硬性规则（requirement_refs 覆盖通道 / dep_reasons 伪依赖理由 / 文档任务表覆盖每个 key 且带「验收」「工作量」列）由拒绝回执逐条给出。'
  + '批准后 reqboard_decompose 才能拆分；已批准过再重交必须传 change_note（旧批准作废）。'
  + 'kind=prototype（brainstorming 阶段）：登记权威原型——path 缺省扫 docs/requirements/<REQ>/prototypes/*.html'
  + '（旧目录 prototype/*.html 仍识别），传了只登记该份；抽锚点与几何量写产物元数据。'
  + 'kind=verification（implementing/accepting 阶段）：提交验收材料（summary=交付结论、evidence=可复核证据）。'
  + '结果要**逐项交代**：另传 results=[{ref:{kind:"task",taskId}, result:"命令+输出摘要"}]，'
  + 'ref 与验收项来源同构（task / requirement / prototype-compare / decision-compare）；'
  + 'agent 跑不了只能人看的项写 needsHuman:true + humanReason；漏项 / 坏 ref / 重复 / 空结果会被拒并点名。'
  + '需求进入验收态等人工审核。'
  + 'kind=archive（archived/done）：准备归档材料（dir=需求目录、docs=目录内文档清单、merged_into=合并去向、'
  + 'index_entry=一句话结论、manual_updates/manual_note=说明书更新点）；'
  + '必填文档与合法去向按需求类型限定，缺项或非法去向被拒时回执给出该类型的限定表。'
