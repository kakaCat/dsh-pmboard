/**
 * 开窗继承（REQ-261005151245-54ae FR-1 ~ FR-5）——「新窗口像源窗口」的全部判定与编排，**唯一一处**。
 *
 * 治什么：开窗过去只保证「会话建成、落在对的项目」——标题靠人改、模式与模型靠人重选，
 * 而且**不继承也不说**。本模块把这三件补齐，并把「没继承上」变成回执里看得见的三态。
 *
 * 分层与边界：
 *   · 本模块是 **application 层**：零 I/O、不 import 宿主包，宿主访问一律经 `WindowOpenerPort`；
 *   · 「逐字取源读数」的准确含义是**去首尾空白后逐字**（空串/纯空白一律按缺失，见 `textOf`）；
 *   · 除设计冻结的四个入口外，另导出 `normalizeWindowProfile` / `windowProfileFromProjectionValues`
 *     两个**归一单点**供适配器复用——避免"什么算有读数"在两处判定（复核建议 5 已留痕）；
 *   · 三个开窗入口（`reqboard_open_window` / `reqboard_handoff` 新建窗口 / 看板迁移开窗）
 *     都调这里，机制只有一份（本仓「两份真相必然漂移」的既有教训）。
 *
 * 三条纪律（与 `design/interfaces.md` 逐字对齐）：
 *   ① **不短路**：标题 / 模式 / 模型各试一次，一次性返回三项状态；
 *   ② **「读不到」≠「源没有」**：前者 `failed`（想做没做成），后者 `skipped`（本来就没有）；
 *   ③ **继承不改成败**：本模块只回状态，绝不让开窗失败（`success` 由建会话决定）。
 *
 * @module dsh-pmboard/application/internal/window-inherit
 */
import { fmt } from '../../domain/text/fmt.js'
import type {
  WindowInheritance,
  WindowInheritanceStatus,
  WindowModelSelection,
  WindowOpenerPort,
  WindowProfileRead,
  WindowSourceProfile,
} from '../ports.js'

/**
 * 半角后缀：`登录重构 (2)` → 末组 +1（括号与空格形态保持）。
 * 带 `u` 与逐字模板串是**故意的**：与宿主客户端 `increasedForkTitle` 的正则 / 拼法逐字一致，
 * 两处口径漂移会让同一源窗口分叉出两种命名风格（评审建议 6：连正则标志都对齐）。
 */
const ASCII_SUFFIX_RE = /^(.*?)\((\d+)\)$/u
/** 全角后缀：`登录重构（3）` → 末组 +1（括号形态保持全角）。 */
const FULLWIDTH_SUFFIX_RE = /^(.*?)（(\d+)）$/u

/**
 * 标题递增（FR-1）——与宿主客户端 `increasedForkTitle` **逐字同口径**
 * （`packages/api/session-controller/src/client/sessions/service.ts:131-141`）。
 *
 * 为什么必须逐字同口径：GUI 里人点「分支」得到的是「源标题 (1)」，插件开窗若另立一套命名，
 * 同一个源窗口就会分叉出两种风格的子窗口，人分不清谁是谁。
 *
 * 纯函数、零 I/O；**空串/纯空白由调用方拦下**（本函数不负责"要不要写"）——
 * `increasedWindowTitle('')` 会返回 `' (1)'`，那是调用方漏守卫的症状，不是本函数要兜的分支
 * （`applyWindowInheritance` 已在 `textOf` 之后才调它；评审建议 8）。
 */
export function increasedWindowTitle(title: string): string {
  const ascii = ASCII_SUFFIX_RE.exec(title)
  if (ascii?.[1] !== undefined && ascii[2] !== undefined) {
    return `${ascii[1]}(${BigInt(ascii[2]) + 1n})`
  }
  const fullWidth = FULLWIDTH_SUFFIX_RE.exec(title)
  if (fullWidth?.[1] !== undefined && fullWidth[2] !== undefined) {
    return `${fullWidth[1]}（${BigInt(fullWidth[2]) + 1n}）`
  }
  return `${title} (1)`
}

/** 原始错误的可读化（跨包 `instanceof` 不可靠，故读 `code` / `message` 两个字段）。 */
function reasonText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
    if (typeof code === 'string' && code.length > 0) return code
  }
  return String(error)
}

