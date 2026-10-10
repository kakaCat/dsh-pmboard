/**
 * reqboard_task_amend 提示词（REQ-261007220012-bd29 FR-4）——修缮簇**单入口**。
 *
 * 合并前是三个并列工具（补条款引用 / 归属补救 / 补子卡链），单职能、低频次、同为「补救/兜底」语义，
 * 是 agent 选错面最大的一簇。合一后由必填 `op` 选择具体修缮动作，其余入参各 op 平移。
 *
 * 单字面量（不拼接）：消息卫生棘轮要求 tools 层拼接数只降不升。
 *
 * @module dsh-pmboard/tools/TaskAmendTool/prompt
 */
export const TASK_AMEND_PROMPT =
  `用于：任务卡/需求**修缮单入口**——五类补救动作由必填 op 选择：① op=refs（补写/修正需求条款引用 requirementRefs；全量替换语义、空数组=清空、值没变幂等不写盘、写完同步 RTM 并在需求评论留痕）；② op=adopt（**归属补救**：把缺父卡归属的卡挂到指定父卡下、补 parentId 与 stageKind，使其按子卡三态推进而不是被当成"存量卡"走五段；仅补缺失归属，改挂已有归属须 force=true）；③ op=chain（给「意图=chain 却缺子卡链」的父卡补链或只读诊断：dry_run 缺省 true 只回执链体检，dry_run:false 须同时传 task_id 与 reason，只补缺失阶段、已有子卡含 done 一律不动、solo 卡跳过）；④ op=archive（需求**已归档**后补录归档清单条目——原归档补录工具已并入本 op，唯一入口在这里：只追加、已存在条目幂等跳过、写完在需求评论留痕；不改产物文件、不改合并去向与说明书更新点、不改需求状态）；⑤ op=interruption（补写断点——原断点补写工具已并入本 op：中断原因原文进台账，同一需求只保留一个断点、后写覆盖前写，供新窗口续跑；挂起确认期间也可用）。入参按 op 取用：refs 需 task_id + requirement_refs + reason；adopt 需 task_id + parent_id（stage_kind/reason/force 可选）；chain 需 task_id（dry_run:false 时）+ reason（同左）；archive 需 docs + reason（requirement_id 可选）；interruption 需 reason（requirement_id 可选）。op 与必填项不匹配会被拒绝并点名该 op 的必填集（REQBOARD_INVALID_INPUT）；卡与父卡都必须属于本窗口绑定的需求。`
