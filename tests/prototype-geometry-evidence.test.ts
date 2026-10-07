/**
 * 几何量读数的证据校验 + `needsHuman` 理由的事实性（REQ-261006201649-cc89 t2 · FR-4）。
 *
 * ## 这份文件为什么存在
 *
 * `prototypeMeta.geometry` 此前只有 `name/value/unit/at/source`——读数**无法复核**：
 * 截的是哪一屏、是不是这次交付的那张图，全凭提交者自述；`needsHuman` 的理由填「视觉不一致」
 * 也算填了。本文件把「读数要么可复核、要么如实标未采集」写成会红的东西。
 *
 * 三条纪律：
 *   · **缺两键 = 未采集（放行）**：历史读数没有截图，一律判违规＝追溯存量（假红）；
 *   · **给了一键就两键都要对**：路径必须在、sha256 必须等于**文件实测摘要**（不信任自述）；
 *   · **端口未装配 = 不判**：读不到摘要时不把"我读不到"当"你错了"。
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  checkPrototypeAnchorsGate,
  humanReasonHasFact,
  observationEvidenceOf,
  type PrototypeEvidencePort,
} from '../src/application/internal/prototype-anchor-gate.ts'
import type { ProtoObservation } from '../src/application/internal/prototype-gates.ts'

const repoPath = (rel: string): string => fileURLToPath(new URL('../' + rel, import.meta.url))
/** 真实截图（本需求自己的原型证据）——用真文件，不用造假摘要。 */
const SHOT_REL = 'docs/requirements/REQ-261006201649-cc89/evidence/gate-feedback-1280.png'
const SHOT_ABS = repoPath(SHOT_REL)
const SHOT_SHA = createHash('sha256').update(readFileSync(SHOT_ABS)).digest('hex')

const obs = (over: Partial<ProtoObservation> = {}): ProtoObservation => ({
  name: 'cardWidth', value: 642, unit: 'px', at: { width: 1280, state: 'inflight' }, ...over,
})

/** 端口：真实文件系统（只认本用例点名的那个文件）。 */
const port: PrototypeEvidencePort = {
  shotExists: (p) => p === SHOT_REL,
  sha256Of: async (p) => (p === SHOT_REL ? SHOT_SHA : undefined),
}

describe('observationEvidenceOf · 三态判定表', () => {
  it('两键都缺 → unverified（存量口径，放行）', async () => {
    expect(await observationEvidenceOf(obs(), port)).toEqual({ state: 'unverified' })
  })

  it('两键齐且对 → collected', async () => {
    expect(await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: SHOT_SHA }), port)).toEqual({ state: 'collected' })
  })

  it('只有 shot → invalid，理由写明缺 sha256', async () => {
    const v = await observationEvidenceOf(obs({ shot: SHOT_REL }), port)
    expect(v.state).toBe('invalid')
    expect((v.state === 'invalid' ? v.reason : '').toLowerCase()).toContain('sha256')
  })

  it('只有 shotSha256 → invalid，理由写明缺截图路径', async () => {
    const v = await observationEvidenceOf(obs({ shotSha256: SHOT_SHA }), port)
    expect(v.state).toBe('invalid')
    expect(v.state === 'invalid' ? v.reason : '').toContain('shot')
  })

  it('截图不在 → invalid，且**点名路径**（人要知道缺的是哪张）', async () => {
    const v = await observationEvidenceOf(obs({ shot: 'docs/requirements/x/evidence/nope.png', shotSha256: SHOT_SHA }), port)
    expect(v.state).toBe('invalid')
    expect(v.state === 'invalid' ? v.reason : '').toContain('nope.png')
  })

  it('sha256 与实际不符 → invalid，给出期望与实际前 12 位', async () => {
    const wrong = 'a'.repeat(64)
    const v = await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: wrong }), port)
    expect(v.state).toBe('invalid')
    const reason = v.state === 'invalid' ? v.reason : ''
    expect(reason).toContain('aaaaaaaaaaaa')
    expect(reason).toContain(SHOT_SHA.slice(0, 12))
  })

  it('sha256 形态不合法（非 64 位小写十六进制）→ invalid', async () => {
    for (const bad of ['ABC', 'A'.repeat(64), 'z'.repeat(64), SHOT_SHA.slice(0, 63)]) {
      const v = await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: bad }), port)
      expect(v.state, 'bad=' + bad).toBe('invalid')
    }
  })

  it('绝对路径 / 含 .. 的路径 → invalid（口径不合法，不是"文件不在"）', async () => {
    for (const bad of ['/Users/x/y.png', '../outside.png', 'a/../../b.png']) {
      const v = await observationEvidenceOf(obs({ shot: bad, shotSha256: SHOT_SHA }), port)
      expect(v.state, 'bad=' + bad).toBe('invalid')
      expect(v.state === 'invalid' ? v.reason : '').toContain('口径')
    }
  })

  it('端口未装配 → 不判（unverified），不把"我读不到"当"你错了"', async () => {
    expect(await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: SHOT_SHA }), undefined)).toEqual({ state: 'unverified' })
  })

  it('摘要读不出（端口返回 undefined）→ unverified，不当成摘要不符', async () => {
    const blind: PrototypeEvidencePort = { shotExists: () => true, sha256Of: async () => undefined }
    expect(await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: SHOT_SHA }), blind)).toEqual({ state: 'unverified' })
  })

  it('大小写不敏感：摘要写成大写也算对（hex 语义相同）', async () => {
    const upper = SHOT_SHA.toUpperCase()
    expect(await observationEvidenceOf(obs({ shot: SHOT_REL, shotSha256: upper }), port)).toEqual({ state: 'collected' })
  })
})

