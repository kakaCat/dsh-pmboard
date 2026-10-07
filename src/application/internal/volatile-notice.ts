/**
 * 易变段组装（REQ-261007100513-6749 t2 ← design/architecture.md §头部/尾部分层判据、
 * design/backend.md §S-1）。
 *
 * **为什么需要本模块**：实测 system prompt 头部因阶段/任务切换被重写 16 个版本，每次重写都让
 * 整段前缀缓存作废（一次 3.9M token 全价未命中）。故把「每次阶段推进/任务切换就变」的内容
 * （看板状态行 / 当前任务执行块 / 阶段纪律正文 / 待捕获提示）从头部拆出来：头部只留
 * **绑定关系 + 常量块**（逐字节稳定），易变内容走尾部通道投递（t3 落地）。
 *
 * **本模块的硬约束：纯函数、无 I/O**——不碰 fs / 端口 / ctx / 时钟；去抖窗口的"现在"由调用方传入。
 * 文案**逐字搬自** `capture-section.ts`（改造前的 boundSectionText 看板状态行 / 当前任务块，
 * 以及 capturePromptForMessage 的待捕获提示）——**不改写文案**：这些字面量是给 LLM 的过程纪律，
 * 改写等于改门禁。阶段纪律那一类的**正文**由取词入口产出（`resolveStagePrompt`），由调用方经
 * `stageText` 传入（取词要用需求实质与声明难度选档，还要拿 `resolved` 做注入留痕——留在同步缝更省）。
 *
 * @module dsh-pmboard/application/internal/volatile-notice
 */

import { PM_BADGE_PREFIX } from '../../domain/text/pm-badge.js'
import { LIMITS } from '../../domain/limits.js'
import type { TaskRecord } from '../../shared/protocol.js'
import { isImplementing, isInProgressTask } from '../../domain/status/Predicates.js'
import type { RequirementFacts } from '../../domain/requirement/RequirementSummary.js'

/**
 * 待捕获消息登记（确定性消息 hook 写入、capture section 消费的瞬态信号）。
 * 不进台账——它是「用户消息刚到达、窗口需要走立项评估」的一次性触发信号，
 * turn/end 后由 hook 清除（消费完毕）。
 *
 * 本接口原先定义在 `capture-section.ts`（t2 随易变段一并搬入），原处 `export type` 转出，
 * 既有 import 点（`application/dive/session-driver.ts`、测试）逐字不变。
 */
export interface PendingCaptureMessage {
  windowKey: string
  /** 清洗后的用户消息文本（供注入引用；纯系统块/噪声消息不会登记）。 */
  text: string
  capturedAt: number
}

/**
 * 易变段分类（design/architecture.md §数据结构变更 → `VolatileNoticeKind`）。
 * 分类键同时是**去重与去抖的粒度**：不同类各自独立（状态行 vs 任务块不互相吞）。
 */
export type VolatileNoticeKind = 'status' | 'stage' | 'task' | 'capture'

/** 一条易变段正文（`text` 可为多行；kind 只用于去重/去抖与留痕分类，不参与正文渲染）。 */
export interface VolatileNotice {
  readonly kind: VolatileNoticeKind
  readonly text: string
}

/**
 * 同一窗口的同一类，去抖期间的待决记录（供 `pickDebounced` 在窗口内"最后一次胜出"）。
 *
 * `since` = 窗口起点（**不因覆盖而刷新**，否则窗口永不到期 = 永不投递）；
 * `updatedAt` = 最近一次被覆盖的时刻（排障用）。
 */
export interface PendingVolatileNotice {
  readonly notice: VolatileNotice
  readonly since: number
  readonly updatedAt: number
}

/**
 * 组装易变段的输入（全部是**同步可得**的投影：本段服务于 system prompt 的 `text` 回调，
 * 不能 await——见 `capture-section.ts` 里 `boundSectionText` 的同步约束注释）。
 */
