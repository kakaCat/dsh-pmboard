/**
 * goal 工具的描述文案（保留本插件既有三段式写法：什么时候用 / 驱动含义 / 不做什么）。
 *
 * 【两层的说法必须清楚】（用户裁定 2026-10-10）：PM 的 goal 分**两层**——
 *   · **L2 任务目标**（task goal）：挂在一张**任务卡**上，答"这张卡还要不要继续跑"；
 *   · **L1 阶段目标**（stage goal）：挂在**需求**上，每主阶段一条达成位，全达成 ⇒ 具备收口条件。
 * 工具面必须两层都有；"创建"指**任务目标的创建**（不是需求/repoard 级的立项）。
 *
 * @module dsh-pmboard/tools-goal/prompt
 */

/** 两层关系（所有 goal 工具共享，避免各写一份）。 */
export const TWO_LAYER_NOTE = [
  '两层目标：**任务目标**（挂任务卡，管"这张卡继续不继续"）与**阶段目标**（挂需求，管"这个阶段成没成"）。',
  '阶段目标全达成 ⇒ 需求具备收口条件（仍过人工门）。',
].join('\n')

/** 阶段序列（**从项目创建起**，到归档止）——与 core 的 `ALL_STAGE_KEYS` 同序同集。 */
export const STAGE_SEQUENCE_NOTE = [
  '阶段序列**从项目创建开始**：draft（创建/立项）→ brainstorming → design → decomposing →',
  'implementing → accepting → archived（归档）。阶段表按这个顺序覆盖你要跟踪的阶段；',
  '**"项目完成" = 所有阶段目标都达成**（全 done ⇒ 具备收口条件）。',
  '未登记阶段 = 不跟踪（不臆造）：部分跟踪合法，但想按"全阶段完成"收口就得把全序列登记齐。',
].join('\n')

/** 共享的驱动含义段（任务目标层）。 */
const DRIVER_NOTE = [
  '驱动含义：任务目标的相位是自动续跑前的最后一道闸——只有 `active` 会继续投回合；',
  '`paused`/`blocked`/`complete` 会让窗口停手等人，**不改人的意图、不写健康位**。',
].join('\n')

/** 三个任务目标工具共同遵守的边界。 */
export const TASK_GOAL_BOUNDARIES = [
  '不做的事：',
  '- 不写阶段目标的达成位（`reqboard_stage_goal_done` 只许人调）；',
  '- 不代替 `reqboard_task_move`（卡状态迁移仍走它；本工具只管目标相位）；',
  '- 不记回合数（唯一权威 = `dive.roundsInStage`）。',
].join('\n')

/** 阶段目标工具的边界。 */
export const STAGE_GOAL_BOUNDARIES = [
  '不做的事：',
  '- 不推进需求阶段（那是 `reqboard_move` 的人工门）；达成位只回答"客观条件具备"。',
].join('\n')

/** `reqboard_task_goal_get`：只读任务目标。 */
export const TASK_GOAL_GET_PROMPT = [
  '读一张**任务卡**的目标（任务目标 L2）：相位、陈述、阻塞原因。',
  '',
  '什么时候用：想知道"这张卡还要不要继续跑"、或确认它是否已收口时。',
  '',
  TWO_LAYER_NOTE,
  '',
  DRIVER_NOTE,
  '',
  TASK_GOAL_BOUNDARIES,
].join('\n')

/** `reqboard_task_goal_create`：开工建任务目标。 */
export const TASK_GOAL_CREATE_PROMPT = [
  '为一张**任务卡**创建目标（任务目标 L2）——开工前的第一步。',
  '',
  '什么时候用：领到卡、准备开工时。`objective` 缺省取该卡 `acceptance`',
  '（判据复用，**不要另编一份验收标准**）。',
  '',
  TWO_LAYER_NOTE,
  '',
  DRIVER_NOTE,
  '',
  TASK_GOAL_BOUNDARIES,
].join('\n')

/** `reqboard_task_goal_update`：任务目标相位迁移。 */
export const TASK_GOAL_UPDATE_PROMPT = [
  '更新**任务卡**目标的相位：`pause`（被中断）/ `resume`（继续）/ `block`（等上游或等人裁）/ `complete`（做完了）。',
  '',
  '什么时候用：',
  '- 卡被中断：`pause`（附原因）；恢复：`resume`；等上游/等人裁：`block`（原因必填）；',
  '- 卡做完：`complete`。',
  '',
  '授权：`resume` 需要**人显式继续**（与 core 的 `arm-explicit` 同纪律）——',
  'agent 自行 resume 会被拒并指路看板「继续」；`pause`/`block`/`complete` 允许 agent 发起。',
  '',
  TWO_LAYER_NOTE,
  '',
  DRIVER_NOTE,
  '',
  TASK_GOAL_BOUNDARIES,
].join('\n')

/** `reqboard_stage_goal_get`：只读阶段目标表。 */
export const STAGE_GOAL_GET_PROMPT = [
  '读本需求的**阶段目标表**（阶段目标 L1）：每主阶段的陈述、达成判据与达成位，以及是否已具备收口条件。',
  '',
  '什么时候用：确认"这个阶段成没成""项目能不能收口"时（表按创建→归档的顺序给）。',
  '',
  TWO_LAYER_NOTE,
  '',
  STAGE_SEQUENCE_NOTE,
  '',
  STAGE_GOAL_BOUNDARIES,
].join('\n')

/** `reqboard_stage_goal_create`：登记阶段目标表。 */
export const STAGE_GOAL_CREATE_PROMPT = [
  '登记/替换本需求的**阶段目标表**（阶段目标 L1）：每主阶段一条（stage + statement + doneCriteria）。',
  '',
  '什么时候用：**立项（创建=draft）之后随时可登记**，越早越好；常见时机是设计定稿、进实施前。',
  '把"每个阶段要达成什么"落到台账：通常一次给全序列（从 draft 起），或只登记要跟踪的阶段。',
  '整体替换语义（同 stage 不重复、statement 非空、stage 必须是合法阶段键；空数组 = 清空）。',
  '',
  TWO_LAYER_NOTE,
  '',
  STAGE_SEQUENCE_NOTE,
  '',
  STAGE_GOAL_BOUNDARIES,
].join('\n')

/** `reqboard_stage_goal_done`：落章达成位（真人专属）。 */
export const STAGE_GOAL_DONE_PROMPT = [
  '把某个**阶段目标**的达成位落章（pending → done）。',
  '',
  '什么时候用：该阶段的达成判据经人核过之后（阶段键取自已登记的阶段表）。',
  '**授权：真人专属**——agent 不能自行把阶段判成"成了"（D-4：agent 提议、人落章）；',
  'agent 调用会被拒。全部阶段落章 ⇒ 需求具备收口条件（仍须走 `reqboard_move` 的人工门）。',
  '',
  TWO_LAYER_NOTE,
  '',
  STAGE_GOAL_BOUNDARIES,
].join('\n')
