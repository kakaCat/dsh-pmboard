/**
 * 捕获引导段文本组装（REQ-47939a t9 ← host/capture.ts）——systemPrompt 组装处按窗口条件取文本。
 *
 * 为什么在 application：这些函数是**纯文本编排**（给 LLM 看的过程纪律与立项引导文案），
 * 只读台账视图 + 窗口投影，无 I/O、无 ctx、不碰 fs。规则（窗口绑定/pending 判定）在
 * application/internal/window.ts，阶段提示词常量在 domain/stage/StagePromptSpec.ts。
 *
 * 搬迁口径（t9）：文本逐字保持（含全部中文字面量），既有 capture.test.ts /
 * stage-prompts.test.ts / acceptance-criteria.test.ts 的断言语义不变，仅 import 路径改到本模块。
 *
 * ── 头部/尾部分层（REQ-261007100513-6749 t2 ← design/architecture.md §头部/尾部分层判据）──
 *
 * 分界线 = "这一段会不会因为阶段/任务切换而变化"：
 *   · **头部**（`headSectionTextFrom`）：需求清单（id + 标题）+ 常量块 / 未绑定静态引导——逐字节稳定。
 *   · **易变**（`volatileSectionTextFrom`）：状态行 / 任务块 / 阶段纪律 / 待捕获提示，组装与分类在
 *     `internal/volatile-notice.ts`（纯函数、无 I/O），由尾部通道投递（t3 落地）。
 * 回落口径：通道未装配/抛错 = 不可用 → `fallbackSectionTextFrom` 整段（清单 + 易变 + 常量块；
 * 未绑定窗口 = 引导与命中提示二选一），与改造前会话内容等价；通道可用时才"只回头部"。
 *
 * @module dsh-pmboard/application/internal/capture-section
 */

import { PM_BADGE_PREFIX } from '../../domain/text/pm-badge.js'
import type { ReqboardLedger, TaskRecord } from '../../shared/protocol.js'
import { stageEnabledFor } from '../../shared/protocol.js'
import { captureDiag } from './diag-log.js'
import {
  injectionLogInputFromResolved,
  type InjectionLogPort,
} from './injection-log.js'
import { factsOf, type RequirementFacts } from '../../domain/requirement/RequirementSummary.js'
import type { StageKey } from '../../domain/requirement/RequirementStatus.js'
import { resolveStagePrompt, isPromptStage, type ResolvedPrompt } from '../../domain/prompt/index.js'
import { difficultyFromDeclaredPrompt } from '../../domain/prompt/difficulty-mapping.js'
import {
  windowKeyFromContext,
  isWindowBoundFromFacts,
  openPromptFactsFor,
} from './window.js'
import {
  buildVolatileNotice,
  capturePromptForMessage,
  type PendingCaptureMessage,
  type VolatileNotice,
} from './volatile-notice.js'

// t2：待捕获消息类型与待捕获提示已随易变段搬进 volatile-notice.ts；此处**转出**同名符号，
// 既有 import 点（`application/dive/session-driver.ts`、测试）逐字不变。
export { capturePromptForMessage }
export type { PendingCaptureMessage }

/**
 * 该窗口的捕获引导 section 文本（乙：提示 agent 识别新工作 → 调 reqboard_capture
 * 弹立项三问（名称/类型/难度）并在同一次调用内创建即立项）。bound / 已有遗留 pending / 无法取 windowKey →
 * 返回 ''（零噪音）。永不返回 undefined。
 *
 * 第三参 pending 为确定性消息 hook 登记的本窗口「待捕获候选」：命中时返回
 * 引用该用户消息原文的针对性立项提示（用户裁定：消息到达 → hook 检查窗口是否
 * 需要立项捕获 → 注入提示词让 LLM 调 reqboard_capture 弹三问 → 直接建 REQ），未命中维持静态引导。
 * 向后兼容：不传 pending 时行为与旧版完全一致（capture.test.ts 三分支不变）。
 *
 * t2 起本函数是**兼容壳**：`gate-wiring.ts` 改走 head / fallback 两段（见同名函数）；本壳只为
 * 既有测试保留，勿改其分支语义（尤其未绑定时"命中提示替换静态引导"）。
 */