export interface VolatileNoticeInput {
  /** 本窗口键（正文取前 16 位展示；undefined = 判不出窗口 → 不产任何易变段）。 */
  readonly windowKey: string | undefined
  /** 本窗口**进行中**需求的窄投影（= `openPromptFactsFor(...)` 的结果）。 */
  readonly open: readonly RequirementFacts[]
  /**
   * 队列任务快照（REQ-260927202051-f6df）。**三态**（Lead D17 硬要求）：
   *   - `undefined` = 任务**尚未加载**（缓存首帧）→ 略过"当前任务"块，**不**断言"没有任务"；
   *   - `[]` = 已加载且该需求确无在制任务（同样略过，不产生错误文字）；
   *   - 非空 = 正常渲染。
   */
  readonly tasks?: readonly TaskRecord[] | undefined
  /** 本窗口待捕获候选（hook 登记；仅未绑定窗口消费）。 */
  readonly pending?: PendingCaptureMessage | undefined
  /**
   * **已解析**的阶段纪律正文（kind='stage' 的正文）。
   *
   * 为什么取词不在这里做：取词要用 `difficultyFromDeclaredPrompt` 按需求实质/声明难度选档
   * （FR-16 / REQ-261005154851-8512 FR-2），且解析结果 `resolved` 还要做 INV-6 注入留痕——
   * 两件事都离不开 `resolved`，故取词留在同步缝那一侧（`capture-section.ts` 的
   * `resolveStageNotice`），本模块只负责"这段正文属于易变段的哪一类"。
   * 缺省 = 未命中/被分类档案跳过 → 不产 stage 段。
   */
  readonly stageText?: string | undefined
}

/**
 * 易变段的规范顺序（与改造前正文顺序一致：状态行 → 当前任务块 → 阶段纪律 → 待捕获提示，后者只在
 * 未绑定窗口）。改这个顺序 = 改 LLM 读到的正文 → 需要走需求变更。
 */
export const VOLATILE_NOTICE_ORDER: readonly VolatileNoticeKind[] = ['status', 'task', 'stage', 'capture']

/**
 * 去抖窗口（毫秒）——**单一落点**已移到 `LIMITS.noticeDebounceMs`（`domain/limits.ts`，t3 落地）。
 * 它只是**会翻版**的那两类（task / status）的窗口；按 kind 的完整窗口表（capture / stage = 0 = 立即投）
 * 在 `notice-delivery.ts` 的 `DEBOUNCE_MS_BY_KIND`。此处只引用该数值：两处各写一份 = 静默漂移（INV-2）。
 */
export const VOLATILE_NOTICE_DEBOUNCE_MS = LIMITS.noticeDebounceMs

/**
 * 「无在制任务」的**补投**正文（t3 ← architecture.md §去重与去抖「空态不单独投递」；
 * 2026-10-08 复核 P2-5 加**阶段判据**）。
 *
 * 空态时 `buildVolatileNotice(input,'task')` 恒为 `undefined`（三态契约：未加载 / 已加载为空都
 * **略过**该块）——空态零信息量，把它当一次状态变化投递正是「13,338 ↔ 13,897 来回翻版」的根因。
 * 只有空态**久留**（`LIMITS.noticeEmptySettleMs`）且期间无新任务、无阶段变化时，才补投一次。
 *
 * **为什么必须带阶段**：只有 `implementing` 才谈得上「在制任务」（其余阶段本就没有任务块可谈，
 * 补投「等下一张卡开工」= 与阶段不符的话）。判据走 domain 单点 `isImplementing`，不写状态字面量。
 */
export function emptyTaskNoticeText(status: string): string | undefined {
  if (!isImplementing({ status })) return undefined
  return ['## 【当前任务执行中】', '', '（当前无在制任务：上一张卡已收尾，等下一张卡开工）'].join('\n')
}

/**
 * 组装**单类**易变段：该窗口该类无内容 → `undefined`（不产空段，也不产生错误文字）。
 * 纯函数：同一 (input, kind) 必得同一 text（无时间、无随机、无 I/O）。
 */
