/**
 * reqboard_submit 提示词（REQ-47939a t8；REQ-260924213231-b1c4 T-3 增 design）——五个提交入口
 * （requirement / design / plan / verification / archive）的 description 合并为一条，靠 kind 参数区分
 * （工具面 13→9，设计 §4.3）。
 *
 * @module dsh-pmboard/tools/SubmitTool/prompt
 */
export const SUBMIT_PROMPT =
  '提交阶段产物（kind 区分五类，提交后请人确认/审核）：'
  + 'kind=requirement（brainstorming 阶段）：需求文档已落盘 → 登记 requirement 产物，'
  + '人工确认门（brainstorming→design）要求该产物已登记且经人确认；path 不传默认 '
  + 'docs/requirements/<REQ>/requirement.md，summary 为一句话摘要，change_note 为已确认后重写时的变更原因（必填）。'
  // 2026-10-06 文档质量门禁加固（三条写在工具 description 而不是提示词片段里：light 档字符预算已满，
  // 而工具 description 是**调用那一刻**读得到的唯一位置——照模板写文档时也看得见）。
  + '**本次提交的文档硬性要求**：① feature / refactor 的 front-matter 必须显式写 sides（值只有 frontend / backend，[] = 明确声明无端侧改动）——缺或值非法会被拒；② 新需求（2026-10-06 12:00 UTC 之后立项）必须有「失败与并发路径」节（失败路径 / 并发重复 / 状态机非法迁移；确实不适用就写「不适用：<理由>」，不要删节）；③ 每条 FR 的定义行块内给一个可核验判据（命令 / 读数 / 明确取值），缺了只进 clause_criteria_warnings（软提示，不阻断）。'
  + 'kind=design（design 阶段）：登记设计文档（kind=design）——path 不传则扫 docs/requirements/<REQ>/design/*.md 全目录，传了只登记该份（仍走可打开性校验）；'
  + '幂等（已登记的跳过，registered_count 只数本次新登记），返回 design_docs 逐份登记态；未登记时 design→decomposing 会被代码级拒绝，先调本入口。'
  + 'kind=plan（decomposing 拆分阶段；2026-09-21 起设计阶段只写设计文档）：提交拆分计划'
  + '（path=decomposition.md 计划文档、summary=目标+做法、tasks=任务表——任务可带 '
  + 'stages（本卡子卡段，覆盖默认模板）/ template（引用链模板键，如 change-only=研发+复核、acceptance=校验单段；与 stages 二选一）'
  + '与 skipIntegration（无接口可联调时跳过联调段；**给 true 必须同时给 skipIntegrationReason**，否则拒）），'
  // 2026-10-06 拆分面加固（缺口 4）：refs 单口径 + 伪依赖理由 + 文档所见=批准所见。
  + '**任务表硬性要求**：① 每张卡必须写 requirement_refs:["FR-N"]——条款覆盖门禁**只认**卡上这一条通道（计划文档的覆盖对照表只作人读汇总，不再是门禁依据，下游 RTM 与结单证据也只读卡上 refs）；② 某条 depends_on 两端 implementation 声明的文件零交集时，在 dep_reasons 里给一句语义理由（无理由只进 dependency_warnings 建议清单）；③ 计划文档的任务表必须覆盖 tasks[] 的每个 key（表头含「计划 key」），且带「验收」「工作量」列——文档所见=批准所见，缺行缺列被拒。'
  + '待人批准后 reqboard_decompose 才能拆分；已批准过再重交必须传 change_note（旧批准作废）。'
  + 'kind=verification（implementing/accepting 阶段）：提交验收材料（summary=交付结论、'
  + 'evidence=可复核证据清单：命令+输出摘要/报告路径/截图路径）。'
  + '**逐项交结果（REQ-261006092213-4f5b FR-1）**：另传 results=[{ref:{kind:"task",taskId}, result:"命令+输出摘要"}]，'
  + 'ref 与验收项来源同构（task / requirement / prototype-compare / decision-compare），'
  + 'agent 跑不了只能人看的项写 needsHuman:true + humanReason；'
  + '传了 results 就要**逐项交代**——漏项 / 坏 ref / 重复 / 空结果会被拒并点名（FR-2），'
  + '不传 results 按老口径（整单 evidence，人自己填实际结果）。'
  + '需求进入验收态等人工审核。'
  + 'kind=archive（archived/done）：准备归档材料（dir=需求目录、docs=目录内文档清单、'
  + 'merged_into=合并进的项目文档、index_entry=一句话结论、manual_updates/manual_note=说明书更新点），'
  + '必填文档与合法去向按需求类型限定（见 agent-dh/docs/architecture/requirement-archive.md），缺项被代码级拒绝。'
