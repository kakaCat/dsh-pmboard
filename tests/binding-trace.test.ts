/**
 * 绑定改写留痕 + 改绑入口（REQ-261003222428-3556 FR-6 / N-2）。
 *
 * 钉三件事：
 *  ① applyRebind 留痕：评论含 actor/at/from/to；同窗口幂等（不写评论、不变更）；
 *  ② 静态断言：`sourceSessionId` 直接赋值全仓唯一（binding-write.ts）——
 *     新写入点绕开留痕 = 本文件红（反向演练：临时在别处加一处赋值 → 红并点名 → 还原绿）；
 *  ③ agent 面没有改绑入口：工具注册表里不得出现 rebind 字样
 *     （改绑仅开看板 HTTP 通道，人点按钮——与 armExplicit 同纪律）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { applyRebind } from '../src/application/internal/binding-write.js'
import * as toolModules from '../src/tools/index.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const ROOT = fileURLToPath(new URL('../src', import.meta.url))

function listTs(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function makeReq(sourceSessionId?: string): RequirementRecord {
  return {
    id: 'REQ-b', title: 't', description: '', status: 'implementing', blocked: false,
    sourceSessionId, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
}

describe('FR-6 ① applyRebind 留痕（actor/at/from/to）', () => {
  it('改绑写评论：from 旧窗口、to 新窗口、actor、ISO 时刻齐备', () => {
    const r = makeReq('session-old')
    const at = 1_796_000_000_000
    const changed = applyRebind(r, {
      toWindow: 'session-new', actor: { kind: 'human' }, at, commentId: () => 'c-1', reason: '窗口死了改绑',
    })
    expect(changed).toBe(true)
    expect(r.sourceSessionId).toBe('session-new')
    expect(r.comments).toHaveLength(1)
    const body = r.comments[0]!.body
    expect(body).toContain('session-old')                 // from
    expect(body).toContain('session-new')                 // to
    expect(body).toContain('actor=human')                 // actor
    expect(body).toContain(new Date(at).toISOString())    // at
    expect(body).toContain('窗口死了改绑')                 // reason
    expect(r.comments[0]!.createdBy).toEqual({ kind: 'human' })
  })

  it('同窗口幂等：不变更、不刷评论（返回 false）', () => {
    const r = makeReq('session-same')
    const changed = applyRebind(r, {
      toWindow: 'session-same', actor: { kind: 'human' }, at: 1, commentId: () => 'c-x',
    })
    expect(changed).toBe(false)
    expect(r.comments).toHaveLength(0)
  })

  it('首次绑定（from 无）：评论如实写「（无）→ 新窗口」', () => {
    const r = makeReq(undefined)
    const changed = applyRebind(r, { toWindow: 'session-w', actor: { kind: 'agent', sessionId: 'session-w' }, at: 2, commentId: () => 'c-2' })
    expect(changed).toBe(true)
    expect(r.comments[0]!.body).toContain('（无） → session-w')
    expect(r.comments[0]!.body).toContain('actor=agent:session-w')
  })
})

describe('FR-6 ② 静态断言：sourceSessionId 直接赋值全仓唯一（binding-write.ts 豁免）', () => {
  it('src/ 内 `.sourceSessionId =` 赋值只出现在 binding-write.ts', () => {
    const allow = /application[\\/]internal[\\/]binding-write\.ts$/
    const offenders: string[] = []
    for (const file of listTs(ROOT)) {
      if (allow.test(file)) continue
      const src = readFileSync(file, 'utf8')
      // 去注释行（防止注释里的示例误伤；契约只管可执行代码）
      for (const [i, raw] of src.split('\n').entries()) {
        const line = raw.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
        if (/\.sourceSessionId\s*=[^=]/.test(line)) {
          offenders.push(file.replace(ROOT, 'src') + ':' + (i + 1) + ' → ' + raw.trim())
        }
      }
    }
    expect(
      offenders,
      '发现 binding-write.ts 之外的 sourceSessionId 直接赋值（改绑必须走 applyRebind 留痕）：\n' + offenders.join('\n'),
    ).toEqual([])
  })
})

describe('FR-6 ③ 改绑入口仅人可发起（agent 面不存在改绑工具）', () => {
  it('工具注册表无 rebind 字样；HTTP 路由有 req/rebind（看板通道）', () => {
    const toolNames = Object.keys(toolModules as Record<string, unknown>)
    expect(toolNames.filter((n) => /rebind/i.test(n)), 'agent 面出现改绑工具——改绑仅人可发起（human_gate）').toEqual([])
    const routes = readFileSync(join(ROOT, 'http', 'routes.ts'), 'utf8')
    expect(routes).toContain('req/rebind')
  })
})
