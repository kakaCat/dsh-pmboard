/**
 * CaptureRequirement 用例（REQ-e3b6a0 t8 / FR-7）——立项弹框（pm 专有）：一次调用一把梭。
 *
 * 为什么不复用 `reqboard_ask_confirm`：立项弹框是**表单取值 + 创建**，根本没有产物可落章
 * （ask_confirm 的 target 语义是"确认**已有**产物 / 批准**已有**计划"）。但两者**共用同一条
 * 弹框通道**（`UserQuestionPort`）与**同一条后置链**——本用例只声明 `gate: 'G0'`，
 * 压缩/注入/唤醒/留痕由装饰器（adapters/GateAwareQuestions）统一织入，本用例不碰链。
 *
 * 时序（Phase A，全部在一次工具调用内完成，避免"先弹框、再另调 create"的断链）：
 *   ① 前置判定：已绑定 / 有遗留 pending 卡 → 直接拒绝（不白弹一次框）；
 *   ② 经 `deps.questions.ask(问列表)` 弹框（装饰器在此刻登记 G0 的后置链）；
 *   ③ 答案映射：名称自定义优先、缺项回落既有默认并**记进 defaults_used**（不静默猜）；
 *   ③.5 拒绝立项检查：用户选择"不需要立项" → 如实返回未立项；
 *   ④ `createRequirementDirect`：创建即立项（含 draft 入口快照 + 文档位置）；
 *   ⑤ 原子推进 draft → brainstorming（= G0 的 to；H1 稍后以台账实时状态校验推进是否真发生）。
 *
 * Phase B（H2 压缩跳过 / H3 注入 brainstorming 纪律 / H4 唤醒续跑 / H5 留痕）由链负责。
 *
 * @module dsh-pmboard/application/use-cases/CaptureRequirement
 */
import type { AskAnswer, AskQuestion, CaptureRejection, HostFsPort, UseCaseDeps } from '../ports.js'
import { normalizeText, normalizeTitle } from '../../shared/protocol.js'
import { LIMITS } from '../../domain/limits.js'
import { fmt } from '../../domain/text/fmt.js'
// REQ-261008020617-088f RF-5：路径判定走纯函数 + 宿主端口（application 不再 import node:path/node:fs）
import { isAbsolutePath } from '../internal/paths.js'
import { CAPTURE_CANCEL_ESCALATION, recentCaptureCancels, recentCaptureRejection } from '../internal/capture-rejections.js'
import { askWithBudget } from '../internal/ask-timed.js'
import { captureDiag } from '../internal/diag-log.js'
import { advanceDraftToBrainstorming } from '../internal/advance-draft.js'
import {
  buildCaptureIntentQuestions,
  buildCaptureDetailQuestions,
  mapCaptureAnswers,
  WORKSPACE_SENTINELS,
  type CaptureMapping,
} from '../internal/capture-mapping.js'
import {
  agentIdFromExec,
  createRequirementDirect,
  projectIdOfWindowForDeps,
  reject,
  requireDirectHuman,
  requireLiveDriver,
  ensureWritableProjectRoot,
} from '../internal/support.js'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
// 需求文档位置唯一解析点（2026-10-06）：回执里那条"文档将存放在…"原先自己 `replace('<REQ>', id)`
// ——只替第一个占位符、且 docBasePath 无占位符时**不追加 id 子目录**，于是回执给的相对路径
// 与实际落点不是同一个目录（`docs/requirements/` → 少一层 `REQ-x/`）。
import { requirementDocDirOf } from '../../domain/requirement/DocLocation.js'
// REQ-261005105032-3b02 t11（FR-2）：弹框立项推进进需求阶段时幂等落原型骨架（失败只告警不阻断）。
import { taskStoreOf } from './queue-access.js'
// FR-1（REQ-261004150249-731e）：开窗落点的三级解析与 reqboard_open_window 共用同一条链。
import { resolveWindowCreateOptions } from './OpenWindow.js'

