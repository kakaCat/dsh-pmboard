/**
 * 开窗继承（REQ-261005151245-54ae）——纯函数 / 落定编排 / 适配器 / 三入口 / 兼容的唯一用例集。
 *
 * serves: REQ-261005151245-54ae FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
 *
 * 钉四件事：
 *  ① **标题口径**与 GUI 的 `increasedForkTitle` 逐字同口径（半角 / 全角递增，无后缀追加 `(1)`）；
 *  ② **「读不到」≠「源没有」**：画像读不到 → 三项 `failed`；源侧没这项读数 → 该项 `skipped`；
 *  ③ **不短路**：标题写失败不影响模型继承，反之亦然；继承失败**不改变**开窗成败；
 *  ④ 端口方法未装配（旧装配 / 测试替身）→ 走 `failed` + 原因，**不伪造成功**。
 *
 * 用例编号 T-01~T-15 属**入口级**（`openWindow` / `handoffOwner` / `openMigrationWindow`），
 * 在本文件后续分组里落地；本分组覆盖纯函数与编排（T 编号不适用）。
 */
import { describe, it, expect } from 'vitest'
import {
  applyWindowInheritance,
  increasedWindowTitle,
  presetInheritanceOf,
  readWindowProfile,
} from '../src/application/internal/window-inherit.js'
import { SessionWindowOpener } from '../src/adapters/SessionWindowOpener.js'
import { openWindow } from '../src/application/use-cases/OpenWindow.js'
import type { UseCaseDeps, WindowModelSelection, WindowOpenerPort, WindowSourceProfile } from '../src/application/ports.js'

const CHILD = 'session-child-0001'
const SOURCE = 'session-source-0001'

interface PortCalls {
  rename: { sessionId: string; title: string }[]
  selectModel: { sessionId: string; selection: WindowModelSelection }[]
  readProfile: string[]
  create: { cwd?: string; workspaceId?: string; agentPreset?: string }[]
}

interface FakePortOptions {
  /** 画像读数；`throw` 表示宿主抛错；缺省 = 不实现 readProfile 方法 */
  profile?: WindowSourceProfile | (() => WindowSourceProfile)
  profileThrows?: unknown
  renameThrows?: unknown
  selectModelThrows?: unknown
  /** 三个新方法是否装配（false = 旧装配 / 测试替身只有 fork、create） */
  withNewMethods?: boolean
  /** 落点解析（create 路径先解析落点；缺省 = 不给 resolveSourceProject） */
  workspaceId?: string
  /** 新建窗口码（缺省 CHILD） */
  createId?: string
}

/** 假端口：记录调用入参；只实现用例真正用到的方法。 */
function fakePort(opts: FakePortOptions = {}): { port: WindowOpenerPort; calls: PortCalls } {
  const calls: PortCalls = { rename: [], selectModel: [], readProfile: [], create: [] }
  const port: WindowOpenerPort = {
    available: () => true,
    fork: async () => ({ ok: true, windowKey: CHILD, parentSessionId: SOURCE }),
    create: async (req) => {
      calls.create.push({ ...(req ?? {}) })
      return { ok: true, windowKey: opts.createId ?? CHILD }
    },
  }
  if (opts.workspaceId !== undefined) {
    port.resolveSourceProject = () => ({ workspaceId: opts.workspaceId })
  }
  if (opts.withNewMethods !== false) {
    port.rename = async (sessionId, title) => {
      calls.rename.push({ sessionId, title })
      if (opts.renameThrows !== undefined) throw opts.renameThrows
    }
    port.selectModel = async (sessionId, selection) => {
      calls.selectModel.push({ sessionId, selection })
      if (opts.selectModelThrows !== undefined) throw opts.selectModelThrows
    }
    if (opts.profileThrows !== undefined) {
      port.readProfile = async (sessionId) => {
        calls.readProfile.push(sessionId)
        throw opts.profileThrows
      }
    } else if (opts.profile !== undefined) {
      port.readProfile = async (sessionId) => {
        calls.readProfile.push(sessionId)
        return typeof opts.profile === 'function' ? opts.profile() : opts.profile ?? {}
      }
    }
  }
  return { port, calls }
}

