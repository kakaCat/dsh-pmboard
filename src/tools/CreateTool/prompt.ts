/**
 * CreateTool 提示词（REQ-47939a t8）——从 host/agent-tools.ts 的 defineCreateTool description 原样搬入。
 * @module dsh-pmboard/tools/CreateTool/prompt
 */
export const CREATE_PROMPT = `创建即立项：识别到值得立项的新工作（feature/bug/doc/refactor/spike/chore）时直接创建需求。
首选 reqboard_capture（pm 专有立项弹框）：一次调用弹出「立项弹框」并在同一次调用内完成
创建与窗口绑定——弹框逐问为【需求名称】（可经 title_options 传候选，最贴切一项置首推荐，允许自定义输入）、
【需求类型】（feature/bug/doc/refactor/spike/chore）、
【算力档位】（simple=简单/standard=标准/advanced=进阶/expert=专家，
这四档直接决定 agent 在这条需求上投入多少 LLM 算力：简单适合快任务，标准适合大多数需求，进阶和专家适合复杂/高风险改动）、
【文件落点】（选项即拼好的绝对路径预览：当前工作区 / 宿主默认工作区 / 自定义路径——作答那一刻就知道文件落在哪）。
用户作答即立项确认，**不需要**再补调本工具。
本工具是**已明确取值**时的手工路径（弹框通道不可用，或用户在对话里已直接给出取值）：按用户确认值调用——
title=需求名称、category=需求类型、prompt_difficulty=难度级别、summary=工作摘要、reason=立项依据，
doc_location=需求文档位置（工作区相对目录，如 docs/requirements/<REQ>/ 或 docs/rfcs/；不传 / 空串 →
回落 docs/requirements/<REQ>/ 并在 defaults_used 标注，语义与工具 schema 的 doc_location 参数同源）。
创建后 REQ 立即在看板 draft 泳道可见、本窗口绑定该需求。
**代理立项（把需求派给别的窗口）**：传 owner_window = 目标窗口码（session-xxxx），需求就记在**它**名下、
由它接手推进，本窗口不拥有它——这是「agent 替人把多条工作面派给不同会话」的正路：
① 先 reqboard_open_window(mode=create, seed_text=底稿) 拿到窗口码；
② 再对本工具传 owner_window=<该窗口码>，一次调用完成「立项 + 派活」；
③ 台账如实记为 agent 代理创建、弹框取值**未经弹框逐问确认**（授权来源 = 本窗口的直接人工指令），
   需求同时被推进到需求阶段，目标窗口无需人再发话即可接手。
目标窗口必须在线，否则报 REQBOARD_OWNER_WINDOW_NOT_LIVE（不把需求记到没人接手的窗口名下）。
错误码：REQBOARD_WINDOW_BOUND（本窗口已绑定需求）/ REQBOARD_INVALID_INPUT（入参非法，如 title 为空）/
REQBOARD_INVALID_WORKSPACE（工作区不可用，需求落不了盘）——三种都先 reqboard_status 自查再重试。
调用前先 reqboard_status 自查：本窗口已绑定进行中需求或已有 pending 建议时不要重复立项。
仅闲聊、追问进度、或用户在自主回合（非直接消息）时不提议不立项。`
