/**
 * 交接用例（REQ-261004150249-731e FR-4 / FR-5 · t-4bd792）——`reqboard_handoff` 的用例层。
 *
 * 一次调用做完五步：① 授权（调用窗口必须是 owner）② 判据（读水位，判 agent 能否**自主**交接）
 * ③ 开窗（缺省在**源项目**里建新会话）④ 交接（一次 mutate 写全席位升降 + `sourceSessionId` + 留痕）
 * ⑤ 投递（断点 + 节点输入包，**自署 kind** 投给新窗口）。
 *
 * ## 为什么**刻意不调** `requireDirectHuman`（本能力是唯一的 agent 自主口）
 *
 * 其余写路径都要求「直接人工回合」，本能力**必须**允许 agent 在顶墙时自主发起：上下文将满时若还要
 * 等人先发话，人先看到的是一次硬停，续作成本反而更高。取舍与兜底：
 *   · 只有 `fork` / `critical` 两档允许自主（`allowsSelfHandoff`）——别的档必须写明 `reason`；
 *   · 读数**不可得**时不猜、不补 0（`decideHandoff` → `'unknown'`）：要么人明确要求，
 *     要么 `REQBOARD_HANDOFF_NO_CONTEXT`（把「取不到」当「余量充裕」会静默停摆，当「已满」会无谓打断）；
 *   · 仍要 live driver（`requireLiveDriver`）：subagent / 非本进程驱动的调用一律拒；
 *   · 交接**不碰**阶段与产物确认状态——它只换人，不推进流水线（design/architecture.md C-06）。
 *
 * 顺序纪律：先开窗 → 后交接 → 再投递。开窗失败 ⇒ **台账零改动**；投递失败 ⇒ **不回滚**交接
 * （人已经能进新窗口，回滚还要再改回来、风险更高，见 design/use-cases.md UC-5）。
 *
 * @module dsh-pmboard/application/use-cases/HandoffOwner
 */
import type { UseCaseDeps, WindowInheritance } from '../ports.js'
import type { ContextPressureSnapshot, RequirementRecord } from '../../shared/protocol.js'
import { normalizeText } from '../../shared/protocol.js'
import { difficultyFromDeclaredPrompt } from '../../domain/prompt/difficulty-mapping.js'
import { isPromptStage } from '../../domain/prompt/types.js'
import {
  allowsSelfHandoff,
  decideHandoff,
  type HandoffDecision,
  type HandoffThresholds,
} from '../internal/handoff-policy.js'
import { handoffOwner } from '../internal/binding-write.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { buildNodeInputPackage, requirementDocPath } from '../internal/node-input-package.js'
import { agentIdFromExec, reject, requireLiveDriver, requireSameProject } from '../internal/support.js'
import { canWrite, firstWritableBound, seatOfSummary } from '../internal/window.js'
import { mutateIfPresent, requirementStoreOf } from './queue-access.js'
import { resolveWindowCreateOptions } from './OpenWindow.js'
import { applyWindowInheritance, presetInheritanceOf, readWindowProfile } from '../internal/window-inherit.js'

/** 交接底稿的自署来源（**红线**：永不为 `user`——那等于插件冒充人类）。 */
export const HANDOFF_SEED_KIND = 'reqboard-handoff'

/** 缺省三档水位（与 `plugin-config.handoffSettings` 的缺省同值；`deps.handoff` 未装配时用它）。 */
export const DEFAULT_HANDOFF_THRESHOLDS: HandoffThresholds = { warn: 0.75, fork: 0.85, critical: 0.9 }

/** 各档的中文说法（只进文案，不参与判定）。 */
const DECISION_LABEL: Record<HandoffDecision, string> = {
  none: '未达预警档',
  warn: '预警档',
  fork: '分叉档',
  critical: '顶墙档',
  unknown: '读数不可得',
}

export interface HandoffArgs {
  /** 需求 id；缺省 = 本窗口**有 owner 席位**的第一条绑定需求。 */
  requirement_id?: string
  /** 指定接管窗口；缺省 = 新建（`mode` 决定 fork 还是 create）。 */
  to_window?: string
  /** 交接原因（进留痕评论）；非顶墙档**必填**。 */
  reason?: string
  /** 新建窗口的方式；缺省 `create`（顶墙续作靠断点 + 输入包接续，不需要旧上下文）。 */
  mode?: 'fork' | 'create'
}

/** 底稿投递结果（未投递时**不得省略该键**，见 design/data-model.md §回执契约）。 */
export interface HandoffDelivery {
  delivered: boolean
  kind: string
  reason?: string
}