export function captureSectionText(
  ledger: ReqboardLedger,
  context: unknown,
  pending?: PendingCaptureMessage | undefined,
): string {
  return captureSectionTextFrom(ledger.requirements.map(factsOf), context, pending)
}

/**
 * 同一段的**窄投影实现**（B12 阶段①-a）：吃 `RequirementFacts[]` 而不是整册 `ReqboardLedger`。
 *
 * 为什么要这一步：这一段服务于 `systemPrompt.section` 的 `text` 回调——**同步**、
 * 每回合执行、且过期不致命（端口注释已划定许可区）。旧路径要 `deps.store.snapshot`（同步整册镜像，
 * 正是本需求要消灭的形态），而它实际只读 `status` 与 `sourceSessionId`。
 * ⇒ 改由 `RequirementStore.peekFacts()` 供数，同步缝不再依赖桥。
 *
 * 与 `captureSectionText(ledger, …)` 的关系：后者是**投影壳**（把整册投影成窄投影再调本函数），
 * 只为尚未搬迁的调用方（测试）保留，随 B12 删桥一并删除。
 */
export function captureSectionTextFrom(
  facts: readonly RequirementFacts[],
  context: unknown,
  pending?: PendingCaptureMessage | undefined,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (!windowKey) {
    // 【诊断日志-节点5】返回空串原因：windowKey undefined
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns '' (reason: windowKey=undefined)`);
    return '';
  }
  if (isWindowBoundFromFacts(facts, windowKey)) {
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns '' (reason: windowBound=true, windowKey=${windowKey.slice(0, 16)})`);
    return '';
  }
  if (pending && pending.windowKey === windowKey && pending.text.trim().length > 0) {
    const promptText = capturePromptForMessage(windowKey, pending.text);
    // 【诊断日志-节点5】返回动态提示词
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns DYNAMIC PROMPT (windowKey=${windowKey.slice(0, 16)}, text.length=${promptText.length}, pending.text.length=${pending.text.length})`);
    return promptText;
  }
  const guidanceText = captureGuidanceText(windowKey);
  captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns STATIC GUIDANCE (windowKey=${windowKey.slice(0, 16)}, text.length=${guidanceText.length})`);
  return guidanceText;
}

/**
 * 头部常量块（流水线纪律 / 归档规范）：**从不变化**（判据表：变化频率 = 从不），故属头部；
 * 逐字搬自改造前末尾的 `lines.push(...)` 尾块，一个字没改。
 */