/** 用例级 deps：只给 openWindow 真正用到的两项（会话探针 + 开窗端口）。 */
function useCaseDeps(port: WindowOpenerPort): UseCaseDeps {
  return {
    session: { windowKey: () => SOURCE, requireLiveDriver: () => undefined },
    windowOpener: port,
  } as unknown as UseCaseDeps
}

const FULL_PROFILE: WindowSourceProfile = {
  title: '登录重构',
  agentPreset: 'cordis',
  modelSelection: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
}

describe('increasedWindowTitle（FR-1 标题递增口径）', () => {
  it('无后缀 → 追加半角括号 (1)', () => {
    expect(increasedWindowTitle('登录重构')).toBe('登录重构 (1)')
  })

  it('半角后缀 (2) → 末组 +1（T-02）', () => {
    expect(increasedWindowTitle('登录重构 (2)')).toBe('登录重构 (3)')
  })

  it('全角后缀 （3） → 末组 +1 且括号形态保持全角（T-03）', () => {
    expect(increasedWindowTitle('登录重构（3）')).toBe('登录重构（4）')
  })

  it('非数字括号不算后缀 → 整体追加 (1)', () => {
    expect(increasedWindowTitle('登录重构 (abc)')).toBe('登录重构 (abc) (1)')
  })

  it('与 GUI 口径一致的大序号不丢精度（BigInt 递增）', () => {
    expect(increasedWindowTitle('登录重构 (9007199254740993)')).toBe('登录重构 (9007199254740994)')
  })
})

describe('readWindowProfile（FR-2 冷读画像，永不抛）', () => {
  it('端口未实现 readProfile → reason 指「未装配读画像能力」', async () => {
    const { port } = fakePort({ withNewMethods: false })
    expect(await readWindowProfile(port, SOURCE)).toEqual({ reason: '未装配读画像能力（readProfile）' })
  })

  it('不合契约的替身返回 undefined / null → 按「读不到」处理（不报成「源没有」）', async () => {
    const undefinedPort = { available: () => true, fork: async () => ({ ok: true, windowKey: CHILD }), create: async () => ({ ok: true, windowKey: CHILD }), readProfile: async () => undefined } as unknown as WindowOpenerPort
    expect(await readWindowProfile(undefinedPort, SOURCE))
      .toEqual({ reason: '读画像失败：读画像未返回画像（readProfile 应抛错或返回对象）' })
    const nullPort = { ...undefinedPort, readProfile: async () => null } as unknown as WindowOpenerPort
    expect(await readWindowProfile(nullPort, SOURCE))
      .toEqual({ reason: '读画像失败：读画像未返回画像（readProfile 应抛错或返回对象）' })
    // 借同一条路径锁「读不到 → 三项 failed」：不许被报成 skipped
    const inheritance = await applyWindowInheritance(nullPort, {
      childKey: CHILD, mode: 'create',
      sourceRead: await readWindowProfile(nullPort, SOURCE),
    })
    expect([inheritance.title, inheritance.preset, inheritance.model]).toEqual(['failed', 'failed', 'failed'])
  })

  it('宿主抛错 → reason 收进原文（不抛）', async () => {
    const { port } = fakePort({ profileThrows: new Error('boom') })
    expect(await readWindowProfile(port, SOURCE)).toEqual({ reason: '读画像失败：boom' })
  })

  it('空串 / 纯空白 / 非字符串一律按缺失（画像里不出现空值键）', async () => {
    const { port } = fakePort({
      profile: { title: '   ', agentPreset: '', modelSelection: undefined } as WindowSourceProfile,
    })
    expect(await readWindowProfile(port, SOURCE)).toStrictEqual({ profile: {} })
  })

  it('三项读数齐全 → 归一后原样带出（含 reasoningEffort）', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE })
    expect(await readWindowProfile(port, SOURCE)).toEqual({ profile: FULL_PROFILE })
  })

  it('模型读数缺 provider / model 任一项 → 整个模型读数缺席', async () => {
    const { port } = fakePort({ profile: { modelSelection: { provider: '', model: 'x' } } })
    expect(await readWindowProfile(port, SOURCE)).toEqual({ profile: {} })
  })
})