/** 未立项的统一回执（success=false；绝不伪造 requirement_id）。 */
function notCreated(
  mapped: CaptureMapping | undefined,
  extra: { fallback?: string; note: string },
): Record<string, unknown> {
  return {
    success: false,
    requirement_id: '',
    status: '',
    answers: mapped?.answers ?? { title: '', category: '', difficulty: '', location: '' },
    defaults_used: mapped?.defaultsUsed ?? [],
    ...(extra.fallback === undefined ? {} : { fallback: extra.fallback }),
    note: extra.note,
  }
}

/**
 * 工作区作答 → 绝对路径（REQ-260929210741-30ae FR-6）。
 * 哨兵值解析为当时路径；自定义输入必须是已存在的绝对目录，否则 undefined（调用方响亮拒绝）。
 */
function resolveWorkspaceAnswer(answer: string, sessionCwd: string, host: HostFsPort): string | undefined {
  if (answer === WORKSPACE_SENTINELS.session) return sessionCwd
  // `host` 哨兵 = **宿主进程 cwd**（不是任何需求根）——与搬迁前的 process.cwd() 逐字一致
  if (answer === WORKSPACE_SENTINELS.host) return host.cwd()
  // 自定义路径：绝对 + 已存在 + 是目录（端口对不可读/不存在一律 false，故无需 try/catch）
  if (!isAbsolutePath(answer)) return undefined
  return host.isDirectory(answer) ? answer : undefined
}

/** 立项后原子推进 draft → brainstorming（G0 的 to）。失败只如实说明，不抛。 */
// 实现已抽到 internal/advance-draft.ts：代理立项（reqboard_create + owner_window）走同一段编排。

/**
 * 立项弹框用例（`reqboard_capture`）：逐问作答 → 创建即立项 → 绑定本窗口 → 推进 brainstorming。
 * 弹框通道不可用/无权限 → `fallback=board` 并如实说明，**不伪造立项**（FR-7 第 5 条）。
 */
