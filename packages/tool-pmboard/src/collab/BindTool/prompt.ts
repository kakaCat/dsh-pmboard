/**
 * reqboard_bind 工具提示词（REQ-261003215944-9e04 FR-2）
 */
export const BIND_PROMPT = `给一条需求加/减席位：把另一个窗口请进来一起干（worker），或者请进来只看不动（observer）。

适用于：
- 一个需求的活干不完，想把另一个窗口叫进来领卡干活
- 想让人旁观：能看进度、不能改任何东西（observer）

参数：
- role（必填）：worker = 能领卡/汇报/提交产物；observer = 只读
- requirement_id（可选）：目标需求；缺省 = 本窗口绑定的需求
- window_key（可选）：把席位派给哪个窗口；缺省 = 本窗口
- remove（可选）：true = 解绑该席位（owner 不可解绑）

返回：变更后的完整席位表（seats）与 changed（重复派席 = false，幂等）。

失败时：
- role 不是 worker/observer、或想解绑 owner → REQBOARD_INVALID_INPUT
- 席位已满（缺省上限 8）→ REQBOARD_SEAT_LIMIT
- 需求不属于本窗口 → REQBOARD_NOT_BOUND_TO_WINDOW
- 调用者不是 owner 席位 → REQBOARD_SEAT_NOT_OWNER

注意：只有 owner 席位能加/减席位；owner 由立项产生，不经本工具。`
