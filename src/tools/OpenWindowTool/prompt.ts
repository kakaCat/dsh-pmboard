/**
 * reqboard_open_window 工具提示词（REQ-261003215944-9e04 FR-1 / FR-8）
 */
export const OPEN_WINDOW_PROMPT = `开一个新窗口（用 DSH 现成的会话分支），把新工作或长任务交给它。

适用于：本窗口已忙于一条需求，又来了新项目；或某个长任务不该占住当前窗口。

调用后：
- 宿主创建一个新会话，它就是新窗口（窗口码 = 新会话 id）
- 返回 window_key 与 parent_session_id（fork 时）
- 会话出现在侧栏；**本工具不会替你打开并列窗口**，请到侧栏打开

参数：
- mode（可选）：fork = 带上下文（默认）；create = 全新空会话
- at_seq（可选）：仅 fork，切点事件序号；缺省 = 最近一个完整回合

失败时：源会话没有可切分的完整回合 → REQBOARD_OPEN_WINDOW_UNAVAILABLE，请改用 mode=create。
注意：本工具只造窗口，不含登记席位与投递内容。`
