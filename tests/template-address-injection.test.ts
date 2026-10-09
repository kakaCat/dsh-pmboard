/**
 * 注入点地址段一致性（REQ-260922213356-4a45 T-3 / TC-9）。
 *
 * 系统提示词段与 H3 后置链必须由**同一个纯函数**折入**逐字相同**的地址段——
 * 否则「纪律到了、地址没到」或「两处口径不一致」这类漂移会静默发生。
 * （节点输入包一侧在 T-5 的压缩两路径用例里补齐。）
 *
 * @module dsh-pmboard/tests/template-address-injection
 */
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { makeHarness, req } from './application/harness.js'
import { boundSectionText } from '../src/application/internal/capture-section.js'
import { createH3InjectHandler } from '../src/application/gate/handlers/h3-inject.js'
import { createH4ResumeHandler } from '../src/application/gate/handlers/h4-resume.js'
import { buildNodeInputPackage } from '../src/application/internal/node-input-package.js'
import type { ConfirmContext } from '../src/domain/gate/GateSpec.js'
import type { ChainScratch } from '../src/application/gate/GatePostChain.js'
import type { InjectionLogInput } from '../src/application/internal/injection-log.js'

const WINDOW = 'session-w-001'
const REQ_ID = 'REQ-000001'
const REAL_ROOT = fileURLToPath(new URL('../templates', import.meta.url))

function seeded(status: string, category = 'feature') {
  return makeHarness({
    requirements: [req({
      id: REQ_ID, status: status as never, category: category as never, sourceSessionId: WINDOW,
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/REQ-000001/requirement.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
        { stage: 'design', kind: 'design', path: 'docs/requirements/REQ-000001/design/architecture.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
      ],
    })],
  })
}

function ctx(to: string, verdict: 'affirmative' | 'negative' | undefined = 'affirmative', answers: ConfirmContext['answers'] = []): ConfirmContext {
  return { windowKey: WINDOW, gate: 'G1', from: 'brainstorming', to: to as never, requirementId: REQ_ID, ...(verdict === undefined ? {} : { verdict }), answers, decidedAt: 1000 }
}

function deliverSink() {
  const msgs: string[] = []
  return { msgs, port: { deliver: (_wk: string, m: { text: string }) => { msgs.push(m.text); return { delivered: true } } } }
}

/** 从整段注入文本里抽出地址段（到「流水线（状态就是阶段」为止；输入的 H3 文本无此串则到末尾）。 */
function sectionOf(text: string): string {
  const i = text.indexOf('## 本节点文档')
  if (i < 0) return ''
  const rest = text.slice(i)
  const j = rest.indexOf('\n流水线（状态就是阶段')
  return (j < 0 ? rest : rest.slice(0, j)).trimEnd()
}

function logSink() {
  const entries: InjectionLogInput[] = []
  return { entries, port: { record: (e: InjectionLogInput) => { entries.push(e) } } }
}

describe('TC-9 地址段在三处注入点逐字一致', () => {
  it('design/feature：系统段与 H3 的地址段相同，且含同一组绝对地址', async () => {
    const h = seeded('design')
    const sink = logSink()
    const section = boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), await h.tasksOf(REQ_ID), { agent: { id: WINDOW } }, sink.port)
    const systemSection = sectionOf(section)

    const h3Sink = logSink()
    const handler = createH3InjectHandler({ store: h.store, taskStore: h.taskStore, injectionLog: h3Sink.port, templateRoot: REAL_ROOT, addressSectionEnabled: true } as never)
    const scratch: ChainScratch = {}
    const outcome = await handler.run({ ctx: ctx('design'), scratch })
    expect(outcome).toEqual({ kind: 'continue' })
    const h3Section = sectionOf(scratch.promptText ?? '')

    expect(systemSection.length).toBeGreaterThan(0)
    expect(h3Section).toBe(systemSection)
    expect(systemSection).toContain(REAL_ROOT + '/design/architecture.md')
    expect(systemSection).toContain('docs/requirements/REQ-000001/requirement.md')
    // 留痕 charCount 含地址段（FR-8 记账）：H3 的 charCount = 增强后文本长度
    expect(h3Sink.entries[0]?.charCount).toBe((scratch.promptText ?? '').length)
    expect(sink.entries[0]?.charCount ?? 0).toBeGreaterThan(0)
  })

  it('空集（bug 的 design 且无已登记上游）：两处都不出现地址段标题', async () => {
    // 空集 = 无模板（bug design）且无上游（artifacts 为空）——只有此时渲染返空串
    const h = makeHarness({
      requirements: [req({ id: REQ_ID, status: 'design' as never, category: 'bug' as never, sourceSessionId: WINDOW })],
    })
    const section = boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), await h.tasksOf(REQ_ID), { agent: { id: WINDOW } }, undefined)
    expect(section).not.toContain('## 本节点文档')

    const handler = createH3InjectHandler({ store: h.store, taskStore: h.taskStore, templateRoot: REAL_ROOT, addressSectionEnabled: true } as never)
    const scratch: ChainScratch = {}
    await handler.run({ ctx: ctx('design'), scratch })
    expect(scratch.promptText ?? '').not.toContain('## 本节点文档')
  })

  it('开关关闭 / 未给模板根：行为与改造前逐字一致（无地址段）', async () => {
    const h = seeded('design')
    const setTasks = await h.tasksOf(REQ_ID)
    const off = boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), setTasks, { agent: { id: WINDOW } }, undefined)
    const none = boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), setTasks, { agent: { id: WINDOW } }, undefined)
    expect(off).toBe(none)
    expect(off).not.toContain('## 本节点文档')
  })
})

