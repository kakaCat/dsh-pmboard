/**
 * 开窗用例（REQ-261003215944-9e04 FR-1 / FR-8 · t4）——`reqboard_open_window` 的用例层。
 *
 * 做什么：把「给我一个新窗口」这件事交给 DSH 现成的会话 fork/create（端口在 adapters），
 * 并用**诚实降级**的措辞把结果告诉人——**建会话 ≠ 打开窗口**，后者只有人能做。
 *
 * 边界（刻意不做，各自有主）：
 *   · 登记席位 → t3 的 `BindSeat`（本卡不知道要往哪条需求加席位，凭空写就是编造语义）；
 *   · 投递底稿 → t5 的跨窗口自署 kind 投递（本卡只开窗）。
 * 两件都不在本卡做，是为了不把「开窗」和「用窗」耦合在一个用例里。
 *
 * @module dsh-pmboard/application/use-cases/OpenWindow
 */
import type {
  OpenWindowOutcome,
  UseCaseDeps,
  WindowCreateOptions,
  WindowInheritance,
  WindowOpenerPort,
} from '../ports.js'
import { reject } from '../internal/support.js'
import { applyWindowInheritance, presetInheritanceOf, readWindowProfile } from '../internal/window-inherit.js'

export interface OpenWindowInput {
  /** fork = 带上下文（默认）；create = 全新空会话 */
  mode?: 'fork' | 'create'
  /** 仅 fork：切点（含）。缺省 = 最近一个完整回合 */
  atSeq?: number
  /**
   * 开窗后要投给新窗口的底稿正文（可选）。
   * 投递走**自署来源**（kind=`reqboard-open-window`）——绝不用会冒充人类的那个入口。
   */
  seedText?: string
  /**
   * 新窗口标题（可选；REQ-261005151245-54ae FR-1）。
   * 给了就用它（不递增、不加后缀）；不给则按源标题递增（「源标题 (1)」）。
   */
  title?: string
}

export interface OpenWindowValue {
  success: true
  /** 新窗口码（= 新会话 id） */
  window_key: string
  /** fork 时的源窗口；create 时缺省 */
  parent_session_id?: string
  mode: 'fork' | 'create'
  /** 继承回执（REQ-261005151245-54ae FR-5）：标题 / 模式 / 模型三态 + 只记 skipped/failed 的原因。 */
  inheritance: WindowInheritance
  /** 底稿投递结果（给了 `seedText` 才有；未给则整体省略）。 */
  delivery?: { delivered: boolean; kind: string; reason?: string }
  /** 诚实降级说明：**不含**「已经打开了窗口」这类断言，只说会话已创建、要去侧栏打开 */
  degraded_note: string
}

/**
 * 诚实降级文案（唯一来源）。措辞纪律：只承诺**我们真的做到了**的事——
 * 会话已创建、会出现在侧栏、本页可以切过去；**不承诺**「已经打开了新窗口」
 * （DSH 无 per-session URL 与导航推送，造不出并列窗口）。
 */
/** 底稿消息的自署来源（FR-7 红线：永不为 `user`）。 */
export const OPEN_WINDOW_SEED_KIND = 'reqboard-open-window'

export const OPEN_WINDOW_DEGRADED_NOTE =
  '会话已创建，请在侧栏打开（本页可切换到它）；本页不能替你开一个并列窗口。'

/**
 * 解析新会话的落点（REQ-261004150249-731e FR-1）——开窗与立项 handoff **共用同一条链**。
 *
 * 三级（前者优先）：
 *   ① 端口解析：源会话所属 workspace（`resolveSourceProject`；可选方法，测试替身可不实现）；
 *   ② 调用会话自己的工作目录：`exec.agent.session.header.cwd`；
 *   ③ 都没有 → `undefined` ⇒ 调用方**响亮失败**（`REQBOARD_OPEN_WINDOW_UNAVAILABLE`），
 *      且**不调用** `create`——绝不让「要在原项目里续作」的新窗口悄悄落到宿主目录
 *      （实测病灶：落进 `~/.dsh/profiles/desktop`，随后写盘被 `PROJECT_ROOT_MISMATCH` 拒）。
 *
 * 返回的 opts 直接交给 `WindowOpenerPort.create`（适配器负责「二者互斥、只取其一」）。
 */
export function resolveWindowCreateOptions(
  opener: WindowOpenerPort,
  source: string,
  exec: unknown,
): WindowCreateOptions | undefined {
  const fromProject = opener.resolveSourceProject?.(source)
  if (fromProject !== undefined) return fromProject
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: unknown } } } } | undefined)
    ?.agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) return { cwd }
  return undefined
}

