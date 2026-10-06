/**
 * 宿主接线冒烟：以 stub ctx 执行 apply()，验证捕获/立项三件套真正注册：
 *   1) systemPrompt capture section（reqboard:capture / order 60 / 函数式求值）
 *   2) 五个 agent 工具（reqboard_create / reqboard_status / reqboard_move /
 *      reqboard_decompose / reqboard_task_move）
 *   3) webServer 前缀路由（/dashboard/api/reqboard）
 * 以及 dispose 清理不抛错。这是无需重启 :13080 的最强接线验证
 * （等价于启动时插件装配路径：inject → effect → section/register）。
 *
 * serves: FR-1, FR-4（REQ-261005165552-6783：段必须显式声明插值开关，本段声明为字面量）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'
// REQ-261006123819-3af3 FR-1：注册名单从登记面派生（见下方「注册全部 agent 工具」用例）
import { TOOL_REGISTRY } from '../src/tools/registry.js'

type DisposeFn = () => void

interface StubCtx {
  sections: Array<{ name: string; order: number; text: unknown; interpolate?: unknown }>
  tools: Array<{ name: string; execute: unknown }>
  routes: Array<{ kind: string; path: string }>
  disposeHooks: DisposeFn[]
}

/** 页面插件无静态 inject——stub 立即派发 inject，effect 立即执行并收集清理。 */
function stubCtx(): StubCtx & {
  logger: () => { debug(): void; info(): void; warn(...a: unknown[]): void; error(...a: unknown[]): void }
  inject(services: string[], cb: (c: any) => void): void
  on(ev: string, cb: DisposeFn): void
} {
  const s: StubCtx = { sections: [], tools: [], routes: [], disposeHooks: [] }
  const disposers: DisposeFn[] = []
  const mkSvc = (extra: Record<string, unknown> = {}) => ({
    effect: (fn: () => unknown) => { const d = fn(); if (typeof d === 'function') disposers.push(d as DisposeFn) },
    systemPrompt: {
      section: (sec: any) => { s.sections.push(sec); return () => {} },
    },
    tools: {
      register: (tool: any) => { s.tools.push(tool); return () => {} },
    },
    webServer: {
      register: (route: any) => { s.routes.push(route); return () => {} },
    },
    ...extra,
  })
  const svcs: Record<string, any> = {
    systemPrompt: mkSvc(),
    tools: mkSvc(),
    webServer: mkSvc(),
    agents: mkSvc({ agents: {} }),
    sessionProjections: mkSvc({ sessionProjections: {} }),
  }
  const logger = () => ({ debug() {}, info() {}, warn(..._a: unknown[]) {}, error(..._a: unknown[]) {} })
  const ctx = {
    ...s,
    // cordis Service 基类构造时调 ctx.reflect.provide(...)（application/dive/ReqboardDiveManager
    // 在 apply() 里直接 new）。stub 必须有 reflect，否则装配阶段就抛
    // TypeError: Cannot read properties of undefined (reading 'provide')。
    reflect: { provide: () => {} },
    logger,
    inject: (services: string[], cb: (c: any) => void) => {
      for (const name of services) cb(svcs[name])
    },
    on: (ev: string, cb: DisposeFn) => { if (ev === 'dispose') s.disposeHooks.push(cb) },
  } as any
  ctx.__disposers = disposers
  return ctx
}

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-apply-')) })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('dsh-pmboard apply() 宿主接线（乙流程装配冒烟）', () => {
  it('注册 capture section：reqboard:capture / order 60 / text 函数式', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    const sec = ctx.sections.find(x => x.name === 'reqboard:capture')
    expect(sec).toBeDefined()
    expect(sec!.order).toBe(60)
    expect(typeof sec!.text).toBe('function')
    // 函数式求值：unbound 窗口（空台账 + agent.id）→ 返回引导文本而非空
    const text = (sec!.text as (c: unknown) => string)({ agent: { id: 'session-unbound-1' } })
    expect(text).toContain('reqboard_create')
  })

  it('capture section 显式声明为字面量段（interpolate === false）', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    const sec = ctx.sections.find(x => x.name === 'reqboard:capture')
    expect(sec).toBeDefined()
    // 宿主对 section 的**缺省**语义是模板：逐字扫描变量组，名字非法或未注册即抛错。
    // 本段正文含外来原文（用户消息节选、在制任务的说明与验收、需求标题），必须声明为字面量——
    // 否则一份引用了模板占位符的卡验收标准，会让窗口每一轮都在系统提示词装配处失败（实测事故）。
    expect(sec!.interpolate).toBe(false)
  })

  it('本插件注册的每个提示词段都显式声明插值开关（不许依赖宿主缺省）', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    expect(ctx.sections.length).toBeGreaterThan(0)
    // 未来新增段必须自己回答「这段的文本要不要扫描变量」，不允许靠宿主默认值——
    // 本次整轮卡死事故的根因形态正是「注册处一个字都没写，默认却决定窗口能不能跑」。
    const silent = ctx.sections.filter(s => typeof s.interpolate !== 'boolean').map(s => s.name)
    expect(silent).toEqual([])
  })

  it('注册全部 agent 工具（清单从 TOOL_REGISTRY 派生：左 = 实际注册名，右 = 登记面）', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    const names = ctx.tools.map(t => t.name).sort()
    // REQ-261006123819-3af3 FR-1：此前这里是 26 条手写名单 + toHaveLength(26)，
    // 新增 reqboard_skill_install 后门禁红着没人管。现在两边都从登记面派生：
    // 不相等即点名差集，漏登记当场被抓（不再靠手抄名单跟上）。
    expect(names).toEqual(TOOL_REGISTRY.map(e => e.toolName).sort())
    expect(names).toHaveLength(TOOL_REGISTRY.length)
  })

  it('注册看板路由：/dashboard/api/reqboard 前缀', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    const route = ctx.routes.find(r => r.path === '/dashboard/api/reqboard')
    expect(route).toBeDefined()
    expect(route!.kind).toBe('prefix')
  })

  // REQ-261004111917-f473 FR-1：旧深链兼容入口必须真的被注册（handler 单测证明不了接线）
  it('注册旧深链兼容入口：/dashboard 与 /dashboard/ 两条 exact 路由', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    const exact = ctx.routes.filter(r => r.kind === 'exact').map(r => r.path)
    expect(exact).toContain('/dashboard')
    expect(exact).toContain('/dashboard/')
  })

  it('dispose 清理全部注册（幂等不抛错）', () => {
    const ctx = stubCtx()
    apply(ctx as never, { dshHome: dir })
    expect(ctx.disposeHooks.length).toBeGreaterThan(0)
    for (const hook of ctx.disposeHooks) expect(() => hook()).not.toThrow()
    for (const d of (ctx as any).__disposers) expect(() => d()).not.toThrow()
  })
})
