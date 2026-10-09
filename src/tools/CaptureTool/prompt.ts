/**
 * CaptureTool 提示词（REQ-e3b6a0 t8 / FR-7）——立项弹框（pm 专有）的触发纪律。
 *
 * 口径事实源：问项与答案映射以 capture-mapping.ts 的 CAPTURE_QUESTION_IDS 为准（本文件只写触发纪律），与 schema 及三处注入文案
 * （capture-section.ts / QueryState.ts / CreateTool/prompt.ts）为同一份口径，改一处必改全部。
 *
 * @module dsh-pmboard/tools/CaptureTool/prompt
 */
export const CAPTURE_PROMPT = `立项弹框（pm 专有）：识别到值得立项的新工作（feature/bug/doc/refactor/spike/chore）时，
用本工具一次完成「立项弹框 + 创建 + 绑定窗口」——用户作答即立项，不需要再调别的工具补建。
弹框逐问（选项顺序即推荐顺序；推荐标记是选项 label 后缀「（推荐）」，宿主据此预选首项）：
问题一【需求名称】可直接选候选、自定义输入，或选择"✖️ 不需要立项"取消立项（候选经 title_options 传入，最贴切一项放首位）；本问另有「⚡ 全部按推荐值立项」一键过（名称/类型/算力档位/文件落点全走推荐值，回执记 defaults_used）；
问题二【需求类型】feature/bug/doc/refactor/spike/chore；
问题三【算力档位】simple=简单/standard=标准/advanced=进阶/expert=专家——这四档直接决定 agent 在这条需求上投入多少 LLM 算力（提示词详略与检查强度）；
问题四【文件落点】选项即拼好的绝对路径预览（当前工作区 / 宿主默认工作区 / 自定义路径），作答那一刻就能看到文件会落到哪。
何时用：用户在本窗口提出新工作意图且值得立项时（尤其在收到「项目捕获」引导段后）立即调用。
不要这样做：不要先调宿主通用弹框再另调 reqboard_create（两段式会在答案与创建之间断链）；
本工具自带弹框，作答后同一次调用内即完成立项与绑定。
弹框通道不可用时本工具返回 fallback=board 且不伪造立项；此时改为文字向用户取值，再调 reqboard_create。
调用前先 reqboard_status 自查：本窗口已绑定进行中需求或已有 pending 建议时不要重复立项。
拒绝粘滞：调用超时/中断后**不得盲目重弹**——用户可能已在旧弹框点过"不需要立项"；
本工具弹框前会先查拒绝留痕，同窗口 30 分钟内拒绝过则不弹框直接返回未立项，此时停止重试并向用户说明。
仅闲聊、追问进度、或用户在自主回合（非直接消息）时不弹框不立项。`