const BOUND_CONSTANT_BLOCKS: readonly string[] = [
  '流水线（状态就是阶段，从立项一路走到交付）：',
  '- draft 立项 → brainstorming 需求分析（探边界/方案）→ design 设计（只写设计文档）→',
  '  decomposing 拆分（写拆分计划 → 人批准 → 落库任务 DAG）→ implementing 执行 → accepting 验收 → done 完成；',
  '- 方案谈定 → reqboard_move 到 design（设计属于这个阶段）；',
  '',
  '设计阶段（2026-09-21 用户裁定：只写设计文档，不写计划）：',
  '- 把设计写进 docs/requirements/<REQ>/design/ 目录（按类型模板：架构/接口/数据模型等）；',
  '- 写完先调 reqboard_submit(kind=design) 登记设计文档（缺省扫全目录，也可指定单份 path）；',
  '- 由你发起确认：**先看登记回执**——若它已写明「已有一道门在等 / 已自动触发确认弹框」，'
    + '就**不要再调 reqboard_ask_confirm**（那会开出第二个框）；改为读确认态或取回执'
    + '（reqboard_status / reqboard_confirm_receipt）。确认后自动进入拆分；',
  '',
  '拆分阶段（拆分计划在这里写 · 唯一需要人点头的地方）：',
  '- 把设计落成拆分计划 → reqboard_submit(kind=plan)（path = docs/requirements/<REQ>/decomposition.md，',
  '  summary = 一段人能读懂的目标+做法，tasks = 将来要落库的任务表：',
  '  key/title/phase/side/depends_on/acceptance，粒度与依赖在这里定死）；',
  '- 提交后**先看回执**：已写明「已有一道门在等 / 已自动触发批准弹框」时**不要重复发起**'
    + '（reqboard_ask_confirm 会复用同一道门，但没必要再发一次）；只有回执说没弹框时才调一次；',
  '  ——未批准时 reqboard_decompose 被代码级拒绝（看板「批准计划」同样有效）；',
  '- 批准后自动落库任务卡并进入实施（不传 tasks = 直接落库批准的计划；',
  '  传了 tasks 则必须与计划 key 一致，防止「批了 A 落库 B」）；',
  '- 计划要改 → 重新 reqboard_submit(kind=plan)（旧批准自动作废，需重新批准）。',
  '',
  '状态推进纪律（计划批准之后，其余都由窗口自己维护，不需要用户手动点按钮）：',
  '- 方案敲定 → reqboard_decompose 把需求拆成任务 DAG 落库（真拆分：写台账任务卡，',
  '  看板「任务」页与甘特图据此渲染；depends_on 用批次内 key 引用同批任务）；',
  '- 拆分后需求会自动进入拆分态；任务开工/完成用 reqboard_task_move 推进',
  '  （父卡/子卡：todo → in_progress → done；存量卡：todo → in_progress → testing → in_review → done；',
  '  开工时会自动记一段执行时间）；',
  '- 任务全部 done 时系统自动把需求推进到 accepting（验收）；交付并自检通过后',
  '  用 reqboard_move 自行推进到 done。',
  '- 只有「取消需求/归档/取消任务」必须人操作（agent 调用会被代码级拒绝）。',
  '- 推进时用 reason 写清做了什么（进需求留痕，供复盘与验收）。',
  '',
  '验收阶段（人工审核，agent 不自己判过）：',
  '- 交付完成 → reqboard_submit(kind=verification) 提交验收材料',
  '  （summary = 交付结论；evidence = 可复核证据：命令+输出摘要/报告路径/截图路径）；',
  '- 提交后需求进入 accepting 态，等待人工逐项验收（看板验收单页面）；',
  '- 验收通过 → 准备归档材料；被退回 → 按人的意见返工后重新提交验收。',
  '',
  '归档阶段（先提交材料，人工归档）：',
  '- 验收通过后 → reqboard_submit(kind=archive) 提交归档材料',
  '  （需求目录、目录内文档清单、合并去向 merged_into、一句话索引条目）；',
  '- 提交后在看板归档页面等待人工最终归档确认。',
  '- 合并去向与必填文档按需求类型限定（feature→architecture/guides，bug→known-issues，',
  '  spike→research，refactor→architecture/work-logs，chore→work-logs），规范见',
  '  agent-dh/docs/architecture/requirement-archive.md；缺项会被代码级拒绝；',
  '- 归档材料里写了的合并去向，必须真的把那部分结论写进对应的项目文档；',
  '- 金字塔生长：feature/refactor/spike 必须在材料里申报 manual_updates（更新了哪份文档的哪一节、',
  '  多了什么认知），说明书是 docs/architecture/project-manual.md；bug/doc/chore 写 manual_note 说明即可；',
  '- docs 按 wiki 维护：新页面要有 front-matter 并挂进首页/上层页，未写的主题进首页「待写页」；',
  '  收工前可跑 python3 agent-dh/scripts/wiki_probe.py 自检死链/孤儿页。',
]

/**
 * **头部**（design/backend.md §S-1：返回值只由窗口绑定关系决定）：未绑定 → 静态引导；已绑定 →
 * 需求 id + 标题 + 常量块；判不出 windowKey → ''。状态/任务/阶段纪律/待捕获提示一律不在这里
 * （它们就是头部被重写 16 个版本的来源）；本函数对同一绑定关系必须**逐字节稳定**。
 */
export function headSectionTextFrom(
  facts: readonly RequirementFacts[],
  context: unknown,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) {
    captureDiag(`reqboard-capture [NODE-5]: headSectionText returns '' (reason: windowKey=undefined)`);
    return ''
  }
  const open = openPromptFactsFor(facts, windowKey)
  if (open.length === 0) {
    // 未绑定窗口：头部 = 静态引导（design 判据表「未绑定引导文案（静态版）→ 头部」，每会话 0–1 次）。
    const guidance = captureGuidanceText(windowKey)
    captureDiag(`reqboard-capture [NODE-5]: headSectionText returns STATIC GUIDANCE (head, windowKey=${windowKey.slice(0, 16)}, text.length=${guidance.length})`);
    return guidance
  }
  captureDiag(`reqboard-capture [NODE-5]: headSectionText returns BOUND HEAD (binding + constants, windowKey=${windowKey.slice(0, 16)}, open=${open.length})`);
  return boundHeadText(open, windowKey)
}