/** 回执（键名与 design/interfaces.md §工具 `reqboard_handoff` 逐字一致；缺项整体省略、不发 null）。 */
export interface HandoffValue {
  success: true
  requirement_id: string
  from_window: string
  to_window: string
  old_role: 'observer'
  new_role: 'owner'
  /** 是否 agent 自主发起（只有顶墙两档为 true）。 */
  self_initiated: boolean
  delivery: HandoffDelivery
  context_pressure: {
    contextWindow?: number
    pressureTokens?: number
    projectedTokens?: number
    source: string
  }
  note: string
  /**
   * 本次交接用的**判据来源**（REQ-261005141830-7a3b t6 · FR-9）：`project-id` = 两侧项目身份相等；
   * `path-fallback` = 任一侧缺身份、走路径口径（要如实标注「未归属」，不静默放行）。
   * 新建接管窗口那条路不校验（新窗口建在源项目里），故不返回本键。
   */
  project_source?: 'project-id' | 'path-fallback'
  /** 需求侧项目身份（有则给；未归属则缺省）。 */
  project_id?: string
  /**
   * 继承回执（REQ-261005151245-54ae FR-5）：**仅新建接管窗口时出现**；
   * `to_window` 指向已有窗口时整体省略（没有新建窗口，就没有可继承的对象）。
   */
  inheritance?: WindowInheritance
}

/**
 * 交接一条需求。
 *
 * @param thresholds 三档水位覆盖（工具工厂/组合根显式给时优先）；缺省 `deps.handoff`，
 *                   再缺省内置 `0.75 / 0.85 / 0.90`。
 */