export async function captureRequirement(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  requireDirectHuman(deps, exec)
  const a = (args ?? {}) as { title_options?: unknown; summary?: unknown; reason?: unknown; onWindowBound?: unknown; on_window_bound?: unknown }
  // 工具入参走 snake_case（on_window_bound），用例内部/测试用 camelCase——两个都认，取其一。
  const rawOnWindowBound = a.onWindowBound ?? a.on_window_bound
  // FR-4（REQ-261003215944-9e04）：一个窗口可以接多个项目，也可以把项目交出去。
  //   second（缺省） = 本窗口接第二个项目（本窗口当 owner）
  //   handoff        = 开一个新窗口，需求记在**它**名下（原窗口只留指针）
  // handoff 与「本窗口是否已绑定」无关——未绑定时同样换窗（见 ① 的修复说明）。
  const boundPolicy: 'second' | 'handoff' = rawOnWindowBound === 'handoff' ? 'handoff' : 'second'
  if (rawOnWindowBound !== undefined && rawOnWindowBound !== 'second' && rawOnWindowBound !== 'handoff') {
    reject("reqboard_capture 未执行：onWindowBound 只能是 'second' 或 'handoff'", 'REQBOARD_INVALID_INPUT')
  }
  const titleOptions = Array.isArray(a.title_options)
    ? (a.title_options as unknown[])
      .map(x => normalizeText(x, 'title_options[]', LIMITS.titleMax))
      .filter(x => x.length > 0)
    : []
  const summary = normalizeText(a.summary, 'summary')
  const reason = normalizeText(a.reason, 'reason')

  // ① 前置：白弹一次框是最贵的浪费（用户要等一次点击）。与 reqboard_create 的拒绝语义对齐。
  // FR-4（REQ-261003215944-9e04）：已绑定时不再"一律拒绝"，而是按 onWindowBound 选
  //   「本窗口接第二个项目（second）」或「交给新窗口（handoff）」。
  //
  // **修复：handoff 在未绑定时也曾被静默忽略**（委派立项失效，2026-10-06 实测）。
  // 原实现把整段 handoff 关在 `if (本窗口已有在飞需求)` 里，于是**本窗口空闲、显式要求把需求
  // 交给新窗口**这一最需要它的场合：不开窗、需求落回本窗口，而回执照报 bound_policy=handoff
  // ——调用方以为派了出去，实际没有，也没有任何一处报错。
  // handoff 的语义是「这条需求记在哪个窗口名下」，与「本窗口是否已经绑定」是两件事；
  // 调用方显式要求 handoff 就必须真的换窗，换不了就如实拒绝（不静默降级成 second）。
  let ownerWindowKey = windowKey
  let handedOffTo: string | undefined
  if (boundPolicy === 'handoff') {
    // handoff：先开一个新窗口，再把这个项目记在它名下。
    const opener = deps.windowOpener
    if (opener === undefined || !opener.available()) {
      reject(
        'reqboard_capture 未执行：会话开窗能力不可用（无法 handoff）；请改用 onWindowBound=second',
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    // REQ-261004150249-731e FR-1：开窗前先解析源项目落点（与 OpenWindow 同一条三级链）；
    // 解析不出就响亮失败，且**不调用** create——绝不在宿主目录里静默建窗。
    const target = resolveWindowCreateOptions(opener, windowKey, exec)
    if (target === undefined) {
      reject(
        'reqboard_capture 未执行：拿不到源会话的项目落点（workspace 与 cwd 都不可得），不在宿主目录里静默建窗；请改用 onWindowBound=second',
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    const opened = await opener.create(target)
    if (!opened.ok) {
      reject(
        `reqboard_capture 未执行：handoff 开窗失败（${opened.reason}）；请改用 onWindowBound=second`,
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    ownerWindowKey = opened.windowKey
    handedOffTo = opened.windowKey
  }
  // ①.5 拒绝粘滞（REQ-260922012924-2e29 FR-5）：同窗口 30 分钟内已在弹框选择"不需要立项"
  // → 不再弹框。场景：上次 capture 调用超时/中断，用户答复随死掉的调用丢失，agent 不知
  // 已拒绝而重弹（2026-09-21 现场：用户点"不立项"后需求仍被创建推进）。留痕读失败/损坏
  // 按无记录降级（留痕是增强不是门槛——绝不因留痕故障误拦截）。
  if (deps.rejections !== undefined) {
    let rejections: readonly CaptureRejection[] = []
    try { rejections = await deps.rejections.readAll() } catch { rejections = [] }
    const recent = recentCaptureRejection(rejections, windowKey, deps.clock.now())
    if (recent !== undefined) {
      return notCreated(undefined, {
        note: fmt(
          '用户已于 {t} 在弹框选择「不需要立项」（30 分钟内不再弹框，FR-5 拒绝粘滞）。本次未立项；如需立项请用户明确告知后重试。',
          { t: new Date(recent.at).toISOString() },
        ),
      })
    }
    // REQ-261007223647-da5d t5（FR-2）：连续取消到阈值 → **不再弹框**，改提议看板/文字两条路。
    // 为什么要拦在弹框之前：人已经用"取消"表达过三次"别弹了"，再弹就是拿同一个框烦人。
    const cancels = recentCaptureCancels(rejections, windowKey, deps.clock.now())
    if (cancels >= CAPTURE_CANCEL_ESCALATION) {
      return notCreated(undefined, {
        note: fmt(
          '本窗口 30 分钟内已连续取消 {n} 次立项弹框：本次**不再弹框**。两条替代路径任选——① 直接文字给出「名称/类型/算力档位/文件落点」，我调 reqboard_create 立项；② 到项目看板 → 立项页填写（/dashboard#pmboard）。',
          { n: String(cancels) },
        ),
      })
    }
  }

  // ② 弹框（闸门声明 G0：装饰器在此刻登记后置链；本用例不碰链）
  console.log('[reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性')
  if (!deps.questions.available()) {
    console.log('[reqboard DEBUG] CaptureRequirement: 弹框通道不可用，返回 fallback=board')
    return notCreated(undefined, {
      fallback: 'board',
      note: '弹框通道不可用（userQuestions 服务缺失）：本次未立项。可稍后重试 reqboard_capture，或请用户直接给出名称/类型/难度/文档位置后调 reqboard_create 立项。',
    })
  }
  console.log('[reqboard DEBUG] CaptureRequirement: 弹框通道可用，准备构建问题')
  /**
   * 交互留痕（t5）：拒绝 / 取消 / 超时都写一条，**失败不阻断**主流程（留痕是增强不是门槛）。
   * 作答「到达即写」——不再依赖调用延续段活到用例收尾。
   */
  const recordInteraction = (
    d: UseCaseDeps,
    win: string,
    kind: 'reject' | 'cancel' | 'timeout',
  ): void => {
    try {
      d.rejections?.record({ windowKey: win, at: d.clock.now(), kind })
    } catch { /* 留痕失败不阻断「未立项」返回 */ }
  }

  /**
   * 一次弹框（两段共用）——失败语义与改造前逐字一致：
   * 无弹框权限 → fallback=board；用户取消/暂离 → 中性未立项。
   *
   * REQ-261007223647-da5d t4（FR-1）：等待改走 `askWithBudget`——**等待死在工具预算之前**
   * （预算 1 小时就等 1 小时减安全边），到点返回「还没作答」而不是让调用被外部砍掉。
   *
   * 失败回执写进 `failure` 并返回 undefined：**不新增返回对象键**——本文件的每个 return 分支
   * 都要经 tests/output-contract 的静态扫描（按 defineCaptureTool 声明的响应键校验），
   * 自造的 `{ ok, out }` 包装会被判成未声明字段。
   */
  let failure: Record<string, unknown> | undefined
  const askOrFail = async (
    questions: readonly AskQuestion[],
    gate?: 'G0',
  ): Promise<readonly AskAnswer[] | undefined> => {
    console.log('[reqboard DEBUG] askOrFail 被调用:', {
      questionsCount: questions.length,
      gate,
      firstQuestionId: questions[0]?.id,
      firstQuestionOptionsCount: questions[0]?.options?.length
    })
    try {
      console.log('[reqboard DEBUG] 调用 askWithBudget...')
      const timed = await askWithBudget(deps.questions, questions, {
        ...(exec?.agent !== undefined ? { agent: exec.agent } : {}),
        signal: (exec as { signal?: unknown } | undefined)?.signal,
        ...(gate === undefined ? {} : { gate }),
      }, { desiredMs: LIMITS.timeoutInteractiveMs, budgetMs: LIMITS.timeoutInteractiveMs })
      console.log('[reqboard DEBUG] askWithBudget 返回:', { kind: timed.kind })
      if (timed.kind === 'rejected') throw timed.error
      if (timed.kind === 'pending') {
        // 到点未作答 ≠ 用户取消：回执如实说「还没等到」，并给出仍可作答的出处（卡片通常还活着）
        recordInteraction(deps, windowKey, 'timeout')
        failure = notCreated(undefined, {
          note: '等待超时（宽限内未作答）：本次未立项。弹框卡片通常仍可作答（作答可能迟到送达），也可直接给出名称/类型/算力档位/文件落点后调 reqboard_create，或到看板立项。',
        })
        return undefined
      }
      return timed.answers
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      const message = (err as Error).message
      // 【诊断-3】落文件：stdout 在桌面宿主里读不到，错误码是唯一能区分
      // 「没人接单」与「用户取消」的证据（2026-10-08 实测事故）。
      captureDiag(`reqboard-capture [UI-5]: askWithBudget 抛错 code=${code || '<none>'} message=${message}`)
      if (code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
        failure = notCreated(undefined, {
          fallback: 'board',
          note: '当前调用方无弹框权限（subagent / 非活窗口）：本次未立项。请顶层窗口在直接人工回合重试，或由用户直接给出名称/类型/算力档位/文件落点后调 reqboard_create。',
        })
      } else if (code === 'NO_PROVIDER' || code === 'REQBOARD_NO_UI') {
        // 【2026-10-08 修复】通道故障 ≠ 用户取消。此前 NO_PROVIDER（客户端没有 answerer
        // 接单：userQuestions 服务在、但没人应答）落进 else 分支，被误报成「用户未作答
        // （取消 / 暂离）」，并写一条 cancel 留痕——连续三次后触发取消粘滞（30 分钟不再
        // 弹框），于是"弹框弹不出来"被永久固化，且回执把环境故障说成人的选择。
        captureDiag('reqboard-capture [UI-5]: 判定为通道故障（无 answerer 接单），不计取消留痕')
        failure = notCreated(undefined, {
          fallback: 'board',
          note: '弹框通道无应答者（宿主 userQuestions 服务在、但没有 answerer 接单：'
            + '客户端 UI 插件未加载或该 agent 作用域无应答者）：本次未立项，且**未记取消留痕**。'
            + '请检查官方客户端插件（ui-user-questions）是否加载；'
            + '也可直接给出名称/类型/算力档位/文件落点后调 reqboard_create，或到看板立项。',
        })
      } else {
        // 取消/暂离留痕（t5）：此前一律不留痕，agent 只能靠人抱怨才知道"人不想用弹框"
        recordInteraction(deps, windowKey, 'cancel')
        failure = notCreated(undefined, {
          note: '用户未作答（取消 / 暂离）：本次未立项。不想用弹框？两条替代路径——① 直接文字给出「名称/类型/算力档位/文件落点」，我调 reqboard_create；② 到项目看板 → 立项页填写（/dashboard#pmboard）。',
        })
      }
      return undefined
    }
  }

  // ② 第一段：立项意愿 + 需求名称（含终止项「✖️ 不需要立项」）。**不带 gate**——拒绝不是一次
  // 闸门作答；若在这里声明 G0，用户拒绝后链会把它当"未通过"向窗口回发告警（REQ-260924002956-f37c BUG-2）。
  // REQ-261001203710-0fbf t3 / REQ-261007223647-da5d t1：工作区根**必须早于第一段弹框**算出——
  // 题干要带立项理由、第二段「文件落点」选项要给拼好的绝对路径预览，两处都依赖它。
  const effectiveWorkspace = (deps.docs as { workspaceRoot?: () => unknown }).workspaceRoot?.()
  const sessionCwd = (exec?.agent?.session?.header?.cwd as string | undefined)
    ?? (typeof effectiveWorkspace === 'string' && effectiveWorkspace.length > 0 ? effectiveWorkspace : undefined)
    ?? process.cwd()
  const hostCwd = process.cwd()
  const roots = { sessionCwd, hostCwd }
  // 题干里的立项理由（agent 传的 reason 优先、其次 summary；截断到 60 字——题干长了会把选项挤出可视区）
  const reasonLine = (reason.length > 0 ? reason : summary).replace(/\s+/g, ' ').trim().slice(0, 60)

  console.log('[reqboard DEBUG] 准备第一段弹框:', {
    titleOptionsCount: titleOptions.length,
    reasonLine,
    sessionCwd,
    hostCwd
  })
  const first = await askOrFail(buildCaptureIntentQuestions(titleOptions, { reasonLine }))
  if (first === undefined) return failure as Record<string, unknown>

  // ②.5 拒绝即终端（BUG-1）：命中终止项 → 写留痕 + 立即返回，**不发起第二段**
  //（不再追问类型/难度/文件落点；回执也不再带未作答问项的 defaults_used）。
  const intent = mapCaptureAnswers(first, roots)
  if (intent.rejected) {
    recordInteraction(deps, windowKey, 'reject')
    return notCreated(undefined, {
      note: '用户选择不立项：本次未创建需求（已留痕，30 分钟内本窗口不再弹立项框）。如后续需要立项，请用户明确告知后重新发起 reqboard_capture。',
    })
  }

  // ③ 第二段：类型 / 算力档位 / 文件落点（3 问，t1 由 4 问收口而来）。**G0 登记在这里**——
  // 肯定分支才是一次闸门作答，H1 在回合结束以台账实时状态校验（draft→brainstorming 已发生 = affirmative）。
  // 「⚡ 全部按推荐值立项」一键过：整段跳过，后 3 问全走默认并记 defaults_used（FR-3）。
  let rest: readonly AskAnswer[] = []
  if (!intent.acceptAllRecommended) {
    const asked = await askOrFail(buildCaptureDetailQuestions(roots), 'G0')
    if (asked === undefined) return failure as Record<string, unknown>
    rest = asked
  }

  // ③.5 映射（缺项回落默认并记 defaults_used；名称为空 → 响亮失败）
  // 一键过路径的名称来自 agent 的推荐候选（titleOptions[0]）——弹框不问名称，但绝不拿控制项当名字。
  const mapped = mapCaptureAnswers([...first, ...rest], roots)
  const effectiveTitle = intent.acceptAllRecommended
    ? (titleOptions[0] ?? '').trim().slice(0, LIMITS.titleMax)
    : mapped.title

  if (effectiveTitle.length === 0) {
    return notCreated(mapped, {
      note: '未取到需求名称（弹框答复里名称为空）：本次未立项——名称是唯一没有默认值的问项，不猜不补。可重试 reqboard_capture。',
    })
  }
  mapped.title = effectiveTitle
  mapped.answers.title = effectiveTitle

  // ③.6 工作区解析 + 校验（REQ-260929210741-30ae FR-6）：哨兵值 → 当时路径；
  // 自定义输入 → 必须是已存在的绝对目录，否则响亮拒绝（REQBOARD_INVALID_WORKSPACE）。
  const workspaceRoot = resolveWorkspaceAnswer(mapped.workspace, sessionCwd, deps.hostFs)
  if (workspaceRoot === undefined) {
    return notCreated(mapped, {
      note: fmt(
        '工作区「{ws}」无效：自定义路径必须是已存在的绝对路径目录（REQBOARD_INVALID_WORKSPACE）。本次未立项，请重试 reqboard_capture 并选择有效工作区。',
        { ws: mapped.workspace },
      ),
    })
  }

  // ③.7 写盘根守卫（REQ-261005123641-3982 FR-3）：**必须早于 ④ 建档**。
  // 旧顺序是「④建档 + ⑤推进」之后才守卫，一旦拒绝：记录与状态都已落库，而回执是 Error
  // （实测：多窗口并行时共享单例根被邻居窗口改走 → 回执 ❌ 立项失败，台账里却已有 REQ 并进了 brainstorming）。
  // 此处还没有 REQ id，守卫只认「即将写入的根」——拒绝即**台账零写入**，回执与实际一致。
  const usedProjectRoot = ensureWritableProjectRoot(deps, { workspaceRoot }, { callerRoot: sessionCwd })

  // ④ 创建即立项（draft + 入口快照 + 文档位置 + 工作区根；actor 口径与既有 reqboard_create 一致）
  // 项目身份（REQ-261005141830-7a3b FR-1）：与 create 同口径——按立项窗口解析；
  // 解析不到则不写该键，由 createRequirementDirect 在评论里标注「未归属」（不猜）。
  const projectId = projectIdOfWindowForDeps(deps, windowKey)
  const req = await createRequirementDirect(deps, windowKey, {
    // FR-4：已绑定时按上面的选择放行；归属窗口可能是新窗口（handoff）
    ...(ownerWindowKey !== windowKey ? { ownerSessionId: ownerWindowKey } : {}),
    allowWindowBound: true,
    title: normalizeTitle(mapped.title),
    category: mapped.category,
    description: summary.length > 0 ? summary : mapped.title,
    reason,
    promptDifficulty: mapped.difficulty,
    docBasePath: mapped.docLocation,
    workspaceRoot,
    ...(projectId !== undefined ? { projectId } : {}),
  })

  // ⑤ 原子推进 brainstorming（G0 的 to）
  const advanced = await advanceDraftToBrainstorming(
    deps, req.id, windowKey,
    '立项弹框作答即立项（reqboard_capture 原子推进 draft → brainstorming）',
  )

  // ⑥ RTM 触发点 1（REQ-260926140539-457b FR-2）：**窗口已绑定**（createRequirementDirect 已写
  // sourceSessionId）+ 阶段已落定 → 生成 rtm-lifecycle.yml，并带上绑定窗口（source_session）。
  // 为什么放在推进之后：current_stage 直接取自台账，先写会立刻过期（FR-3 一致性优先）；
  // 失败不阻断立项（syncRTMYaml 内部吞异常并结构化返回，FR-9）。
  const captureTasks = await taskStoreOf(deps).listByRequirement(req.id)
  // REQ-261001203710-0fbf t3 / FR-2：RTM 是**工作区相对**落盘（docs/requirements/<REQ>/rtm-*.yml），
  // 写之前先按记录自己的项目校正并核验——立项建档曾把 rtm-lifecycle.yml 写到别的项目去。
  // REQ-261005123641-3982 FR-3：建档后再按**记录**核一次，作为护栏（与 ③.7 同口径、按构造必过）；
  // 生效根仍取 ③.7 那次（拒绝发生在副作用之前，回执与实际一致）。
  ensureWritableProjectRoot(deps, req)
  syncRTMYaml(deps, captureTasks, req.id, 'create')

  // ⑥.5 RTM 触发点 bind（REQ-260927100007-b8ba FR-12）：reqboard_capture 是当前
  // "triage 确认（suggestedAction=create_req）"的等价动作——createRequirementDirect 已把
  // 窗口绑定写进台账（sourceSessionId）。这里再用 bind 触发点刷一次**窗口投影**，
  // 让 rtm-lifecycle.yml 的 requirement.source_session 始终与台账一致（含绑定关系变更）。
  // 失败不阻断立项（syncRTMYaml 内部吞异常并结构化返回；此处 try/catch 兜底，FR-9）。
  try {
    syncRTMYaml(deps, captureTasks, req.id, 'bind')
  } catch {
    // RTM 是增强层：失败绝不影响立项回执。
  }

  return {
    success: true,
    requirement_id: req.id,
    status: advanced ? 'brainstorming' : req.status,
    // REQ-261001203710-0fbf t3：可观测字段——把「本次写入用的是哪个项目根」明说出来，
    // 这样「写哪了」当场可见，不必等人去别的项目目录里翻（能核验时才给）。
    ...(usedProjectRoot !== undefined ? { used_project_root: usedProjectRoot } : {}),
    answers: mapped.answers,
    defaults_used: mapped.defaultsUsed,
    doc_location: mapped.docLocation,
    // FR-4：把"这次走的是哪条分支"明说出来（本窗口第二条 / 已交给新窗口当 owner）
    bound_policy: boundPolicy,
    ...(handedOffTo !== undefined ? { window_key: handedOffTo } : {}),
    note: fmt(
      handedOffTo !== undefined
        ? '已立项并交给新窗口 {wk} 当 owner：{id}（{category} / {difficulty}）。原窗口不再拥有它；请在侧栏打开该窗口继续（本页可切换）。文档将存放在：{docPath}（相对路径：{relPath}，根={workspaceRoot}）。{advanced}'
        : '已立项并绑定本窗口：{id}（{category} / {difficulty}）。文档将存放在：{docPath}（相对路径：{relPath}，根={workspaceRoot}）。弹框作答即立项，按 brainstorming 阶段纪律继续（无需用户再发消息）。{advanced}',
      {
        ...(handedOffTo !== undefined ? { wk: handedOffTo } : {}),
        id: req.id,
        category: mapped.category,
        difficulty: mapped.difficulty,
        // FR-4：回执直接给绝对路径（用户反馈"不知道绝对路径是哪里"）；相对路径口径不变。
        // 2026-10-06：目录由**台账已落库的 docBasePath** 解析（唯一解析点），不再自己 replace 占位符。
        docPath: deps.docs.resolve(requirementDocDirOf(req) + '/'),
        relPath: requirementDocDirOf(req) + '/',
        workspaceRoot,
        advanced: advanced ? '' : '注意：draft → brainstorming 未推进成功，链会如实记为未推进。',
      },
    ),
    board_link: '/dashboard#pmboard?req=' + req.id,
  }
}