/** 需求清单（绑定关系，**不含状态**——状态是易变段）；《》包裹逐字保留。 */
function boundPrefixText(open: readonly RequirementFacts[], windowKey: string): string {
  return [
    `${PM_BADGE_PREFIX}项目看板（reqboard · 本窗口 ${windowKey.slice(0, 16)} 已绑定需求）`,
    '',
    '本窗口名下有进行中的需求：',
    ...open.map(r => `- ${r.id}《${r.title}》`),
  ].join('\n')
}

/** 常量块：从不变化，故属头部；回落路径里它排在**末位**（改造前的位置）。 */
function boundConstantText(): string {
  return BOUND_CONSTANT_BLOCKS.join('\n')
}

/** 已绑定窗口的**稳定头部**（清单 + 常量块）——尾部通道可用时进会话的就是这一份。 */
function boundHeadText(open: readonly RequirementFacts[], windowKey: string): string {
  return [boundPrefixText(open, windowKey), '', boundConstantText()].join('\n')
}

/**
 * 阶段纪律的**取词**（本模块保留的取词职责，见 `injection-difficulty.test.ts` 的静态接线闸）：返回
 * `resolved` 供 INV-6 留痕，正文交 `volatile-notice.ts` 归入 kind='stage'。跳过的阶段不注入；多个
 * open 需求时取**最近更新**的那条（改造前口径）。
 */
export function resolveStageNotice(
  open: readonly RequirementFacts[],
): { readonly resolved: ResolvedPrompt } | undefined {
  const stageReq = [...open].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (stageReq === undefined) return undefined
  const stage = stageReq.status
  // draft/done/canceled 不是可注入节点（types.ts）：先过闸，避免只捞到 ⑤ 铁律而被当成有提示词。
  if (!isPromptStage(stage) || !stageEnabledFor(stageReq.category, stage as StageKey)) return undefined
  // INV-1：取词唯一入口（分片库 + 回退链 + 预算）；不再直取常量表。
  // FR-16：带上需求实质，让唯一取词入口按它推断难度（动架构 / 跨子系统 / 改数据模型 → heavy），
  // 不再静默回落缺省 light——REQ-c9f899 被注入轻档提示词的根因就在这一行。
  // REQ-261005154851-8512 FR-2：把**声明难度**带上——注入组装是同步缝，读不到台账，
  // 故它必须由 facts 投影带进来（FR-1）。未声明 → 不传该键，回落文本推断（与改造前逐字相同）。
  const declared = difficultyFromDeclaredPrompt(stageReq.promptDifficulty)
  const resolved = resolveStagePrompt({
    stage,
    category: stageReq.category,
    requirement: { title: stageReq.title, description: stageReq.description },
    ...(declared === undefined ? {} : { declaredDifficulty: declared }),
  })
  if (resolved.text.length === 0) return undefined
  return { resolved }
}

/** 易变段组装的附加依赖：纯组装在 volatile-notice.ts，这里只挂留痕口（INV-6）。 */
export interface VolatileSectionOptions {
  /** 本窗口待捕获候选（确定性消息 hook 登记）。 */
  pending?: PendingCaptureMessage | undefined
  /** 注入留痕口：阶段纪律正文确实进了会话 → `origin='system-prompt'` / `delivered=true`。缺省 = 不记。 */
  injectionLog?: InjectionLogPort
}

/**
 * **易变段**正文（分类见 `volatile-notice.ts` 的 `VolatileNoticeKind`）：状态行 → 当前任务块 →
 * 阶段纪律正文 → 待捕获提示，块间空行分隔。未绑定窗口只产"待捕获提示"（未命中 → ''）。
 */
