/**
 * 两个新错误码的**三处身份**（REQ-261006201649-cc89 t5 · FR-6）。
 *
 * ## 为什么一个码要三处登记
 *
 * 同一个失败会走两条链：**看板侧**报内部码（`prototype_placeholder`），
 * **会话侧**报传输码（`REQBOARD_PROTOTYPE_PLACEHOLDER`）；人看的第处是**中文类别名**。
 * 三处缺任一处都不是"少一条文案"，而是三种不同的坏：
 *   · 缺 HTTP 状态 → 落 500，看板把"流程没满足"显示成"服务器坏了"（人照着修不了）；
 *   · 缺传输码 → 会话侧走"未知内部码原样透传"，人看到英文码；
 *   · 缺类别名 → 降级**不是崩而是沉默**：面板显示英文码原文。
 *
 * 所以这张用例锁的是"三处齐"，不是"有没有那段文案"。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'
import { fail } from '../src/http/envelope.ts'
import { transportCodeOf } from '../src/application/use-cases/MoveRequirement.ts'
import { ERROR_CATEGORY } from '../src/client/toolviews/shared.ts'
import { GATE_HOW_ANCHOR } from '../src/application/internal/gate-feedback.ts'
import { checkPrototypeAnchorsGate } from '../src/application/internal/prototype-anchor-gate.ts'
import { PROTOTYPE_HTML_SKELETON } from '../src/application/internal/prototype-skeleton-template.ts'

const INTERNAL = ['prototype_placeholder', 'prototype_geometry_unverified'] as const
const TRANSPORT = ['REQBOARD_PROTOTYPE_PLACEHOLDER', 'REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED'] as const

const repo = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

/**
 * 真发一次失败信封、读**真写出的**状态码（沿用 `tests/http-envelope-status.test.ts` 的手法）。
 *
 * 为什么不直接读映射表：表里有键 ≠ 真的落对了状态——`fail()` 才是把 code 落成 HTTP 状态的
 * 唯一路径。走真路径的断言才承重。
 */
function statusOf(code: string): number {
  let status = 0
  const res = {
    writeHead(s: number) { status = s; return res },
    end() { return res },
  } as unknown as ServerResponse
  fail(res, Object.assign(new Error('探测'), { code }))
  return status
}

describe('① HTTP 状态：两个新码必须是 400（不是 500）', () => {
  it.each(INTERNAL)('%s → 400', (code) => {
    expect(statusOf(code)).toBe(400)
  })

  it('这条断言的价值：未登记的码会落 500——所以"400"证明它**被显式登记**过', () => {
    expect(statusOf('this_code_is_not_registered')).toBe(500)
  })
})

describe('② 会话侧传输码：内部码 ↔ 传输码成对', () => {
  it.each(INTERNAL)('%s 有传输码，且不是"原样透传"', (code) => {
    const transport = transportCodeOf(code)
    expect(transport, '没有映射就等于会话侧报英文码').not.toBe(code)
    expect(transport.startsWith('REQBOARD_')).toBe(true)
  })

  it('映射到预期的两个传输码（逐字）', () => {
    expect(transportCodeOf('prototype_placeholder')).toBe('REQBOARD_PROTOTYPE_PLACEHOLDER')
    expect(transportCodeOf('prototype_geometry_unverified')).toBe('REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED')
  })

  it('既有三门同表仍在（没被这次改动挤掉）', () => {
    expect(transportCodeOf('prototype_missing')).toBe('REQBOARD_MISSING_PROTOTYPE')
    expect(transportCodeOf('prototype_anchor_missing')).toBe('REQBOARD_PROTOTYPE_ANCHOR_MISSING')
  })
})