export async function handoffRequirement(
  deps: UseCaseDeps,
  args: HandoffArgs,
  exec: unknown,
  thresholds?: HandoffThresholds,
): Promise<HandoffValue> {
  // 归属与活体校验（**不**过 requireDirectHuman：见模块头「自主边界」）。
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)

  // ① 选需求：显式 id 优先；缺省优先取我是 owner 的那条，否则退回第一条绑定
  //    （好让下面的授权判定给出**准确**的拒绝码，而不是误报「没有绑定需求」）。
  const store = requirementStoreOf(deps)
  const bound = await boundSummariesOf(store, windowKey)
  const explicitId = normalizeText(args.requirement_id, 'requirement_id', 64)
  const target = explicitId.length > 0
    ? bound.find((r) => r.id === explicitId)
    : firstWritableBound(bound, windowKey, 'move-requirement') ?? bound[0]
  if (target === undefined) {
    reject(
      `reqboard_handoff 未执行：需求 ${explicitId.length > 0 ? explicitId : '(本窗口绑定需求)'} 不是本窗口绑定的进行中需求`,
      'REQBOARD_NOT_BOUND_TO_WINDOW',
    )
  }

  // ② 授权：交接 = 换拍板人 ⇒ owner-only。错误码固定 REQBOARD_SEAT_NOT_OWNER（错误码表口径），
  //    底层码（NO_SEAT / SEAT_READONLY）写进文案供诊断，不让两种口径各说一套。
  const allowed = canWrite(seatOfSummary(target, windowKey), 'move-requirement')
  if (!allowed.ok) {
    reject(
      `reqboard_handoff 未执行：本窗口在该需求上的席位不允许交接（${allowed.code}）——只有 owner 能交接（换拍板人属 owner-only 动作）`,
      'REQBOARD_SEAT_NOT_OWNER',
    )
  }
  const reqId = target.id

  // ③ 判据 + 自主边界（D-3）：读数宁可「不可得」，也不补 0 冒充余量。
  const cfg = thresholds ?? deps.handoff ?? DEFAULT_HANDOFF_THRESHOLDS
  const pressure = deps.session.contextPressure(windowKey)
  const decision = decideHandoff(pressure, cfg)
  const reason = normalizeText(args.reason, 'reason')
  const selfInitiated = allowsSelfHandoff(decision)
  if (!selfInitiated && reason.length === 0) {
    if (decision === 'unknown') {
      reject(
        `reqboard_handoff 未执行：上下文水位读数不可得（source=${pressure.source}），不猜也不自动交接——需要人明确要求才交接，并在 reason 里写明原因`,
        'REQBOARD_HANDOFF_NO_CONTEXT',
      )
    }
    reject(
      `reqboard_handoff 未执行：水位档为「${DECISION_LABEL[decision]}」而非顶墙档（fork / critical），agent 不得自主交接——确需交接（人明确要求、并行分卡等）请在 reason 里写明原因`,
      'REQBOARD_INVALID_INPUT',
    )
  }

  // ④ 目标窗口：显式给就用（不建窗）；缺省在源项目里建新会话。
  //    本步之前**一个字节都没写台账**，故开窗失败天然是「台账零改动」。
  const explicitTo = normalizeWindowArg(args.to_window)
  if (explicitTo === windowKey) {
    reject(
      `reqboard_handoff 未执行：to_window 不能等于源窗口（${windowKey}）——同窗交接没有意义`,
      'REQBOARD_HANDOFF_TARGET_INVALID',
    )
  }
  const opened = explicitTo === undefined
    ? await openTargetWindow(deps, args.mode, windowKey, exec)
    : undefined
  const toWindow = explicitTo ?? opened!.windowKey

  // REQ-261005141830-7a3b t6（FR-11）：**跨项目不得交接**——显式指定的接管窗口必须与需求同项目。
  // 新建窗口那条路落在**源项目**里（`resolveWindowCreateOptions` 按源会话项目落点），天然同项目，故只校验显式路径。
  // 校验发生在**任何台账写入之前** ⇒ 被拒时台账零改动（T-21）。
  const guard = explicitTo === undefined
    ? undefined
    : requireSameProject(deps, target, explicitTo, '交接')

  // ⑤ 交接：一次 mutate 写全（席位升降 + sourceSessionId + 留痕）。
  const at = deps.clock.now()
  const actor = { kind: 'agent' as const, sessionId: windowKey }
  const written = await mutateIfPresent(store, reqId, (draft) =>
    handoffOwner(draft, {
      toWindow,
      actor,
      at,
      commentId: () => deps.ids.comment(),
      ...(reason.length > 0 ? { reason } : {}),
    })
      ? { changed: true }
      : undefined,
  )
  if (written === undefined) {
    // 读得到但写不到（并发删掉 / 写盘失败）：整条回退——绝不「交接没成立却报成功」。
    reject(
      `reqboard_handoff 未执行：需求 ${reqId} 在台账里已不可变（找不到或写盘失败），台账零改动`,
      'REQBOARD_HANDOFF_WRITE_FAILED',
    )
  }
  const changed = written.changed === true
  // ⑥ 投递底稿：失败**不回滚**交接，但必须如实回报（UC-5）。
  const delivery = await deliverSeed(deps, written.requirement, pressure, toWindow)

  const note = [
    `交接已生效：${windowKey} → ${toWindow}`,
    changed
      ? '（本次写入：席位升降 + sourceSessionId + 留痕评论，一次 mutate 完成）'
      : '（幂等：席位与 sourceSessionId 此前已就位，本次未改台账）',
    delivery.delivered
      ? '；底稿已以自署 kind（reqboard-handoff）投递，新窗口可直接接续'
      : `；底稿未投递：${delivery.reason ?? '原因未知'}——交接不回滚，${toWindow} 已是 owner（reqboard_status 可见），可按断点 + 文档目录接手`,
    selfInitiated ? '' : '；本次非 agent 自主（水位档未到顶墙，由人明确要求）',
    guard !== undefined && !guard.attributed
      ? '；本次目标窗口未归属（判据：路径兜底）——如实标注，不冒充项目身份'
      : '',
  ].join('')

  return {
    success: true,
    requirement_id: reqId,
    from_window: windowKey,
    to_window: toWindow,
    old_role: 'observer',
    new_role: 'owner',
    self_initiated: selfInitiated,
    delivery,
    context_pressure: pressureProjection(pressure),
    note,
    // FR-9：判据说出来（新建窗口路径不校验 ⇒ 缺失，缺失 ≠ 判据为空）。
    ...(guard === undefined
      ? {}
      : { project_source: guard.by, ...(guard.projectId !== undefined ? { project_id: guard.projectId } : {}) }),
    // REQ-261005151245-54ae FR-5：只有**新建**了窗口才谈得上继承（指定已有窗口 → 该键整体省略）。
    ...(opened === undefined ? {} : { inheritance: opened.inheritance }),
  }
}

/**
 * `to_window` 参数归一的唯一处：返回 `undefined` = 调用方没给（⇒ 新建窗口）。
 * **空串不等于没给**：给了空串是表达错误，响亮拒绝（否则会静默变成「建一个新窗口」，与意图相反）。
 *
 * 注：「目标窗口不存在 / 不是活窗口」**刻意不在这里判**——跨窗口投递口本身支持冷会话 resume
 * （`AgentDeliverer.deliver`），拿「此刻没有活句柄」当「不存在」会把「刚冷却下来的合法接管窗口」误拒。
 * 真正的投递结果由 `delivery.delivered` 如实回报（`to_window` 只判形态与「不等于源窗口」）。
 */