/**
 * 开一个新窗口。
 *
 * 认证：必须由**执行窗口的 live driver** 调用（与其它 reqboard 工具同口径）；
 * 通道缺失或无完成回合时**响亮失败**，不返回假窗口码。
 */
export async function openWindow(
  deps: UseCaseDeps,
  input: OpenWindowInput,
  exec: unknown,
): Promise<OpenWindowValue> {
  // 归属与活体校验：拿不到窗口码就无从 fork（顺带挡住 subagent 等非直接窗口）。
  const source = deps.session.windowKey(exec)
  deps.session.requireLiveDriver(exec)

  const mode: 'fork' | 'create' = input.mode ?? 'fork'
  const opener = deps.windowOpener
  if (opener === undefined || !opener.available()) {
    reject(
      'reqboard_open_window 未执行：本宿主未装配会话开窗能力（sessionController.fork/create 不可得）',
      'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
    )
  }

  // REQ-261005151245-54ae FR-2：开窗前冷读一次源会话画像——标题 / 模式 / 模型都从这一次读里取。
  // 读不到**不阻断开窗**（记 reason，落定时如实报 failed）；create 路径还要用它随请求带上模式。
  const sourceRead = await readWindowProfile(opener, source)

  let outcome: OpenWindowOutcome
  if (mode === 'fork') {
    outcome = await opener.fork(source, input.atSeq)
  } else {
    // REQ-261004150249-731e FR-1：建全新会话前先解析**落点**——解析不出就响亮失败，
    // 且**不调用** create（绝不在宿主目录里静默建窗，那正是本需求要根治的病灶）。
    const target = resolveWindowCreateOptions(opener, source, exec)
    if (target === undefined) {
      reject(
        'reqboard_open_window 未执行：拿不到源会话的项目落点（workspace 与 cwd 都不可得），不在宿主目录里静默建窗',
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    // 模式（Agent 预设）随建会话请求带入（FR-3）；无读数则不传该键（不填 undefined 占位）。
    const preset = presetInheritanceOf(sourceRead, 'create').agentPreset
    outcome = await opener.create(preset === undefined ? target : { ...target, agentPreset: preset })
  }

  if (!outcome.ok) {
    // 「源会话没有完整回合」是**可预期**的拒绝：给一条可行动的出路（改用 mode=create）。
    if (outcome.code === 'unavailable_no_completed_turn') {
      reject(
        `reqboard_open_window 未执行：源会话没有可切分的完整回合，无法 fork（${outcome.reason}）。请改用 mode=create 建一个全新空会话`,
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    if (outcome.code === 'opener_unavailable') {
      reject(
        `reqboard_open_window 未执行：会话开窗能力不可用（${outcome.reason}）`,
        'REQBOARD_OPEN_WINDOW_UNAVAILABLE',
      )
    }
    reject(
      `reqboard_open_window 未执行：建会话失败（${outcome.reason}）`,
      'REQBOARD_OPEN_WINDOW_FAILED',
    )
  }

  // REQ-261005151245-54ae FR-1/FR-3/FR-4：落定继承三件（标题 → 模式 → 模型），**不短路**。
  // 放在投递之前：接管方先看到配置、再看到底稿；失败只记状态，绝不回滚会话、不改 success。
  const inheritance = await applyWindowInheritance(opener, {
    childKey: outcome.windowKey,
    mode,
    sourceRead,
    ...(input.title !== undefined ? { explicitTitle: input.title } : {}),
  })

  // 可选：把底稿投给新窗口（FR-7）。失败**不影响开窗成功**，但必须如实回报。
  let delivery: { delivered: boolean; kind: string; reason?: string } | undefined
  const seedText = input.seedText
  if (typeof seedText === 'string' && seedText.trim().length > 0) {
    const port = deps.crossWindowDeliver
    if (port === undefined) {
      delivery = { delivered: false, kind: OPEN_WINDOW_SEED_KIND, reason: '未装配跨窗口投递能力（crossWindowDeliver）' }
    } else {
      const { message } = port.createMessage({ text: seedText, kind: OPEN_WINDOW_SEED_KIND })
      const sent = await port.deliver(outcome.windowKey, message)
      delivery = { delivered: sent.delivered, kind: OPEN_WINDOW_SEED_KIND, ...(sent.reason !== undefined ? { reason: sent.reason } : {}) }
    }
  }

  return {
    success: true,
    window_key: outcome.windowKey,
    ...(outcome.parentSessionId !== undefined ? { parent_session_id: outcome.parentSessionId } : {}),
    mode,
    inheritance,
    degraded_note: OPEN_WINDOW_DEGRADED_NOTE,
    ...(delivery !== undefined ? { delivery } : {}),
  }
}