export function volatileSectionTextFrom(
  facts: readonly RequirementFacts[],
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  options: VolatileSectionOptions = {},
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  const open = openPromptFactsFor(facts, windowKey)

  // 阶段纪律的**取词**留在本模块：取词要按需求实质与**声明难度**选档（FR-16 / REQ-261005154851-8512
  // FR-2），`resolved` 还要做 INV-6 留痕。分类与归属（kind='stage'）在 volatile-notice.ts。
  const stage = resolveStageNotice(open)
  const input = { windowKey, open, tasks, pending: options.pending, stageText: stage?.resolved.text }

  // 顺序即正文顺序（VOLATILE_NOTICE_ORDER）。这里不调 buildVolatileNotices()：它拿不到上面那份
  // `resolved`，留痕就得再解析一次。
  const parts: string[] = []
  const push = (notice: VolatileNotice | undefined): void => { if (notice !== undefined) parts.push(notice.text) }
  push(buildVolatileNotice(input, 'status'))
  push(buildVolatileNotice(input, 'task'))
  push(buildVolatileNotice(input, 'stage'))
  if (stage !== undefined) {
    // INV-6：注入即留痕（本次到底注入了什么，可被看板/人核查）。
    // FR-9（t-cc7233）：这一处是**每轮系统提示词的装配**——正文确实进了会话，
    // 故 delivered=true、origin='system-prompt'（设计稿只列了三个写入点，这是实施发现的第四处）。
    //
    // t2 保留这条留痕的原因：通道不可用时本段仍进会话 ⇒ 留痕口径与改造前逐字相同；t3 接入后由投递点记。
    options.injectionLog?.record(injectionLogInputFromResolved(stage.resolved, windowKey, {
      origin: 'system-prompt',
      delivered: true,
    }))
  }
  push(buildVolatileNotice(input, 'capture'))

  captureDiag(`reqboard-capture [NODE-5]: volatileSectionText (windowKey=${windowKey.slice(0, 16)}, blocks=${parts.length}, text.length=${parts.join('\n\n').length})`);
  return parts.join('\n\n')
}

/**
 * 回落路径整段（通道不可用时 `section.text` 的返回值）：
 *   · 未绑定：本回合命中 → **只回针对性命中提示**，未命中 → 静态引导；二者**不同屏**（改造前的替换
 *     语义：叠加会互相稀释，且每条用户消息多约 220 token——评审 P2-1）。
 *   · 已绑定：清单 + 易变段 + 常量块；常量块留**末位**（改造前位置），故状态行紧跟清单（评审 P2-3）。
 */
export function fallbackSectionTextFrom(
  facts: readonly RequirementFacts[],
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  options: VolatileSectionOptions = {},
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  const open = openPromptFactsFor(facts, windowKey)
  const volatile = volatileSectionTextFrom(facts, tasks, context, options)
  if (open.length === 0) return volatile.length > 0 ? volatile : captureGuidanceText(windowKey)
  return joinBlocks([boundPrefixText(open, windowKey), volatile, boundConstantText()])
}

/** 块拼接：非空块之间空一行（与改造前 `lines.push('')` 的观感一致）。 */
function joinBlocks(blocks: readonly string[]): string {
  return blocks.filter(b => b.length > 0).join('\n\n')
}

/**
 * 绑定窗口的「推进纪律」段 —— 本窗口已绑定进行中需求时注入；未绑定 → ''。
 *
 * 为什么需要：此前 bound 窗口的 section 返回 ''（零噪音），窗口 agent 根本不知道
 * 自己名下有需求、更不知道可以推进状态 → 需求建卡后只能等人点按钮（用户反馈
 * 「agent 自己不能推进吗，还需要用户手动推进」）。本段把「状态由窗口自己维护」
 * 变成提示词里的明确纪律，窗口在里程碑处主动调 reqboard_move。
 *
 * @param tasks 队列任务快照（REQ-260927202051-f6df）。**三态**（Lead D17 硬要求）：
 *   - `undefined` = 任务**尚未加载**（缓存首帧）→ 略过"当前任务"块，**不**断言"没有任务"；
 *   - `[]` = 已加载且该需求确无在制任务（同样略过，不产生错误文字）；
 *   - 非空 = 正常渲染。
 *
 * **本函数必须保持同步**：它服务于 system-prompt section 的 `text` provider，而 DSH 的
 * `SectionSpec.text` 类型是 `string | ((context) => string)`（**同步，不能 await**，实测
 * `@deepseek-ai/dsh-system-prompt/lib/types/index.d.ts:60`）。故任务由调用方以**同步可得
 * 的缓存快照**传入（见 `gate-wiring.ts` 里 `taskStore.subscribe` 维护的缓存）。
 */