describe('presetInheritanceOf（FR-3 模式三态，纯函数）', () => {
  it('画像有预设 + create → set，并**回带** preset 供建会话请求使用', () => {
    expect(presetInheritanceOf({ profile: { agentPreset: 'cordis' } }, 'create'))
      .toEqual({ status: 'set', agentPreset: 'cordis' })
  })

  it('画像有预设 + fork → set，但**不回带**（预设由宿主继承，调用方不该重复设）', () => {
    expect(presetInheritanceOf({ profile: { agentPreset: 'cordis' } }, 'fork'))
      .toEqual({ status: 'set' })
  })

  it('画像读到但无预设 → skipped + 原因', () => {
    expect(presetInheritanceOf({ profile: {} }, 'create'))
      .toEqual({ status: 'skipped', reason: '源会话未登记 Agent 预设' })
  })

  it('画像读不到 → failed（不是 skipped）+ 读失败原因', () => {
    expect(presetInheritanceOf({ reason: '读画像失败：boom' }, 'create'))
      .toEqual({ status: 'failed', reason: '源会话画像不可得——读画像失败：boom' })
  })
})

describe('applyWindowInheritance（FR-1/FR-3/FR-4/FR-5 落定编排）', () => {
  it('显式标题优先：不递增、不加后缀（T-04 口径）', async () => {
    const { port, calls } = fakePort({ profile: FULL_PROFILE })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: FULL_PROFILE }, explicitTitle: '台账迁移窗口',
    })
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '台账迁移窗口' }])
    expect(inheritance).toEqual({ title: 'set', preset: 'set', model: 'set', reasons: [] })
  })

  it('源标题递增：登录重构 (2) → 登录重构 (3)（T-02 口径）', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构 (2)' } })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: { title: '登录重构 (2)' } },
    })
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构 (3)' }])
    expect(inheritance.title).toBe('set')
  })

  it('源无标题（画像读到空对象）→ 不调 rename，title skipped + 原因', async () => {
    const { port, calls } = fakePort({ profile: {} })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'create', sourceRead: { profile: {} },
    })
    expect(calls.rename).toEqual([])
    expect(inheritance).toEqual({
      title: 'skipped',
      preset: 'skipped',
      model: 'skipped',
      reasons: ['标题：源会话无标题', '模式：源会话未登记 Agent 预设', '模型：源会话无模型选择读数'],
    })
  })

  it('画像读不到 → 三项皆 failed（读不到 ≠ 源没有），且开窗本身不受影响', async () => {
    const { port, calls } = fakePort({ profileThrows: new Error('boom') })
    const sourceRead = await readWindowProfile(port, SOURCE)
    const inheritance = await applyWindowInheritance(port, { childKey: CHILD, mode: 'create', sourceRead })
    expect(calls.rename).toEqual([])
    expect(calls.selectModel).toEqual([])
    expect(inheritance.title).toBe('failed')
    expect(inheritance.preset).toBe('failed')
    expect(inheritance.model).toBe('failed')
    expect(inheritance.reasons).toEqual([
      '标题：源会话画像不可得——读画像失败：boom',
      '模式：源会话画像不可得——读画像失败：boom',
      '模型：源会话画像不可得——读画像失败：boom',
    ])
  })

  it('画像读不到但给了显式标题 → 标题照常落定，模式与模型仍 failed', async () => {
    const { port, calls } = fakePort({ profileThrows: new Error('boom') })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'create', sourceRead: { reason: '读画像失败：boom' }, explicitTitle: '台账迁移窗口',
    })
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '台账迁移窗口' }])
    expect(inheritance).toEqual({
      title: 'set',
      preset: 'failed',
      model: 'failed',
      reasons: [
        '模式：源会话画像不可得——读画像失败：boom',
        '模型：源会话画像不可得——读画像失败：boom',
      ],
    })
  })

  it('rename 抛错 → title failed 但 model 仍 set（不短路，T-11 口径）', async () => {
    const { port, calls } = fakePort({ profile: FULL_PROFILE, renameThrows: new Error('rename denied') })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: FULL_PROFILE },
    })
    expect(inheritance.title).toBe('failed')
    expect(inheritance.model).toBe('set')
    expect(inheritance.reasons).toEqual(['标题：写标题失败：rename denied'])
    expect(calls.selectModel).toHaveLength(1)
  })

  it('selectModel 抛错 → model failed 但 title 仍 set（不短路，T-12 口径）', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE, selectModelThrows: new Error('model denied') })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: FULL_PROFILE },
    })
    expect(inheritance.title).toBe('set')
    expect(inheritance.model).toBe('failed')
    expect(inheritance.reasons).toEqual(['模型：设模型失败：model denied'])
  })

  it('读画像能力缺失（旧装配 / 测试替身）→ 三项 failed + 「未装配读画像能力」原因', async () => {
    const { port } = fakePort({ withNewMethods: false })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'create', sourceRead: { reason: '未装配读画像能力（readProfile）' },
    })
    expect(inheritance).toEqual({
      title: 'failed',
      preset: 'failed',
      model: 'failed',
      reasons: [
        '标题：源会话画像不可得——未装配读画像能力（readProfile）',
        '模式：源会话画像不可得——未装配读画像能力（readProfile）',
        '模型：源会话画像不可得——未装配读画像能力（readProfile）',
      ],
    })
  })

  it('模型读数缺 reasoningEffort → selectModel 入参不含该键，且标题仍落定', async () => {
    const profile: WindowSourceProfile = {
      title: '登录重构',
      agentPreset: 'standard',
      modelSelection: { provider: 'deepseek', model: 'deepseek-chat' },
    }
    const { port, calls } = fakePort({ profile })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'create', sourceRead: { profile },
    })
    expect(calls.selectModel).toStrictEqual([
      { sessionId: CHILD, selection: { provider: 'deepseek', model: 'deepseek-chat' } },
    ])
    expect(calls.selectModel[0]!.selection).not.toHaveProperty('reasoningEffort')
    expect(inheritance).toEqual({ title: 'set', preset: 'set', model: 'set', reasons: [] })
  })

  it('只缺写标题能力（rename 未装配）→ 标题 failed 且文案点名 rename，模型照常继承', async () => {
    const { port, calls } = fakePort({ profile: FULL_PROFILE })
    delete (port as { rename?: unknown }).rename
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: FULL_PROFILE },
    })
    expect(inheritance.title).toBe('failed')
    expect(inheritance.model).toBe('set')
    expect(inheritance.reasons).toEqual(['标题：未装配写标题能力（rename）'])
    expect(calls.selectModel).toHaveLength(1)
  })

  it('只缺设模型能力（selectModel 未装配）→ 模型 failed 且文案点名 selectModel，标题照常落定', async () => {
    const { port, calls } = fakePort({ profile: FULL_PROFILE })
    delete (port as { selectModel?: unknown }).selectModel
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: FULL_PROFILE },
    })
    expect(inheritance.model).toBe('failed')
    expect(inheritance.title).toBe('set')
    expect(inheritance.reasons).toEqual(['模型：未装配设模型能力（selectModel）'])
    expect(calls.rename).toHaveLength(1)
  })

  it('显式标题为纯空白 → 视为未传，回退到源标题递增', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' } })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: { title: '登录重构' } }, explicitTitle: '   ',
    })
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构 (1)' }])
    expect(inheritance.title).toBe('set')
  })

  it('非字符串字段与空串推理档一律按缺失（不写空标题、不带空推理档）', async () => {
    const { port } = fakePort({
      profile: { title: 42, modelSelection: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: '  ' } } as unknown as WindowSourceProfile,
    })
    expect(await readWindowProfile(port, SOURCE)).toStrictEqual({
      profile: { modelSelection: { provider: 'deepseek', model: 'deepseek-chat' } },
    })
  })

  it('画像与原因都缺（调用方误传空对象）→ 三项 failed + 原因未知（不静默）', async () => {
    const { port } = fakePort()
    const inheritance = await applyWindowInheritance(port, { childKey: CHILD, mode: 'create', sourceRead: {} })
    expect([inheritance.title, inheritance.preset, inheritance.model]).toEqual(['failed', 'failed', 'failed'])
    expect(inheritance.reasons[0]).toBe('标题：源会话画像不可得——原因未知')
  })

  it('源无模型读数（next 为 null 归一成缺席）→ 不调 selectModel，model skipped', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' } })
    const inheritance = await applyWindowInheritance(port, {
      childKey: CHILD, mode: 'fork', sourceRead: { profile: { title: '登录重构' } },
    })
    expect(calls.selectModel).toEqual([])
    expect(inheritance).toEqual({
      title: 'set',
      preset: 'skipped',
      model: 'skipped',
      reasons: ['模式：源会话未登记 Agent 预设', '模型：源会话无模型选择读数'],
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 适配器口径：假宿主服务（断言"到底调了宿主什么、传了什么"）
// ─────────────────────────────────────────────────────────────────────────────

interface HostCalls {
  projections: { sessionId: string }[]
  rename: { sessionId: string; title: string }[]
  selectModel: { sessionId: string; provider: string; model: string; reasoningEffort?: string }[]
  create: { cwd?: string; workspaceId?: string; agentPreset?: string }[]
}

interface FakeHostOptions {
  values?: unknown
  /** `projections` 返回 null（会话不存在） */
  projectionsNull?: boolean
  projectionsThrows?: unknown
  renameThrows?: unknown
  selectModelThrows?: unknown
  createId?: string
  /** 完全不装配服务（resolveService 返回 undefined） */
  noService?: boolean
}

function fakeHost(opts: FakeHostOptions = {}): { opener: SessionWindowOpener; calls: HostCalls } {
  const calls: HostCalls = { projections: [], rename: [], selectModel: [], create: [] }
  const service = {
    projections: async (request: { sessionId: string }) => {
      calls.projections.push(request)
      if (opts.projectionsThrows !== undefined) throw opts.projectionsThrows
      if (opts.projectionsNull === true) return null
      return { values: opts.values ?? {} }
    },
    rename: async (request: { sessionId: string; title: string }) => {
      calls.rename.push(request)
      if (opts.renameThrows !== undefined) throw opts.renameThrows
      return { title: request.title, seq: 1 }
    },
    selectModel: async (request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }) => {
      calls.selectModel.push(request)
      if (opts.selectModelThrows !== undefined) throw opts.selectModelThrows
      return { selected: { provider: request.provider, model: request.model } }
    },
    create: async (request?: { cwd?: string; workspaceId?: string; agentPreset?: string }) => {
      calls.create.push(request ?? {})
      return { sessionId: opts.createId ?? CHILD }
    },
  }
  const opener = new SessionWindowOpener(
    () => (opts.noService === true ? undefined : service),
  )
  return { opener, calls }
}

describe('SessionWindowOpener 三个新方法（FR-1/FR-2/FR-4 适配器口径）', () => {
  it('readProfile：一次 projections 读全三样，模型取投影的 next', async () => {
    const { opener, calls } = fakeHost({
      values: {
        title: '登录重构',
        agentPreset: 'cordis',
        modelSelection: { lastUsed: { provider: 'deepseek', model: 'old' }, next: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' } },
      },
    })
    const profile = await opener.readProfile(SOURCE)
    expect(calls.projections).toEqual([{ sessionId: SOURCE }])
    expect(profile).toEqual({
      title: '登录重构',
      agentPreset: 'cordis',
      modelSelection: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    })
  })

  it('readProfile：只有 lastUsed 没有 next → 模型读数缺席（不拿旧值冒充）', async () => {
    const { opener } = fakeHost({
      values: { title: '登录重构', modelSelection: { lastUsed: { provider: 'deepseek', model: 'old' }, next: null } },
    })
    expect(await opener.readProfile(SOURCE)).toEqual({ title: '登录重构' })
  })

  it('readProfile：空串与缺键一律按缺失，读成功但三项都缺 → 空对象', async () => {
    const { opener } = fakeHost({ values: { title: '   ', agentPreset: '', modelSelection: undefined } })
    expect(await opener.readProfile(SOURCE)).toEqual({})
  })

  it('readProfile：宿主返回 null（会话不存在）→ 抛错（不静默返回空画像）', async () => {
    const { opener } = fakeHost({ projectionsNull: true })
    await expect(opener.readProfile(SOURCE)).rejects.toThrow(/投影不可读/)
  })

  it('readProfile：宿主抛错 → 原样抛出（保 code 与 message）', async () => {
    const boom = Object.assign(new Error('gateway/internal'), { code: 'gateway/internal' })
    const { opener } = fakeHost({ projectionsThrows: boom })
    await expect(opener.readProfile(SOURCE)).rejects.toThrow('gateway/internal')
  })

  it('readProfile：服务未装配 → 抛错指名 projections 不可用', async () => {
    const { opener } = fakeHost({ noService: true })
    await expect(opener.readProfile(SOURCE)).rejects.toThrow(/sessionController\.projections 不可用/)
  })

  it('rename：入参原样透传 {sessionId, title}；宿主抛错原样抛', async () => {
    const { opener, calls } = fakeHost({ renameThrows: new Error('title invalid') })
    await expect(opener.rename(CHILD, '登录重构 (1)')).rejects.toThrow('title invalid')
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构 (1)' }])
  })

  it('selectModel：有 reasoningEffort 时带上，缺省时该键不存在（不填 undefined）', async () => {
    const { opener, calls } = fakeHost()
    await opener.selectModel(CHILD, { provider: 'deepseek', model: 'deepseek-chat' })
    expect(calls.selectModel).toHaveLength(1)
    expect(calls.selectModel[0]).toEqual({ sessionId: CHILD, provider: 'deepseek', model: 'deepseek-chat' })
    expect(calls.selectModel[0]).not.toHaveProperty('reasoningEffort')
    await opener.selectModel(CHILD, { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' })
    expect(calls.selectModel[1]).toEqual({
      sessionId: CHILD, provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high',
    })
  })

  it('create：agentPreset 与落点同请求且不互斥；无预设时该键缺席', async () => {
    const { opener, calls } = fakeHost()
    await opener.create({ workspaceId: 'w1', agentPreset: 'cordis' })
    expect(calls.create[0]).toEqual({ workspaceId: 'w1', agentPreset: 'cordis' })
    await opener.create({ workspaceId: 'w1' })
    expect(calls.create[1]).toEqual({ workspaceId: 'w1' })
    expect(calls.create[1]).not.toHaveProperty('agentPreset')
    await opener.create()
    expect(calls.create[2]).toEqual({})
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 用例级（openWindow）：T-01~T-14 —— 开窗这条链上"到底继承了什么、报了什么"
// ─────────────────────────────────────────────────────────────────────────────

describe('openWindow 开窗继承（T-01~T-14）', () => {
  it('T-01 fork + 源标题「登录重构」→ 子标题「登录重构 (1)」，回执 title=set', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' } })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构 (1)' }])
    expect(out.inheritance.title).toBe('set')
    expect(out.window_key).toBe(CHILD)
  })

  it('T-02 源标题「登录重构 (2)」→ 子标题「登录重构 (3)」', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构 (2)' } })
    await openWindow(useCaseDeps(port), {}, {})
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构 (3)' }])
  })

  it('T-03 源标题全角「登录重构（3）」→ 子标题「登录重构（4）」', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构（3）' } })
    await openWindow(useCaseDeps(port), {}, {})
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '登录重构（4）' }])
  })

  it('T-04 显式 title 覆盖递增口径（恰为给定值，不加后缀）', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' } })
    const out = await openWindow(useCaseDeps(port), { title: '台账迁移窗口' }, {})
    expect(calls.rename).toEqual([{ sessionId: CHILD, title: '台账迁移窗口' }])
    expect(out.inheritance.title).toBe('set')
  })

  it('T-05 画像读到空对象（源无标题）→ 不写标题，title=skipped + 原因', async () => {
    const { port, calls } = fakePort({ profile: {} })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(calls.rename).toEqual([])
    expect(out.inheritance.title).toBe('skipped')
    expect(out.inheritance.reasons).toContain('标题：源会话无标题')
  })

  it('T-06 create + 源有模式 → 请求体带 agentPreset（与落点同请求）', async () => {
    const { port, calls } = fakePort({ profile: { agentPreset: 'cordis' }, workspaceId: 'w1' })
    const out = await openWindow(useCaseDeps(port), { mode: 'create' }, {})
    expect(calls.create).toEqual([{ workspaceId: 'w1', agentPreset: 'cordis' }])
    expect(out.inheritance.preset).toBe('set')
  })

  it('T-07 create + 源无模式 → 请求体不含该键（不是 undefined 占位），preset=skipped', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' }, workspaceId: 'w1' })
    const out = await openWindow(useCaseDeps(port), { mode: 'create' }, {})
    expect(calls.create).toHaveLength(1)
    expect(calls.create[0]).toEqual({ workspaceId: 'w1' })
    expect(calls.create[0]).not.toHaveProperty('agentPreset')
    expect(out.inheritance.preset).toBe('skipped')
  })

  it('T-08 源有模型读数（含推理档）→ selectModel 入参逐字相等，model=set', async () => {
    const selection = { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' }
    const { port, calls } = fakePort({ profile: { title: '登录重构', modelSelection: selection } })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(calls.selectModel).toEqual([{ sessionId: CHILD, selection }])
    expect(out.inheritance.model).toBe('set')
  })

  it('T-09 源无模型读数 → 不调 selectModel，model=skipped', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构' } })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(calls.selectModel).toEqual([])
    expect(out.inheritance.model).toBe('skipped')
  })

  it('T-10 画像读不到 → 开窗仍成功，三项皆 failed 且 reasons 按「标题/模式/模型」顺序', async () => {
    const { port } = fakePort({ profileThrows: new Error('boom') })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.success).toBe(true)
    expect(out.window_key).toBe(CHILD)
    expect([out.inheritance.title, out.inheritance.preset, out.inheritance.model]).toEqual(['failed', 'failed', 'failed'])
    expect(out.inheritance.reasons).toEqual([
      '标题：源会话画像不可得——读画像失败：boom',
      '模式：源会话画像不可得——读画像失败：boom',
      '模型：源会话画像不可得——读画像失败：boom',
    ])
  })

  it('T-11 rename 抛错 → title=failed 但 model 仍 set（不短路），开窗成功', async () => {
    const { port, calls } = fakePort({ profile: FULL_PROFILE, renameThrows: new Error('rename denied') })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.success).toBe(true)
    expect(out.inheritance.title).toBe('failed')
    expect(out.inheritance.model).toBe('set')
    expect(calls.selectModel).toHaveLength(1)
  })

  it('T-12 selectModel 抛错 → model=failed 但 title 仍 set，开窗成功', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE, selectModelThrows: new Error('model denied') })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.success).toBe(true)
    expect(out.inheritance.title).toBe('set')
    expect(out.inheritance.model).toBe('failed')
    expect(out.inheritance.reasons).toEqual(['模型：设模型失败：model denied'])
  })

  it('T-13 端口只有 fork/create（旧装配）→ 读画像能力缺失，开窗成功且三项 failed（另两条「未装配写标题/设模型」文案由编排组直接覆盖）', async () => {
    const { port } = fakePort({ withNewMethods: false })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.success).toBe(true)
    expect(out.inheritance).toEqual({
      title: 'failed',
      preset: 'failed',
      model: 'failed',
      reasons: [
        '标题：源会话画像不可得——未装配读画像能力（readProfile）',
        '模式：源会话画像不可得——未装配读画像能力（readProfile）',
        '模型：源会话画像不可得——未装配读画像能力（readProfile）',
      ],
    })
  })

  it('T-14 fork 路径：预设由宿主继承（不再额外读一次子会话）', async () => {
    const { port, calls } = fakePort({ profile: { title: '登录重构', agentPreset: 'cordis' } })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.mode).toBe('fork')
    expect(out.inheritance.preset).toBe('set')
    expect(calls.readProfile).toEqual([SOURCE])
  })

  it('回归：既有回执键逐字不变（degraded_note 仍只承诺「把会话建出来」）', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.degraded_note).toContain('请在侧栏打开')
    expect(out.degraded_note).not.toContain('已打开')
    // fork 路径照旧带 parent_session_id（指向源窗口），键名与语义都没动
    expect(out.parent_session_id).toBe(SOURCE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 兼容（REQ-261005151245-54ae FR-5/FR-6）：旧调用方与旧测试替身都不该被这次改动弄坏
// ─────────────────────────────────────────────────────────────────────────────

describe('兼容（旧调用方 / 旧测试替身 / 旧回执键）', () => {
  it('旧测试替身只有 fork、create → 开窗照旧成功，继承三项 failed 且不改成败', async () => {
    const { port, calls } = fakePort({ withNewMethods: false })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(out.success).toBe(true)
    expect(out.window_key).toBe(CHILD)
    expect([out.inheritance.title, out.inheritance.preset, out.inheritance.model]).toEqual(['failed', 'failed', 'failed'])
    expect(calls.rename).toEqual([])
    expect(calls.selectModel).toEqual([])
  })

  it('旧回执键逐字不变：fork 路径只多了 inheritance 一个键', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE })
    const out = await openWindow(useCaseDeps(port), {}, {})
    expect(Object.keys(out).sort()).toEqual([
      'degraded_note',
      'inheritance',
      'mode',
      'parent_session_id',
      'success',
      'window_key',
    ])
    expect(out.degraded_note).toContain('请在侧栏打开')
    expect(out.degraded_note).not.toContain('已打开')
  })

  it('底稿投递键仍在投递时出现（新键不挤掉旧键）', async () => {
    const { port } = fakePort({ profile: FULL_PROFILE })
    const deps = {
      ...useCaseDeps(port),
      crossWindowDeliver: {
        createMessage: (p: { text: string; kind: string }) => ({ messageId: 'm-1', message: { p } }),
        deliver: async () => ({ delivered: true }),
      },
    } as unknown as UseCaseDeps
    const out = await openWindow(deps, { seedText: '接着干' }, {})
    expect(Object.keys(out).sort()).toEqual([
      'degraded_note',
      'delivery',
      'inheritance',
      'mode',
      'parent_session_id',
      'success',
      'window_key',
    ])
    expect(out.delivery).toEqual({ delivered: true, kind: 'reqboard-open-window' })
  })
})