describe('TC-10 非肯定项不注入下一节点纪律（FR-10）', () => {
  it('negative：H3 skip(negative_verdict)，不写 scratch、不留痕', async () => {
    const h = seeded('design')
    const sink = logSink()
    const handler = createH3InjectHandler({ store: h.store, taskStore: h.taskStore, injectionLog: sink.port, templateRoot: REAL_ROOT, addressSectionEnabled: true } as never)
    const scratch: ChainScratch = {}
    const out = await handler.run({ ctx: ctx('design', 'negative'), scratch })
    expect(out).toEqual({ kind: 'skip', code: 'negative_verdict', reason: expect.any(String) })
    expect(scratch.promptText).toBeUndefined()
    expect(sink.entries).toHaveLength(0)
  })

  it('verdict 缺省（H1 未跑到）→ 保守按 negative 处理', async () => {
    const h = seeded('design')
    const handler = createH3InjectHandler({ store: h.store, taskStore: h.taskStore, templateRoot: REAL_ROOT, addressSectionEnabled: true } as never)
    const scratch: ChainScratch = {}
    const noVerdict = ctx('design')
    delete (noVerdict as { verdict?: unknown }).verdict
    const out = await handler.run({ ctx: noVerdict, scratch })
    expect(out).toMatchObject({ kind: 'skip', code: 'negative_verdict' })
    expect(scratch.promptText).toBeUndefined()
  })

  /**
   * H4 已全面 Dive 化：`H4ResumeDeps` 为空接口、投递通道（`deliver`）已删，
   * handler **恒**返回 `{ kind: 'skip', code: 'dive_handles_resume' }`，把唤醒交给 Dive 的
   * roundDriver（见 `src/application/gate/handlers/h4-resume.ts` 头注）。
   * ⇒ 下面两条断言按新权威行为改写（用例名保留自投递实现，记录当初的文案场景；
   *   不删用例、不 skip）。同契约已由 `tests/gate-handlers.test.ts` 的
   *   `expectDiveResumeSkip` 覆盖。
   */
  it('H4 negative：只发作答摘要 + 用户意见，不含任何纪律块', async () => {
    const d = deliverSink()
    const handler = createH4ResumeHandler({ delivery: d.port as never })
    const out = await handler.run({ ctx: ctx('design', 'negative', [{ id: 'confirm', selected: ['需修改'], custom: '第三节缺端侧条件' }]), scratch: {} })
    expect(out).toMatchObject({ kind: 'skip', code: 'dive_handles_resume' })
    expect(d.msgs).toHaveLength(0) // 投递通道已删：H4 永不投递
  })

  it('H4 affirmative：仍附纪律全文（防"修反"）', async () => {
    const d = deliverSink()
    const handler = createH4ResumeHandler({ delivery: d.port as never })
    const out = await handler.run({ ctx: ctx('design', 'affirmative'), scratch: { promptText: 'DISCIPLINE-X' } })
    expect(out).toMatchObject({ kind: 'skip', code: 'dive_handles_resume' })
    expect(d.msgs).toHaveLength(0) // 不论 scratch 是否带提示词全文，H4 都不再投递
  })
})

describe('TC-11 压缩路径（节点输入包）与未压缩路径地址段一致', () => {
  it('输入包含「本节点文档」且与系统段逐字一致，位于「需求文档」之后', async () => {
    const h = seeded('design')
    const requirement = (await h.store.get(REQ_ID))!
    const pkg = buildNodeInputPackage({
      stage: 'design' as never,
      category: 'feature' as never,
      requirement,
      requirementDoc: 'X',
      requirementDocPath: 'docs/requirements/REQ-000001/requirement.md',
      templateRoot: REAL_ROOT,
    })
    const pkgSection = sectionOf(pkg.text)
    const systemSection = sectionOf(boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), await h.tasksOf(REQ_ID), { agent: { id: WINDOW } }, undefined))
    expect(pkgSection.length).toBeGreaterThan(0)
    expect(pkgSection).toBe(systemSection)
    expect(pkg.text.indexOf('## 本节点文档')).toBeGreaterThan(pkg.text.indexOf('## 需求文档'))
  })

  it('系统段不可得时，输入包仍带地址段（双落点互为兜底）', async () => {
    const h = seeded('design')
    const noWindow = boundSectionText(// B12 阶段⑤族 B：`boundSectionText` 仍吃册形视图 ⇒ 调用点现搭（适配第 7 次应用）
      ({ requirements: (await h.store.listSummaries({ scope: 'all' })).items, tasks: [], triages: [] } as never), await h.tasksOf(REQ_ID), {} as never, undefined)
    expect(noWindow).toBe('')
    const pkg = buildNodeInputPackage({
      stage: 'design' as never, category: 'feature' as never,
      requirement: (await h.store.get(REQ_ID))!,
      requirementDoc: 'X', requirementDocPath: 'docs/requirements/REQ-000001/requirement.md',
      templateRoot: REAL_ROOT,
    })
    expect(sectionOf(pkg.text).length).toBeGreaterThan(0)
  })

  it('空集（无模板无上游）：输入包不追加地址小节', async () => {
    const h = makeHarness({ requirements: [req({ id: REQ_ID, status: 'design' as never, category: 'bug' as never, sourceSessionId: WINDOW })] })
    const pkg = buildNodeInputPackage({
      stage: 'design' as never, category: 'bug' as never,
      requirement: (await h.store.get(REQ_ID))!,
      requirementDoc: 'X', requirementDocPath: 'docs/requirements/REQ-000001/requirement.md',
      templateRoot: REAL_ROOT,
    })
    expect(pkg.text).not.toContain('## 本节点文档')
  })
})


