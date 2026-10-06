/**
 * 原型三门单测（REQ-261005105032-3b02 t4 · serves: FR-1, FR-3, FR-4）
 *
 * 验收口径（brief §2 + data-model §2/§3）：
 *  - 缺已登记 prototype 且无有效豁免 → prototype_missing；豁免三态（空理由拒 / 未落章拒 / 已落章放行）；
 *  - INDEX 的 authoritative 为 0 条与 2 条 → prototype_version_conflict 且 gaps 点名路径；
 *    INDEX 缺失 / requirement.md 引用 superseded → 同码；
 *  - 缺 id="FR-4" 区块 / geometry 两块 / 含 threshold → prototype_anchor_missing 并点名 FR 与块数；
 *  - 合法标本三门均 undefined；sides 不含 frontend（纯后端）三门均 undefined。
 *
 * 用内存假 DocsReader（application 只经端口读文档）——用例零 fs，判定可逆。
 */
import { describe, expect, it } from 'vitest'
import {
  checkPrototypeAnchorsGate,
  checkPrototypePresenceGate,
  checkPrototypeVersionGate,
  prototypeExemptOf,
  prototypePathsIn,
  toReqRelative,
} from '../src/application/internal/prototype-gates.js'
import { GATE_HOW_ANCHOR } from '../src/application/internal/gate-feedback.js'
import type { DocsReader } from '../src/application/internal/content-gates.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const REQ = 'REQ-t4proto'
const RDIR = 'docs/requirements/' + REQ
const REQP = RDIR + '/requirement.md'
const INDEXP = RDIR + '/prototypes/INDEX.md'
const AUTH = 'prototypes/detail-v2.html'
const OLD = 'prototypes/detail.html'

function fakeDocs(files: Record<string, string>): DocsReader {
  return {
    exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
    read: async (p: string) => files[p] ?? '',
    list: (dir: string) => Object.keys(files)
      .filter(k => k.startsWith(dir + '/'))
      .map(k => ({ name: k.slice(dir.length + 1), isFile: true })),
  }
}

/** 需求文档：front-matter 行由用例给（sides / prototype_exempt），正文含 FR-3 / FR-4。 */
function reqDoc(fm: readonly string[] = [], body = ''): string {
  return ['---', 'req: ' + REQ, ...fm, '---', '', '# 需求', '', '### FR-3: 甲', 'x', '', '### FR-4: 乙', 'x', '', body].join('\n')
}

const requirementArtifact = (confirmed: boolean): StageArtifact => ({
  stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1,
  ...(confirmed ? { confirmedAt: 1 } : {}),
}) as StageArtifact

const prototypeArtifact = (): StageArtifact => ({
  stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + AUTH, registeredAt: 1,
}) as StageArtifact

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ, title: '原型门', description: '', category: 'feature', status: 'brainstorming',
    blocked: false, sourceSessionId: 'w', comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: [requirementArtifact(true)],
    ...over,
  } as unknown as RequirementRecord
}

const OBS = { name: 'tabsTop', value: 576, unit: 'px', at: { width: 1280, state: 'inflight' } }
const HTML_OK = '<section id="FR-3">甲</section>\n<section id="FR-4">乙</section>\n'
  + '<!-- proto-geometry ' + JSON.stringify({ observations: [OBS] }) + ' -->\n'
const htmlWith = (anchors: readonly string[], geometry: string): string =>
  anchors.map(fr => '<section id="' + fr + '">x</section>').join('\n') + '\n' + geometry + '\n'

function indexMd(rows: ReadonlyArray<readonly [string, string, string, string]>): string {
  return '# 原型权威清单\n\n| 路径 | 状态 | 服务条款 | 被取代于 |\n|---|---|---|---|\n'
    + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n'
}
const INDEX_OK = indexMd([[AUTH, 'authoritative', 'FR-3, FR-4', ''], [OLD, 'superseded', 'FR-3', AUTH]])