describe('humanReasonHasFact · 只判"有没有给事实"', () => {
  it.each([
    ['见 evidence/gate-1280.png 右侧卡片的边框颜色', true],
    ['跑 npx vitest run tests/x.test.ts 看不到该项', true],
    ['详情页 #FR-4 的第三个格子', true],
    ['prototypes/gate-feedback.html 的第二张卡缺边框', true],
    ['在 4 屏下宽度不一致', true],
  ])('放行：%s', (reason, expected) => {
    expect(humanReasonHasFact(reason)).toBe(expected)
  })

  it.each([
    ['不好看'],
    ['不一致'],
    ['视觉上不对'],
    [''],
    ['——'],
    ['   '],
  ])('拒：%s', (reason) => {
    expect(humanReasonHasFact(reason)).toBe(false)
  })
})

describe('门级：几何量证据接入（FR-4）', () => {
  const REQ = 'REQ-0000t2'
  const DIR = 'docs/requirements/' + REQ
  const SIDES = '---\nreq_id: x\nsides: [frontend]\n---\n# 需求'
  const FRESH = Date.parse('2026-10-07T00:00:00.000Z')
  const STALE = Date.parse('2026-10-05T00:00:00.000Z')

  /** 一份"填过"的原型：一个 FR 锚点 + 恰好一块 geometry（证据按参数注入）。 */
  const prototypeHtml = (evidence: string): string => [
    '<!DOCTYPE html><html><head><title>t2</title></head><body>',
    '<section id="FR-1">真实区块</section>',
    '<!-- proto-geometry {"observations":[{"name":"cardWidth","value":642,"unit":"px","at":{"width":1280,"state":"inflight"}'
      + evidence + '}]} -->',
    '</body></html>',
  ].join('\n')

  /** 门契约同形的读端口（与真实 DocsReader 的窄面一致）。 */
  const fakeDocs = (files: Record<string, string>) => ({
    exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
    read: async (p: string) => files[p] ?? '',
  })

  /** 三份文件的内容（**返回原始 map**，方便用例改坏其中一份；要端口时过 `fakeDocs`）。 */
  const docsOf = (evidence: string): Record<string, string> => ({
    [DIR + '/requirement.md']: SIDES,
    [DIR + '/prototypes/INDEX.md']: [
      '# 原型清单', '',
      '| 路径 | 状态 | 服务条款 | 被取代于 |', '|---|---|---|---|',
      '| prototypes/detail.html | authoritative | FR-1 | |',
    ].join('\n'),
    [DIR + '/prototypes/detail.html']: prototypeHtml(evidence),
  })
  const reqOf = (createdAt: number = FRESH) => ({
    id: REQ, category: 'feature', createdAt,
    artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: DIR + '/requirement.md' }],
  } as never)

  const evidence = (o: Partial<ProtoObservation>) =>
    (o.shot === undefined ? '' : ',"shot":"' + o.shot + '"')
    + (o.shotSha256 === undefined ? '' : ',"shotSha256":"' + o.shotSha256 + '"')

  it('证据两键齐且对 → 门放行', async () => {
    const files = docsOf(evidence({ shot: SHOT_REL, shotSha256: SHOT_SHA }))
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), { evidence: port })).toBeUndefined()
  })

  it('两键都缺 → 放行（未采集，非违规）', async () => {
    expect(await checkPrototypeAnchorsGate(fakeDocs(docsOf('')) as never, reqOf(), { evidence: port })).toBeUndefined()
  })

  it('摘要不符 → prototype_geometry_unverified，gaps 点名观测量名与理由', async () => {
    const files = docsOf(evidence({ shot: SHOT_REL, shotSha256: 'b'.repeat(64) }))
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), { evidence: port })
    expect(r?.code).toBe('prototype_geometry_unverified')
    const text = (r?.gaps ?? []).join('\n')
    expect(text).toContain('cardWidth')
    expect(text).toMatch(/摘要不符|无法复核/)
  })

  it('截图不在 → 同样拒，且点名路径', async () => {
    const files = docsOf(evidence({ shot: DIR + '/evidence/missing.png', shotSha256: SHOT_SHA }))
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), { evidence: port })
    expect(r?.code).toBe('prototype_geometry_unverified')
    expect((r?.gaps ?? []).join('\n')).toContain('missing.png')
  })

  it('端口未装配（只有模板端口）→ 证据不判、放行', async () => {
    const files = docsOf(evidence({ shot: SHOT_REL, shotSha256: 'b'.repeat(64) }))
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), {})).toBeUndefined()
  })

  it('存量需求（旧 createdAt）即使证据不符也放行（新判据整段不判）', async () => {
    const files = docsOf(evidence({ shot: SHOT_REL, shotSha256: 'b'.repeat(64) }))
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(STALE), { evidence: port })).toBeUndefined()
  })

  it('锚点维仍先判：真稿缺 FR 覆盖时不会因为证据也坏而改报证据码', async () => {
    const files = docsOf(evidence({ shot: SHOT_REL, shotSha256: 'b'.repeat(64) }))
    const indexKey = 'docs/requirements/' + REQ + '/prototypes/INDEX.md'
    files[indexKey] = files[indexKey]!.replace('| FR-1 |', '| FR-99 |')
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), { evidence: port })
    expect(r?.code).toBe('prototype_anchor_missing')
  })
})