describe('③ 中文类别名：两键都在且值非空', () => {
  // 这张表以**内部码**为键（面板拿到的是内部码）——两侧都断言，避免"我按错了键"这种假绿
  it.each(INTERNAL)('%s 有中文类别名', (code) => {
    const label = ERROR_CATEGORY[code]
    expect(label, '缺类别名时面板显示英文码原文——降级是沉默，不是崩').toBeDefined()
    expect(String(label).trim().length).toBeGreaterThan(0)
  })

  it('类别名是中文（不是把英文码抄一遍）', () => {
    for (const code of INTERNAL) {
      expect(ERROR_CATEGORY[code]).toMatch(/[\u4e00-\u9fff]/)
    }
  })
})

// ── ④ 信封 how 必须含可执行锚点（GATE_HOW_ANCHOR）───────────────────────────────
// 用**真实门**产出信封，而不是手写一段文案来断言：手写的文案可能比实现更好看，
// 那样这条用例就只在测"我抄对了没有"。
const REQ_ID = 'REQ-0000c1'
const DIR = 'docs/requirements/' + REQ_ID
const INDEX_MD = [
  '# 原型清单', '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |', '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-1 | |',
].join('\n')

const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
})
const reqOf = () => ({
  id: REQ_ID, category: 'feature', createdAt: Date.parse('2026-10-07T00:00:00.000Z'),
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: DIR + '/requirement.md' }],
} as never)

const SKELETON = PROTOTYPE_HTML_SKELETON
  .replaceAll('{{TITLE}}', 't').replaceAll('{{REQ_ID}}', REQ_ID).replaceAll('{{DATE}}', '2026-10-07')

describe('④ 信封 how 含可执行锚点（真实门产出的文案）', () => {
  it('prototype_placeholder 的信封命中 GATE_HOW_ANCHOR', async () => {
    const files = {
      [DIR + '/requirement.md']: '---\nsides: [frontend]\n---\n# 需求',
      [DIR + '/prototypes/INDEX.md']: INDEX_MD,
      [DIR + '/prototypes/detail.html']: SKELETON,
    }
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), {
      skeleton: { skeletonTemplate: () => SKELETON },
    })
    expect(r?.code).toBe('prototype_placeholder')
    expect(r?.message, 'how 缺可执行锚点＝人读完不知道该敲哪条命令').toMatch(GATE_HOW_ANCHOR)
    expect(r?.message).toContain('reqboard_submit')
  })

  it('prototype_geometry_unverified 的信封命中 GATE_HOW_ANCHOR', async () => {
    // 一份"填过"的原型 + 一条对不上的摘要（用真实实现产出门，不手写信封）
    const html = [
      '<!DOCTYPE html><html><body><section id="FR-1">真实区块</section>',
      '<!-- proto-geometry {"observations":[{"name":"cardWidth","value":642,"unit":"px",'
        + '"at":{"width":1280,"state":"inflight"},"shot":"evidence/x.png","shotSha256":"' + 'a'.repeat(64) + '"}]} -->',
      '</body></html>',
    ].join('\n')
    const files = {
      [DIR + '/requirement.md']: '---\nsides: [frontend]\n---\n# 需求',
      [DIR + '/prototypes/INDEX.md']: INDEX_MD,
      [DIR + '/prototypes/detail.html']: html,
    }
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), {
      evidence: { shotExists: () => true, sha256Of: async () => 'b'.repeat(64) },
    })
    expect(r?.code).toBe('prototype_geometry_unverified')
    expect(r?.message).toMatch(GATE_HOW_ANCHOR)
    expect(r?.message).toContain('reqboard_submit')
  })
})

describe('⑤ 三处身份同源：码字面量在实现里逐字一致', () => {
  it('内部码与传输码常量能在各自文件里找到（防止改名只改一处）', () => {
    const envelope = repo('src/http/envelope.ts')
    const move = repo('src/application/use-cases/MoveRequirement.ts')
    const shared = repo('src/client/toolviews/shared.ts')
    for (const code of INTERNAL) expect(envelope).toContain(code + ':')
    for (const t of TRANSPORT) expect(move).toContain("'" + t + "'")
    for (const code of INTERNAL) expect(shared).toContain(code + ':')
  })
})