/** 合法标本：需求文档声明 frontend + INDEX 一条权威 + 权威原型锚点齐、一块 geometry。 */
function goodFiles(): Record<string, string> {
  return { [REQP]: reqDoc(['sides: [frontend]']), [INDEXP]: INDEX_OK, [RDIR + '/' + AUTH]: HTML_OK }
}
const goodReq = (): RequirementRecord => makeReq({ artifacts: [requirementArtifact(true), prototypeArtifact()] })

const checkTriple = async (files: Record<string, string>, req: RequirementRecord): Promise<Array<string | undefined>> => [
  (await checkPrototypePresenceGate(fakeDocs(files), req))?.code,
  (await checkPrototypeVersionGate(fakeDocs(files), req))?.code,
  (await checkPrototypeAnchorsGate(fakeDocs(files), req))?.code,
]

describe('S-1 存在门 checkPrototypePresenceGate', () => {
  it('UI 需求缺已登记 prototype 且无豁免 → prototype_missing（含三要素与可执行锚点）', async () => {
    const f = await checkPrototypePresenceGate(fakeDocs({ [REQP]: reqDoc(['sides: [frontend]']) }), makeReq())
    expect(f?.code).toBe('prototype_missing')
    expect(f?.gaps?.join(' ')).toContain('kind=prototype')
    const msg = f?.message ?? ''
    expect(msg).toContain('——')
    expect(msg).toContain('补齐：')
    expect(GATE_HOW_ANCHOR.test(msg.slice(msg.indexOf('补齐：')))).toBe(true)
    expect(msg).toContain('reqboard_submit(kind=prototype)')
  })

  it('豁免三态①：写了 prototype_exempt 但理由为空 → 仍拒，并说明豁免无效', async () => {
    const files = { [REQP]: reqDoc(['sides: [frontend]', 'prototype_exempt:   ']) }
    const f = await checkPrototypePresenceGate(fakeDocs(files), makeReq())
    expect(f?.code).toBe('prototype_missing')
    expect(f?.gaps?.join(' ')).toContain('理由为空')
  })

  it('豁免三态②：理由非空但 requirement 产物未落章 → 仍拒（agent 不能自豁免）', async () => {
    const files = { [REQP]: reqDoc(['sides: [frontend]', 'prototype_exempt: 纯文案微调，人已确认']) }
    const f = await checkPrototypePresenceGate(fakeDocs(files), makeReq({ artifacts: [requirementArtifact(false)] }))
    expect(f?.code).toBe('prototype_missing')
    expect(f?.gaps?.join(' ')).toContain('未落章')
  })

  it('豁免三态③：理由非空 + requirement 已落章 → 放行（不交原型）', async () => {
    const files = { [REQP]: reqDoc(['sides: [frontend]', 'prototype_exempt: 纯文案微调，人已确认']) }
    expect(await checkPrototypePresenceGate(fakeDocs(files), makeReq())).toBeUndefined()
  })

  it('已登记 prototype → 放行；sides 不含 frontend → 放行；存量需求（artifacts 空）→ 放行', async () => {
    expect(await checkPrototypePresenceGate(fakeDocs(goodFiles()), goodReq())).toBeUndefined()
    const noFront = { [REQP]: reqDoc(['sides: [backend]']) }
    expect(await checkPrototypePresenceGate(fakeDocs(noFront), makeReq())).toBeUndefined()
    expect(await checkPrototypePresenceGate(fakeDocs({}), makeReq({ artifacts: [] }))).toBeUndefined()
  })

  it('frontend + backend 同时声明仍算 UI 需求（frontend 命中即要原型）', async () => {
    const files = { [REQP]: reqDoc(['sides: [frontend, backend]']) }
    expect((await checkPrototypePresenceGate(fakeDocs(files), makeReq()))?.code).toBe('prototype_missing')
  })

  it('prototypeExemptOf 三态直接断言（纯函数）', () => {
    expect(prototypeExemptOf(makeReq(), {})).toEqual({ active: false, reason: '' })
    expect(prototypeExemptOf(makeReq({ artifacts: [requirementArtifact(false)] }), { prototype_exempt: '理由' }))
      .toEqual({ active: false, reason: '理由' })
    expect(prototypeExemptOf(makeReq(), { prototype_exempt: ' 理由 ' })).toEqual({ active: true, reason: '理由' })
  })
})