/** 非空字符串读数（空串 / 纯空白 / 非字符串一律按缺失——不写空标题、不传空串）。 */
function textOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** 模型读数归一：`provider` 与 `model` 都非空才算「有读数」（否则整个读数缺席）。 */
function selectionOf(raw: WindowModelSelection | undefined): WindowModelSelection | undefined {
  const provider = textOf(raw?.provider)
  const model = textOf(raw?.model)
  if (provider === undefined || model === undefined) return undefined
  const effort = textOf(raw?.reasoningEffort)
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
}

/**
 * 画像归一（**唯一一处**「什么算有读数」）——空串 / 纯空白 / 非字符串 / 非对象一律按缺失。
 *
 * 为什么导出级单点而不是各写一份：适配器要把宿主投影映射成画像，上层还要对端口返回值
 * 做一次防御性归一（测试替身可能不合契约）。两处各写一份判定必然漂移，而漂移的表现是
 * "某个字段有时被当读数、有时被当缺失"——最难查的一类不一致。
 */
export function normalizeWindowProfile(raw: unknown): WindowSourceProfile {
  if (raw === null || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const profile: WindowSourceProfile = {}
  const title = textOf(source['title'])
  const agentPreset = textOf(source['agentPreset'])
  const modelSelection = selectionOf(source['modelSelection'] as WindowModelSelection | undefined)
  if (title !== undefined) profile.title = title
  if (agentPreset !== undefined) profile.agentPreset = agentPreset
  if (modelSelection !== undefined) profile.modelSelection = modelSelection
  return profile
}

/**
 * 宿主投影值 → 画像（REQ-261005151245-54ae FR-2）——适配器 `readProfile` 的唯一映射口径。
 *
 * 与 `normalizeWindowProfile` 的差别只有一处：宿主 `values.modelSelection` 是
 * `{ lastUsed, next }`（投影对外形状），真正的读数在 `next`（`next = pending ?? lastUsed`）。
 */
export function windowProfileFromProjectionValues(values: unknown): WindowSourceProfile {
  if (values === null || typeof values !== 'object') return {}
  const raw = values as Record<string, unknown>
  const modelSelection = raw['modelSelection']
  const next = modelSelection !== null && typeof modelSelection === 'object'
    ? (modelSelection as Record<string, unknown>)['next']
    : undefined
  return normalizeWindowProfile({
    title: raw['title'],
    agentPreset: raw['agentPreset'],
    modelSelection: next,
  })
}

/**
 * 读源会话画像（FR-2）——**本函数永不抛**：读不到就把原因收进 `reason`，让上层能如实回报。
 *
 * 端口方法缺失（旧装配 / 测试替身）、宿主抛错、**以及不合契约的非对象返回值**都归 `reason`
 * （三项按「读不到」记 `failed`）；只有"读成功但三项都没读数"才是空画像（三项各自 `skipped`）。
 * 这条分界是本模块的铁律：把读失败报成 `skipped` 等于替宿主断言"源窗口没有这项"——编造。
 */
export async function readWindowProfile(
  opener: WindowOpenerPort,
  sessionId: string,
): Promise<WindowProfileRead> {
  try {
    if (opener?.readProfile === undefined) {
      return { reason: '未装配读画像能力（readProfile）' }
    }
    const raw = await opener.readProfile(sessionId)
    // 非对象返回值**按「读不到」处理**，不按「源没有」——端口契约要求「读不到就抛」，
    // 不合契约的替身返回 undefined / null 时，替它断言"源窗口没有这项"就是编造（复核阻断 1）。
    if (raw === null || typeof raw !== 'object') {
      return { reason: '读画像失败：读画像未返回画像（readProfile 应抛错或返回对象）' }
    }
    return { profile: normalizeWindowProfile(raw) }
  } catch (error: unknown) {
    return { reason: fmt('读画像失败：{why}', { why: reasonText(error) }) }
  }
}

/**
 * 模式（Agent 预设）三态（FR-3，纯函数、不做 I/O）。
 *
 * 为什么不在这里调端口：`create` 路径的预设**随建会话请求体带入**（宿主原生支持），
 * `fork` 路径由宿主按源会话 observation 继承——两条路都不需要额外一次写调用
 * （需求 NFR：附加宿主调用 ≤3 次）。
 *
 * 返回值里的 `agentPreset` 只在 `create` 时回带：调用方拿它拼建会话请求体（唯一真相），
 * `fork` 不回带——宿主已经继承，调用方不该重复设。
 */
export function presetInheritanceOf(
  read: WindowProfileRead,
  mode: 'fork' | 'create',
): { status: WindowInheritanceStatus; reason?: string; agentPreset?: string } {
  if (read.profile === undefined) {
    return {
      status: 'failed',
      reason: fmt('源会话画像不可得——{why}', { why: read.reason ?? '原因未知' }),
    }
  }
  const agentPreset = textOf(read.profile.agentPreset)
  if (agentPreset === undefined) {
    return { status: 'skipped', reason: '源会话未登记 Agent 预设' }
  }
  // `create`：把预设**回带**给调用方（它必须进建会话请求体）；`fork`：宿主继承，不回带。
  // 这样"哪条路怎么带过去"只有一个真相，调用方也不必再读一次 profile（复核建议 4）。
  return { status: 'set', ...(mode === 'create' ? { agentPreset } : {}) }
}

/** `applyWindowInheritance` 入参。 */
export interface InheritWindowArgs {
  /** 子会话（新窗口码）。 */
  childKey: string
  mode: 'fork' | 'create'
  /** `readWindowProfile` 的结果（读画像只做一次，模式三态由它推得）。 */
  sourceRead: WindowProfileRead
  /** 显式标题（工具入参 `title` / 迁移开窗的语义名）；trim 后非空才生效。 */
  explicitTitle?: string
}

/**
 * 落定三步（标题 → 模式 → 模型）并合成回执（FR-1 / FR-3 / FR-4 / FR-5）。
 *
 * 顺序即语义：标题先落、模型后落，`reasons` 的条目顺序与之一致；三步**互不短路**。
 * 每一步失败都只影响该项状态：窗口已经建成，继承没写成不该把窗口判死。
 */
export async function applyWindowInheritance(
  opener: WindowOpenerPort,
  args: InheritWindowArgs,
): Promise<WindowInheritance> {
  const { childKey, mode, sourceRead } = args
  const profile = sourceRead.profile
  const reasons: string[] = []

  // ── ① 标题 ────────────────────────────────────────────────────────────────
  const explicit = textOf(args.explicitTitle)
  const sourceTitle = textOf(profile?.title)
  const wantTitle = explicit ?? (sourceTitle === undefined ? undefined : increasedWindowTitle(sourceTitle))
  let title: WindowInheritanceStatus
  if (wantTitle !== undefined) {
    if (opener.rename === undefined) {
      title = 'failed'
      reasons.push('标题：未装配写标题能力（rename）')
    } else {
      try {
        await opener.rename(childKey, wantTitle)
        title = 'set'
      } catch (error: unknown) {
        title = 'failed'
        reasons.push(fmt('标题：写标题失败：{why}', { why: reasonText(error) }))
      }
    }
  } else if (profile === undefined) {
    title = 'failed'
    reasons.push(fmt('标题：源会话画像不可得——{why}', { why: sourceRead.reason ?? '原因未知' }))
  } else {
    title = 'skipped'
    reasons.push('标题：源会话无标题')
  }

  // ── ② 模式（Agent 预设）────────────────────────────────────────────────────
  const preset = presetInheritanceOf(sourceRead, mode)
  if (preset.status !== 'set') reasons.push(fmt('模式：{why}', { why: preset.reason ?? '未继承' }))

  // ── ③ 模型 ────────────────────────────────────────────────────────────────
  const selection = selectionOf(profile?.modelSelection)
  let model: WindowInheritanceStatus
  if (selection !== undefined) {
    if (opener.selectModel === undefined) {
      model = 'failed'
      reasons.push('模型：未装配设模型能力（selectModel）')
    } else {
      try {
        await opener.selectModel(childKey, selection)
        model = 'set'
      } catch (error: unknown) {
        model = 'failed'
        reasons.push(fmt('模型：设模型失败：{why}', { why: reasonText(error) }))
      }
    }
  } else if (profile === undefined) {
    model = 'failed'
    reasons.push(fmt('模型：源会话画像不可得——{why}', { why: sourceRead.reason ?? '原因未知' }))
  } else {
    model = 'skipped'
    reasons.push('模型：源会话无模型选择读数')
  }

  return { title, preset: preset.status, model, reasons }
}