export function buildVolatileNotice(
  input: VolatileNoticeInput,
  kind: VolatileNoticeKind,
): VolatileNotice | undefined {
  const { windowKey, open } = input
  if (windowKey === undefined) return undefined

  switch (kind) {
    // ── 看板状态行：每次阶段推进就变（5 次左右），留在头部就是 5 次全量重算 —— 故入易变 ──
    case 'status': {
      if (open.length === 0) return undefined
      // 只带 id + 状态：标题已由**头部**的需求清单给出，这里再列一次＝同一行信息出现两遍（评审 P2-3），
      // 还会把状态行推到清单后约 2.2K 字符处。回落路径的拼装保证状态行**紧跟需求清单**（常量块在末位）。
      return { kind, text: open.map(r => `- ${r.id} 当前状态：${r.status}`).join('\n') }
    }

    // ── 当前任务执行块：每次任务切换就变（≤300 tok）──
    case 'task': {
      if (open.length === 0) return undefined
      const taskText = taskBlockText(open, input.tasks)
      return taskText === undefined ? undefined : { kind, text: taskText }
    }

    // ── 阶段纪律正文：每次阶段切换就变（≈3.3K tok）——16 个版本的主要来源 ──
    case 'stage': {
      if (open.length === 0) return undefined
      const text = input.stageText
      if (text === undefined || text.length === 0) return undefined
      return { kind, text }
    }

    // ── 待捕获提示（含用户消息节选）：每条用户消息就变（≈700 tok），且只在**未绑定**窗口出现 ──
    case 'capture': {
      if (open.length > 0) return undefined
      const pending = input.pending
      if (pending === undefined) return undefined
      if (pending.windowKey !== windowKey) return undefined
      if (pending.text.trim().length === 0) return undefined // 不注入空引用
      return { kind, text: capturePromptForMessage(windowKey, pending.text) }
    }

    default:
      // 受控枚举的兜底：新增 kind 时先补进 `VOLATILE_NOTICE_ORDER`（那里是 `readonly
      // VolatileNoticeKind[]`，漏掉会在编译期被 `satisfies` 式的赋值检查拦住）与上面的分支。
      return undefined
  }
}

/**
 * 组装该窗口的**全部**易变段（规范顺序 `VOLATILE_NOTICE_ORDER`，无内容者不出现）。
 *
 * 供 t3 的投递编排与测试使用；`capture-section.ts` 的回落路径不调它——它需要 `resolved`
 * 做 INV-6 留痕，而解析（取词）在那一侧完成，再解析一次是重复劳动。
 */
export function buildVolatileNotices(input: VolatileNoticeInput): VolatileNotice[] {
  const notices: VolatileNotice[] = []
  for (const kind of VOLATILE_NOTICE_ORDER) {
    const notice = buildVolatileNotice(input, kind)
    if (notice !== undefined) notices.push(notice)
  }
  return notices
}

/**
 * 「当前任务执行中」块（逐字搬自改造前 `boundSectionText` 内的同名块）。
 *
 * 三态契约（Lead D17 硬要求）：`tasks === undefined` = 队列任务**尚未加载**（缓存首帧）→
 * **整体略过**本块。绝不能把它当成"当前没有任务"来渲染 —— 那是**错误断言**（未加载 ≠ 已加载且为空）。
 * `[]` = 已加载且确无任务（略过即可，同样不产生错误文字）。
 */