describe('S-2 版本门 checkPrototypeVersionGate', () => {
  it('authoritative 两条 → prototype_version_conflict，gaps 点名两份路径', async () => {
    const files = goodFiles()
    files[INDEXP] = indexMd([[AUTH, 'authoritative', 'FR-3, FR-4', ''], [OLD, 'authoritative', 'FR-3', '']])
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain(AUTH)
    expect(f?.gaps?.join(' ')).toContain(OLD)
    expect(f?.gaps?.join(' ')).toContain('authoritative ×2')
  })

  it('authoritative 零条 → 同码，gaps 点名 INDEX 现有路径', async () => {
    const files = goodFiles()
    files[INDEXP] = indexMd([[OLD, 'superseded', 'FR-3', AUTH]])
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain('authoritative ×0')
    expect(f?.gaps?.join(' ')).toContain(OLD)
  })

  it('INDEX 缺失（已有已登记原型）→ 同码，点名期望路径', async () => {
    const files = goodFiles()
    delete files[INDEXP]
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain(INDEXP)
  })

  it('requirement.md 引用 superseded 版 → 同码，点名被引用的作废路径与权威路径', async () => {
    const files = goodFiles()
    files[REQP] = reqDoc(['sides: [frontend]'], '原型见 `' + OLD + '`（旧版）')
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain(OLD)
    expect(f?.gaps?.join(' ')).toContain(AUTH)
    expect(f?.gaps?.join(' ')).toContain('requirement.md')
  })

  it('design/frontend.md 引用 superseded 版 → 同码', async () => {
    const files = goodFiles()
    files[RDIR + '/design/frontend.md'] = '# 前端设计\n\n原型页面见 ' + OLD + '\n'
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain('design/frontend.md')
  })

  it('两版并存但只有一条权威、引用指向权威 → 放行（REQ-292a 事故形态的正解）', async () => {
    expect(await checkPrototypeVersionGate(fakeDocs(goodFiles()), goodReq())).toBeUndefined()
  })

  it('表格列名漂移（缺「服务条款」列）→ 同码并点名缺列（锚点门靠它判覆盖，不许静默关掉）', async () => {
    const files = goodFiles()
    files[INDEXP] = '# 清单\n\n| 路径 | 状态 | 被取代于 |\n|---|---|---|\n| ' + AUTH + ' | authoritative | |\n'
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain('服务条款')
  })

  it('INDEX 里根本没有表格 → 同码（等价 0 条权威，不静默放行）', async () => {
    const files = goodFiles()
    files[INDEXP] = '# 原型权威清单\n\n（待补表格）\n'
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain('表格')
  })

  it('状态值不在值域 → 拒（宁可拒，不静默放行）', async () => {
    const files = goodFiles()
    files[INDEXP] = indexMd([[AUTH, 'authoritative', 'FR-3, FR-4', ''], [OLD, 'obsolete', 'FR-3', AUTH]])
    const f = await checkPrototypeVersionGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_version_conflict')
    expect(f?.gaps?.join(' ')).toContain('值域外')
  })
})