function normalizeWindowArg(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') {
    reject('reqboard_handoff 未执行：to_window 必须是窗口码（字符串）', 'REQBOARD_HANDOFF_TARGET_INVALID')
  }
  const t = raw.trim()
  if (t.length === 0) {
    reject(
      'reqboard_handoff 未执行：to_window 是空串——要么给一个真实窗口码，要么整个不传（缺省新建窗口）',
      'REQBOARD_HANDOFF_TARGET_INVALID',
    )
  }
  return t
}

/**
 * 新建接管窗口（缺省路径）：落点复用 `reqboard_open_window` 的同一条解析链（源项目优先）。
 * 任何失败都发生在**写台账之前** ⇒ 台账零改动。
 *
 * REQ-261005151245-54ae FR-1/FR-3/FR-4：新窗口建成后落定继承三件（标题 / 模式 / 模型），
 * 回执随 `inheritance` 一并带出——接管方一眼看得出新窗口像不像源窗口。
 */
async function openTargetWindow(
  deps: UseCaseDeps,
  mode: 'fork' | 'create' | undefined,
  windowKey: string,
  exec: unknown,
): Promise<{ windowKey: string; inheritance: WindowInheritance }> {
  const opener = deps.windowOpener
  if (opener === undefined || !opener.available()) {
    reject(
      'reqboard_handoff 未执行：本宿主未装配会话开窗能力（sessionController.fork/create 不可得），台账零改动',
      'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
    )
  }
  const want = mode ?? 'create'
  if (want !== 'fork' && want !== 'create') {
    reject(`reqboard_handoff 未执行：mode 只能是 fork 或 create（实际 ${JSON.stringify(mode)}）`, 'REQBOARD_INVALID_INPUT')
  }
  // 源会话画像只读一次（FR-2）：标题与模型从这里取，`create` 的模式也随请求带上（FR-3）。
  const sourceRead = await readWindowProfile(opener, windowKey)
  if (want === 'fork') {
    const forked = await opener.fork(windowKey)
    if (!forked.ok) {
      reject(
        `reqboard_handoff 未执行：fork 新窗口失败（${forked.reason}），台账零改动——可改用 mode=create，或 to_window 指定一个已有窗口`,
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    const inheritance = await applyWindowInheritance(opener, {
      childKey: forked.windowKey,
      mode: 'fork',
      sourceRead,
    })
    return { windowKey: forked.windowKey, inheritance }
  }
  // create 必须先解析**落点**：解析不出就响亮失败，且不调用 create
  // （绝不让要在原项目里续作的新窗口悄悄落到宿主目录——那正是本需求要根治的病灶）。
  const placement = resolveWindowCreateOptions(opener, windowKey, exec)
  if (placement === undefined) {
    reject(
      'reqboard_handoff 未执行：拿不到源会话的项目落点（workspace 与 cwd 都不可得），不在宿主目录里静默建窗，台账零改动',
      'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
    )
  }
  const preset = presetInheritanceOf(sourceRead, 'create').agentPreset
  const outcome = await opener.create(preset === undefined ? placement : { ...placement, agentPreset: preset })
  if (!outcome.ok) {
    reject(`reqboard_handoff 未执行：建新窗口失败（${outcome.reason}），台账零改动`, 'REQBOARD_OPEN_WINDOW_UNAVAILABLE')
  }
  const inheritance = await applyWindowInheritance(opener, {
    childKey: outcome.windowKey,
    mode: 'create',
    sourceRead,
  })
  return { windowKey: outcome.windowKey, inheritance }
}

/** 投递底稿（不动台账）；端口未装配 / 投递失败都如实回报，**绝不谎报已送达**。 */
async function deliverSeed(
  deps: UseCaseDeps,
  record: RequirementRecord,
  pressure: ContextPressureSnapshot,
  toWindow: string,
): Promise<HandoffDelivery> {
  const port = deps.crossWindowDeliver
  if (port === undefined) {
    // 未装配就地返回：不为一次注定发不出去的消息去读文档、造输入包。
    return { delivered: false, kind: HANDOFF_SEED_KIND, reason: '未装配跨窗口投递能力（crossWindowDeliver）' }
  }
  const text = await buildSeedText(deps, record, pressure)
  // 自署来源（红线）：kind 由本插件给，绝不用会话控制器的 prompt 入口（那会把来源标成人类）。
  const { message } = port.createMessage({ text, kind: HANDOFF_SEED_KIND })
  const sent = await port.deliver(toWindow, message)
  return {
    delivered: sent.delivered,
    kind: HANDOFF_SEED_KIND,
    ...(sent.reason !== undefined ? { reason: sent.reason } : {}),
  }
}

/** 上下文压力读数原样透传（含 `source`）；缺席字段整体省略，**不发 null**（本仓纪律）。 */
function pressureProjection(pressure: ContextPressureSnapshot): HandoffValue['context_pressure'] {
  return {
    ...(typeof pressure.contextWindow === 'number' ? { contextWindow: pressure.contextWindow } : {}),
    ...(typeof pressure.pressureTokens === 'number' ? { pressureTokens: pressure.pressureTokens } : {}),
    ...(typeof pressure.projectedTokens === 'number' ? { projectedTokens: pressure.projectedTokens } : {}),
    source: pressure.source,
  }
}

/** 节点输入包不可用时的退化说明（上文的断点四件套本身就是自足短文，不重复抄一遍）。 */
const NODE_PACKAGE_UNAVAILABLE =
  '（未附节点输入包：当前阶段不是可注入节点，或需求文档读不出来。上文的 id / 标题 / 阶段 / 文档目录 / 断点 / 下一步命令已足以接续。）'

/**
 * 底稿正文 = 断点（id/标题/阶段/文档目录/中断原因/下一步命令）+ 节点输入包。
 *
 * 为什么带上输入包：阶段边界是本仓唯一「上下文自足」的切点，新窗口拿这一份即可续跑（INV-9）。
 * 取不到就**如实退化**（不伪造文档内容；`buildNodeInputPackage` 自己会标注「文档不可用」）。
 */
async function buildSeedText(
  deps: UseCaseDeps,
  req: RequirementRecord,
  pressure: ContextPressureSnapshot,
): Promise<string> {
  const br = req.interruption
  const head = [
    `# 交接底稿 · ${req.id} · ${req.title}`,
    '',
    '> 本消息由 reqboard_handoff 以自署来源投递（kind=reqboard-handoff），**不是人类发言**。',
    '> 你是这条需求的新 owner：席位与绑定已改到本窗口，原窗口降为 observer（只读，看得见进度）。',
    '',
    '## 断点',
    `- 需求 id：${req.id}`,
    `- 标题：${req.title}`,
    `- 当前阶段：${req.status}`,
    `- 文档目录：${docDirOf(req)}`,
    `- 中断原因：${br?.reason ?? '（本需求未登记断点）'}`,
    `- 断点阶段：${br?.stage ?? req.status}`,
    `- 下一步命令：${br?.pendingAction ?? '（未登记：先 reqboard_status 复核，再按当前阶段推进）'}`,
    ...(br?.tool !== undefined ? [`- 最后成功工具：${br.tool}`] : []),
    ...(br !== undefined ? [`- 断点时刻：${new Date(br.at).toISOString()}`] : []),
    '',
  ].join('\n')
  const pkg = await tryNodeInputPackage(deps, req, pressure)
  return head + (pkg ?? NODE_PACKAGE_UNAVAILABLE)
}

/** 需求文档目录（渲染用）：相对路径字符串运算，**不 import node:path**（application 层纪律）。 */
function docDirOf(req: RequirementRecord): string {
  const p = requirementDocPath(req)
  if (p.length === 0) return '（未声明）'
  return p.replace(/\/[^/]*$/, '/')
}

/** 节点输入包（可用则给正文，否则 undefined）。任何取数失败都按不可用处理，绝不阻断交接。 */
async function tryNodeInputPackage(
  deps: UseCaseDeps,
  req: RequirementRecord,
  pressure: ContextPressureSnapshot,
): Promise<string | undefined> {
  const stage = req.status
  if (!isPromptStage(stage)) return undefined
  const docPath = requirementDocPath(req)
  if (docPath.length === 0) return undefined
  let doc = ''
  try {
    doc = await deps.docs.read(docPath)
  } catch {
    doc = '' // 读失败按不可用：输入包会把「文档不可用」如实标注出来
  }
  const difficulty = difficultyFromDeclaredPrompt(req.promptDifficulty)
  try {
    return buildNodeInputPackage({
      stage,
      ...(difficulty === undefined ? {} : { difficulty }),
      ...(req.category === undefined ? {} : { category: req.category }),
      requirement: req,
      requirementDoc: doc,
      requirementDocPath: docPath,
      contextPressure: pressure,
    }).text
  } catch {
    return undefined
  }
}