function taskBlockText(
  open: readonly RequirementFacts[],
  tasks: readonly TaskRecord[] | undefined,
): string | undefined {
  const implementingReq = open.find(isImplementing)
  if (implementingReq === undefined || tasks === undefined) return undefined
  const inProgressTasks = tasks.filter(
    t => t.requirementId === implementingReq.id && isInProgressTask(t)
  )
  if (inProgressTasks.length === 0) return undefined

  const task = inProgressTasks[0]!
  const lines: string[] = []
  lines.push('## 【当前任务执行中】')
  lines.push('')
  lines.push(`任务：${task.title}`)
  lines.push('')
  lines.push('**任务说明**：')
  lines.push(task.description || '（无）')
  lines.push('')
  lines.push('**需求背景**：')
  lines.push(task.context || '（无）')
  lines.push('')
  lines.push('**验收标准**：')
  lines.push(task.acceptance || '（无）')
  lines.push('')
  lines.push(`**阶段**：${task.phase} | **端侧**：${task.side}`)
  lines.push('')
  lines.push('---')
  // 卡片层契约（2026-09-28）：合法边由**卡片角色**决定——父卡（有子卡）与子卡只有
  // todo→in_progress→done（TaskStatus 的 PARENT_/SUBTASK_TRANSITIONS 对 integrating/
  // testing/in_review 无出边），照旧文案推进必吃 invalid_transition；只有存量卡走五段。
  const hasKids = (tasks ?? []).some(t => t.parentId === task.id)
  const isSubtask = task.parentId !== undefined
  lines.push('请按照任务说明执行。完成后推进任务状态：')
  if (hasKids || isSubtask) {
    lines.push(`- 完成 → reqboard_task_move({ task_id: '${task.id}', to: 'done', reason: '...' })`)
    lines.push('  （本卡是父卡/子卡：合法边只有 todo → in_progress → done；联调/复核/测试由子卡链各阶段承载）')
  } else {
    lines.push(`- 开发完成 → reqboard_task_move({ task_id: '${task.id}', to: 'integrating', reason: '...' })`)
    lines.push(`- 联调完成 → reqboard_task_move({ task_id: '${task.id}', to: 'testing', reason: '...' })`)
    lines.push(`- 测试通过 → reqboard_task_move({ task_id: '${task.id}', to: 'in_review', reason: '...' })`)
    lines.push('  （本卡是存量卡：无子卡链，走五段状态机）')
  }
  lines.push('')
  lines.push('查看所有任务：reqboard_status()')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 去重与去抖（design/architecture.md §去重与去抖 / FR-3）
// ---------------------------------------------------------------------------

/**
 * 易变段内容哈希（**规范化后**取值，供去重）。
 *
 * 为什么去重按**内容哈希**而不是时间窗：时间窗会吞掉真实变化——纪律丢失比多投一次严重。
 * 为什么先规范化：同一份内容的不同排版（CRLF / 行尾空格 / 首尾空行）不得各算一份哈希，否则去重
 * 形同虚设（每轮都判"变了"）。
 *
 * 缺省摘要 = FNV-1a 32 位（纯函数、无 node: 依赖）——**32 位会碰撞**，碰撞 = 静默吞一段纪律，故
 * 组合根经 `digest` 注入 **sha1**（node:crypto 只能在 host 侧；见 notice-delivery 的 `hashOf`）。
 */
export function noticeHash(text: string, digest?: (canonical: string) => string): string {
  const normalized = normalizeNoticeText(text)
  if (digest !== undefined) return digest(normalized)
  let hash = 0x811c9dc5
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 规范化正文（**唯一一份**：换行 / 行尾空白 / 首尾空行归一）——注入的摘要只在它之上算。 */
export function normalizeNoticeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n').trim()
}

/**
 * 该待决记录的去抖窗口是否已到期（`now - since >= debounceMs`）。
 *
 * `debounceMs <= 0` → 恒到期（= 不去抖，逐次投递）——这是**显式关闭去抖**的开关，
 * 不要把它当成"窗口为零所以永不投递"。
 */
export function isDebounceWindowExpired(
  pending: PendingVolatileNotice,
  now: number,
  debounceMs: number,
): boolean {
  if (debounceMs <= 0) return true
  return now - pending.since >= debounceMs
}

/**
 * 按 kind 分槽的去抖待决表（**每个 kind 一个槽**）：窗口起点 `since` 存在槽里，故交替出现的两类
 * （状态行 ↔ 任务块，正是实测翻版的那一对）不会互相重置对方窗口——这条由**类型**兜住
 * （`pickDebounced` 只可能写 incoming.kind 那一个槽）。
 */
export type PendingNoticeSlots = ReadonlyMap<VolatileNoticeKind, PendingVolatileNotice>

/**
 * 分槽去抖：**窗口内最后一次胜出**（architecture.md §去重与去抖；FR-3 / t3 验收 ⑥）。
 *
 * 只作用于 `incoming.kind` 那个槽（其余槽逐字保留）：该槽无待决 / 窗口已到期 → 以 incoming
 * **重开窗口**（`since = now`）；同槽且窗口未到期 → 覆盖正文（`since` 保持窗口起点，`updatedAt`
 * 刷新）。`since` 不随覆盖刷新：否则每次覆盖都重开窗口 → 连续变化时永不到期 → **永不投递**。纯函数：
 * `now` 由调用方传入；返回新表（不改入参）；到期时刻 = `since + debounceMs`（编排据此排定时器）。
 */
export function pickDebounced(
  slots: PendingNoticeSlots,
  incoming: VolatileNotice,
  now: number,
  debounceMs: number,
): PendingNoticeSlots {
  const pending = slots.get(incoming.kind)
  const next = new Map(slots)
  if (pending === undefined || isDebounceWindowExpired(pending, now, debounceMs)) {
    next.set(incoming.kind, { notice: incoming, since: now, updatedAt: now })
    return next
  }
  next.set(incoming.kind, { notice: incoming, since: pending.since, updatedAt: now })
  return next
}

// ---------------------------------------------------------------------------
// 待捕获提示（未绑定窗口的易变段；逐字搬自 capture-section.ts）
// ---------------------------------------------------------------------------

/**
 * 针对性立项提示（消息事件 hook 命中时注入）：引用刚到达的用户消息原文，
 * 指示 LLM 判断该输入是否值得立项——值得则【调 reqboard_capture（pm 专有立项弹框）
 * 一次完成「立项三问 + 创建 + 绑定」】：三问为「需求名称」（候选由本条消息上下文
 * 推导、最贴切一项置首推荐、允许自定义输入）「需求类型」（feature/bug/doc/refactor/
 * spike/chore）「提示词难度」（simple/standard/advanced/expert）；**用户作答即立项确认**，
 * 工具在同一次调用内创建 REQ 并绑定本窗口（创建即立项，无待归类/建议卡中间态，看板
 * 立即可见）。
 *
 * **措辞已硬化（2026-09-20 t-3e11bf E2E 走查后的返工）**：走查实测（窗口 session-361c2879，
 * 15:23–15:30 四个回合）——hook 登记、pending 命中、本段注入**全部正常**，但窗口内 35 次
 * PTC 子调用只有 read/grep，**零次 reqboard_capture**；其中"修复 FR-6 任务状态机"这种
 * 明确工作意图也被模型判成"对当前审查的追问"而跳过。根因：原文案是"请先判断**可能**包含
 * 值得立项的意图 / 只是闲聊则正常回复"——二元裁量 + 零后果，模型默认选"先答问题"。
 * 故改为：①必须显式裁定（判不准按值得立项处理）②值得立项时**本回合第一个工具调用**即
 * reqboard_capture ③不立项时必须在回复首行写明理由（把沉默变成可审计表态）。
 * 判定仍留给 LLM（窗口 agent 自身回合），hook 只保证确定性触发。全部字面量。
 *
 * （t2：本函数从 `capture-section.ts` **逐字**搬入本模块——它属易变段（每条用户消息一变），
 * `capture-section.ts` 保留同名 `export` 转出，既有 import 点不变。）
 */
export function capturePromptForMessage(windowKey: string, text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  const snippet = trimmed.slice(0, 300)
  return [
    `${PM_BADGE_PREFIX}项目捕获（reqboard · 本窗口 ${windowKey.slice(0, 16)} 检测到用户新输入）`,
    '',
    '用户刚发来一条消息。**本回合你必须先做一次显式裁定、再回答用户**——沉默跳过等于',
    '本回合未完成（会被留痕，走查时按失败计）。',
    '',
    '**第一步：判断消息类型**',
    '',
    'A. **直接执行**——用户已给出精确修改值 + 执行指令，如：',
    '   - "改成 500"、"设为 200"、"提高到 1000"',
    '   - "修改"、"执行"、"apply"、"直接改"',
    '   - 改动范围单一明确（一个文件/一个配置项）',
    '   → **立即执行 edit/write，不弹框、不立项**',
    '',
    'B. **值得立项**——用户提出新工作意图，但未给出精确值，如：',
    '   - "帮我做个功能"、"修复这个 bug"、"重构某模块"',
    '   - 需要拆解的复杂需求、需要追踪的改动',
    '   → **本回合第一个工具调用必须是 reqboard_capture**',
    '',
    'C. **不立项**——纯提问、咨询、闲聊，如：',
    '   - "dsh 支持吗"、"进度如何"、"谢谢"',
    '   → **回复第一行写明「本条不立项：<理由>」**',
    '',
    '**第二步：执行对应动作**',
    '',
    'A. 直接执行时：',
    '   - 立即调 edit/write 修改代码',
    '   - 回复用户执行结果',
    '   - 绝对禁止调 reqboard_capture（这不是立项，是干活）',
    '',
    'B. 值得立项时：',
    '   - 本回合第一个工具调用必须是 reqboard_capture',
    '   - 问题一「需求名称」：候选标题经 title_options 传入（最多 3 个），最贴切的置首',
    '   - 问题二「需求类型」：feature / bug / doc / refactor / spike / chore',
    '   - 问题三「提示词难度」：simple / standard / advanced / expert',
    '   - 用户作答后同一次调用内创建并绑定本窗口',
    '',
    'C. 不立项时：',
    '   - 回复第一行写明「本条不立项：<一句话理由>」',
    '   - 然后正常回答用户',
    '',
    '**绝对禁止（违反 = 逻辑错误）**：',
    '- 写了「本条不立项」后又调 reqboard_capture',
    '- 调了 reqboard_capture 又写「本条不立项」',
    '- 用户已给出精确值仍弹框立项',
    '',
    '本次待裁定的用户消息（节选，最多 300 字）：',
    '',
    `> ${snippet}${trimmed.length > 300 ? '…' : ''}`,
  ].join('\n')
}
