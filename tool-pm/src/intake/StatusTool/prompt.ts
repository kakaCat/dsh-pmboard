/**
 * StatusTool 提示词（REQ-47939a t8）——从 host/agent-tools.ts 的 defineStatusTool description 原样搬入。
 * @module dsh-pmboard/tools/StatusTool/prompt
 */
export const STATUS_PROMPT = '查询本窗口 reqboard 绑定状态：是否已绑定进行中需求。'
      + '识别到新工作想立项前先自查：已绑定时不要重复立项。'
      + '错误码：REQBOARD_REQUIREMENT_NOT_FOUND（查的需求不在台账）/ '
      + 'REQBOARD_STORE_INCONSISTENT（台账数据不一致，需人工核查）——两者都不是「没有需求」，别当空态处理。'
      + '有挂起确认时会看到 REQBOARD_CONFIRM_PENDING 字样：表示写路径正被人工门拦住（不是查询失败）。'