export function boundSectionText(
  ledger: ReqboardLedger,
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  injectionLog?: InjectionLogPort,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  return boundSectionTextFrom(ledger.requirements.map(factsOf), tasks, context, injectionLog)
}

/**
 * 同一段的**窄投影实现**（B12 阶段①-a）——见 `captureSectionTextFrom` 的说明。
 *
 * 本段比捕获段多要一个字段：`description`（`resolveStagePrompt` 用它推断提示词难度，FR-16）。
 * 这也是"看板摘要（`RequirementSummary`）不能直接拿来用"的原因——见 `RequirementFacts` 的注释。
 *
 * t2 起 = 回落路径整段（见 `fallbackSectionTextFrom`）：清单 + 易变段 + 常量块，内容与改造前等价。
 * 未绑定窗口仍返回 ''（零噪音，既有断言语义不变）。
 */
export function boundSectionTextFrom(
  facts: readonly RequirementFacts[],
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  injectionLog?: InjectionLogPort,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  if (openPromptFactsFor(facts, windowKey).length === 0) return ''
  return fallbackSectionTextFrom(facts, tasks, context, { injectionLog })
}

/** 引导文本（纯字面量）。窗口已完成/取消/归档全部需求后重新变为 unbound → 引导复现。 */
export function captureGuidanceText(windowKey: string): string {
  // 全部字面量，无 {{变量}}。短小精炼，避免挤占上下文预算。
  return [
    `${PM_BADGE_PREFIX}项目捕获（reqboard · 本窗口 ${windowKey.slice(0, 16)} 未绑定需求）`,
    '',
    '本窗口当前没有进行中的需求记录。若用户在本窗口提出了新的工作意图',
    '（新功能 / 缺陷修复 / 文档 / 重构 / 技术调研 / 维护事项），且该工作值得立项，',
    '直接调 reqboard_capture（pm 专有立项弹框）——一次调用弹出「立项三问」并在同一次调用内',
    '完成创建与窗口绑定：问题一「需求名称」（可经 title_options 传候选，最贴切一项推荐置首，',
    '允许自定义输入）；问题二「需求类型」（feature / bug / doc / refactor / spike / chore）；',
    '问题三「提示词难度」（simple / standard / advanced / expert）。用户作答即立项确认',
    '（创建即立项，无待归类/建议卡中间态），**不需要**再补调 reqboard_create。',
    '弹框通道不可用时该工具返回 fallback=board：此时改为文字向用户取值后再调 reqboard_create',
    '（title / category / prompt_difficulty / summary / reason）。',
    '',
    '判不准是否值得立项时按"值得"处理——直接调 reqboard_capture 弹框问用户（框里可以选"不需要"，',
    '比沉默跳过安全）；仅闲聊或询问已有需求进度时无需弹框、无需立项。',
    '',
    // 修复（2026-10-06）：本段也会被注入到**自主回合**（开窗底稿 / 交接底稿 / 子代理回报触发的
    // 一整轮），而这类回合代码级禁止立项（requireDirectHuman 只认 source.kind==='user'）。
    // 缺这段出路时，窗口 agent 会照上半段去试立项、必被拒；实测一条委派窗口因此在**没有立项**的
    // 情况下落了 50 处改动、把 54 条门禁用例改红且无人认领——故"不许落盘"必须一起写明。
    '若本回合**不是**由用户直接消息触发的（例如开窗底稿、交接底稿、子代理回报这类自署消息），',
    '则代码级禁止立项：不要调 reqboard_capture / reqboard_create（必被 REQBOARD_DIRECT_HUMAN_REQUIRED 拒）。',
    '此时**只做只读勘察，不要落盘改动**——没有立项的改动没有台账、没有阶段门、没有验收，',
    '一律算野改动；确要开工，先请用户在本窗口发一句话（随后即可立项），',
    '或由委派方用 reqboard_capture（on_window_bound=handoff）把需求直接登记到你名下。',
  ].join('\n')
}