describe('S-3 锚点门 checkPrototypeAnchorsGate', () => {
  it('缺 id="FR-4" 区块 → prototype_anchor_missing，gaps 点名 FR-4', async () => {
    const files = goodFiles()
    files[RDIR + '/' + AUTH] = htmlWith(['FR-3'], '<!-- proto-geometry ' + JSON.stringify({ observations: [OBS] }) + ' -->')
    const f = await checkPrototypeAnchorsGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain('FR-4')
    expect(f?.message).toContain('补齐：')
  })

  it('geometry 两块 → 同码并点名块数', async () => {
    const files = goodFiles()
    const one = '<!-- proto-geometry ' + JSON.stringify({ observations: [OBS] }) + ' -->'
    files[RDIR + '/' + AUTH] = htmlWith(['FR-3', 'FR-4'], one + '\n' + one)
    const f = await checkPrototypeAnchorsGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain('×2')
  })

  it('geometry 含 threshold 键 → 同码，gaps 点名字段', async () => {
    const files = goodFiles()
    const bad = { observations: [{ ...OBS, threshold: 700 }] }
    files[RDIR + '/' + AUTH] = htmlWith(['FR-3', 'FR-4'], '<!-- proto-geometry ' + JSON.stringify(bad) + ' -->')
    const f = await checkPrototypeAnchorsGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain('threshold')
  })

  it('缺 geometry 块 → 同码（块 ×0）', async () => {
    const files = goodFiles()
    files[RDIR + '/' + AUTH] = htmlWith(['FR-3', 'FR-4'], '')
    const f = await checkPrototypeAnchorsGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain('proto-geometry')
  })

  it('权威原型缺磁盘文件 → 同码（点名路径）', async () => {
    const files = goodFiles()
    delete files[RDIR + '/' + AUTH]
    const f = await checkPrototypeAnchorsGate(fakeDocs(files), goodReq())
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain(AUTH)
  })
})

describe('适用性：合法标本与纯后端需求', () => {
  it('合法标本三门均 undefined', async () => {
    expect(await checkTriple(goodFiles(), goodReq())).toEqual([undefined, undefined, undefined])
  })

  it('sides: [backend] 标本三门均 undefined（不给非 UI 需求加仪式）', async () => {
    const files = { [REQP]: reqDoc(['sides: [backend]']) }
    expect(await checkTriple(files, makeReq())).toEqual([undefined, undefined, undefined])
  })

  it('非 feature/refactor 类型即使声明 frontend 也不走原型门', async () => {
    const files = { [REQP]: reqDoc(['sides: [frontend]']) }
    expect(await checkTriple(files, makeReq({ category: 'bug' }))).toEqual([undefined, undefined, undefined])
  })
})

describe('路径口径（§10 #2：需求目录相对 + normalizeArtifactPath 归一）', () => {
  it('三种写法归一到同一口径', () => {
    expect(toReqRelative('prototypes/detail.html', REQ)).toBe('prototypes/detail.html')
    expect(toReqRelative('./prototypes/detail.html', REQ)).toBe('prototypes/detail.html')
    expect(toReqRelative('docs/requirements/' + REQ + '/prototypes/detail.html', REQ)).toBe('prototypes/detail.html')
    expect(toReqRelative('/work/ws/docs/requirements/' + REQ + '/prototypes/detail.html', REQ)).toBe('prototypes/detail.html')
  })

  it('伪路径 / 逃逸路径 → undefined（不把不可定位的串当原型路径）', () => {
    expect(toReqRelative('prototypes/{a,b}.html', REQ)).toBeUndefined()
    expect(toReqRelative('../other/prototypes/a.html', REQ)).toBeUndefined()
    expect(toReqRelative(REQP + '/../prototypes/detail.html', REQ)).toBeUndefined()
    expect(toReqRelative('', REQ)).toBeUndefined()
  })

  it('INDEX 里写全路径也能与文档引用对齐（归一后相等）', async () => {
    const files = goodFiles()
    files[INDEXP] = indexMd([[RDIR + '/' + AUTH, 'authoritative', 'FR-3, FR-4', ''], [OLD, 'superseded', 'FR-3', AUTH]])
    expect(await checkPrototypeVersionGate(fakeDocs(files), goodReq())).toBeUndefined()
  })

  it('prototypePathsIn 只认 .html（INDEX.md 不算被引用的原型）', () => {
    expect(prototypePathsIn('见 prototypes/a.html 与 prototypes/INDEX.md 与 prototype/b.html'))
      .toEqual(['prototypes/a.html', 'prototype/b.html'])
  })
})
