/**
 * reqboard_handoff 工具提示词（REQ-261004150249-731e FR-5）
 *
 * 纪律：只说本工具**真的做得到**的事（席位与绑定真的换到目标窗口、底稿真的自署投递），
 * 不承诺「已经替你打开窗口」——DSH 没有并列窗口能力（与 reqboard_open_window 同口径）。
 */
export const HANDOFF_PROMPT = `把一个需求交接给接管窗口：换 owner、留痕、投底稿——上下文将满时续作的正路。

什么时候用：
- 本窗口水位到顶墙档（fork / critical）：优先在**阶段边界**交接（critical 可不等边界）；
- 人明确要求「这条需求换到那个窗口」时（此时必须写明 reason）；
- 读数不可得（source=unavailable）时**不要**自行交接，先问人。

不做的事：不推进阶段、不碰产物确认状态——它只换人。

调用后：
- 调用窗口降为 observer（只读），目标窗口成为 owner（席位与 sourceSessionId 一次写全 + 留痕评论）；
- 断点 + 节点输入包以**自署来源**投给目标窗口（kind=reqboard-handoff，绝不冒充人类发言）；
- 底稿投递失败**不回滚**交接：回执 delivery.delivered=false + reason，
  此时目标窗口已是 owner（它 reqboard_status 可见），按断点 + 文档目录接手即可。

参数：
- reason（可选；非顶墙档必填）：交接原因，建议写明水位与阶段
- mode（可选）：fork = 带旧上下文；create = 全新空会话（缺省，靠断点 + 输入包接续）
- to_window（可选）：指定接管窗口（= 会话 id）；缺省新建一个窗口

失败时（台账零改动）：非 owner → REQBOARD_SEAT_NOT_OWNER；to_window 为空串或等于本窗口 →
REQBOARD_HANDOFF_TARGET_INVALID；读数不可得且无 reason → REQBOARD_HANDOFF_NO_CONTEXT；
拿不到源会话项目落点 / 无开窗能力 → REQBOARD_OPEN_WINDOW_UNAVAILABLE。
注意：新建的只是**会话**，不会替你打开并列窗口，请到侧栏打开它。`
