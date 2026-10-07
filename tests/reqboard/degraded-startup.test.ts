/**
 * 未就绪启动（REQ-261003191948-e94a）· t2：HTTP 信封与「迁移门 → 503」映射。
 *
 * 为什么单独测这一层：未就绪 handler（t3）与正常路由必须回**同形**信封，
 * 而"同形"的保证就是两者共用 `src/http/envelope.ts`。这里把映射与 `hint` 透出钉死，
 * 免得将来某条新路径忘了映射，把"用户可自救的 503"退化成 500。
 *
 * 手法：最小假 res（收集 statusCode / body），零网络、零宿主。
 */
import { describe, expect, it, afterEach } from 'vitest'
import type { ServerResponse } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fail, ok } from '../../src/http/envelope.js'
import { createNotReadyHandler } from '../../src/http/not-ready.js'
import { enterNotReadyMode, NOT_READY_ROUTE_PATH } from '../../src/wiring/not-ready.js'
import { initCaptureDiag } from '../../src/application/internal/diag-log.js'
import { REQUIRES_MIGRATION, type MigrationFailure } from '../../src/repositories/migrationGate.js'
import { expectCode } from '../helpers/code-assert.js'

interface Captured {
  status: number
  headers: Record<string, string>
  body: string
  endCount: number
}

/** 最小 ServerResponse 替身：只实现 writeHead / end 两个被信封用到的成员。 */
function fakeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: '', endCount: 0 }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status
      captured.headers = headers
      return res
    },
    end(body?: string) {
      captured.endCount += 1
      captured.body = body ?? ''
      return res
    },
  }
  // 刻意**只**实现被信封用到的两个成员：多实现一分就少一分"信封真的只依赖这两个"的证据。
  return { res: res as unknown as ServerResponse, captured }
}

/** 未就绪夹具：与迁移门真实产物同形（code 用字面量类型）。 */
function failureFixture(ledgerFile = '/tmp/a.json', dataRoot = '/tmp/reqboard'): MigrationFailure {
  return {
    code: REQUIRES_MIGRATION,
    message: `检测到 legacy 单册 ${ledgerFile}，但数据根 ${dataRoot} 尚未迁移（缺 meta.json）。`,
    hint: `检测到 legacy 单册但数据根尚未迁移（缺 meta.json）。请执行：\n`
      + `node --import tsx/esm scripts/migrate-ledger-v10.ts --file ${ledgerFile} --out ${dataRoot} --apply`,
    ledgerFile,
    dataRoot,
  }
}

const parsed = (c: Captured): Record<string, unknown> => JSON.parse(c.body) as Record<string, unknown>

describe('未就绪启动 t2 · 迁移门的 HTTP 映射与 hint 透出', () => {
  it('REQBOARD_REQUIRES_MIGRATION → 503，且 hint 原样透出（FR-2 / FR-3）', () => {
    const { res, captured } = fakeRes()
    const hint = '检测到 legacy 单册但数据根尚未迁移（缺 meta.json）。请执行：\n'
      + 'node --import tsx/esm scripts/migrate-ledger-v10.ts --file /tmp/a.json --out /tmp/reqboard --apply'
    fail(res, { code: 'REQBOARD_REQUIRES_MIGRATION', message: '台账未迁移', hint })

    expect(captured.status).toBe(503)
    const body = parsed(captured)
    expect(body.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（未迁移 → 503 且 code 原样带出）
    expectCode(body, 'REQBOARD_REQUIRES_MIGRATION')
    expect(body.code).toBe('REQBOARD_REQUIRES_MIGRATION')
    expect(body.error).toBe('台账未迁移')
    expect(body.hint).toBe(hint) // 逐字相等：三形状等价性（data-model.md）
    expect(captured.headers['Cache-Control']).toBe('no-store')
  })

  it('既有 REQBOARD_BRIDGE_NOT_READY 仍为 503，且响应体**不含** hint 键（形状不漂移）', () => {
    const { res, captured } = fakeRes()
    fail(res, { code: 'REQBOARD_BRIDGE_NOT_READY', message: '台账装配中' })

    expect(captured.status).toBe(503)
    const body = parsed(captured)
    expect(body.code).toBe('REQBOARD_BRIDGE_NOT_READY')
    expect('hint' in body).toBe(false) // 不带 hint 的错误，响应体逐字节不变
  })

  it('hint 非字符串/空串一律不透出（不制造假命令）', () => {
    for (const bad of [undefined, null, '', 42, { cmd: 'x' }]) {
      const { res, captured } = fakeRes()
      fail(res, { code: 'REQBOARD_REQUIRES_MIGRATION', message: 'x', hint: bad })
      expect('hint' in parsed(captured), 'hint=' + String(bad)).toBe(false)
    }
  })

  it('既有映射零回退：404 / 400 / 403 / 500 各就各位', () => {
    const cases: [string, number][] = [
      ['REQBOARD_NOT_FOUND', 404],
      ['not_found', 404],
      ['invalid_input', 400],
      ['artifact_not_confirmed', 400],
      ['human_gate', 403],
      ['something_else', 500],
      [undefined as unknown as string, 500],
    ]
    for (const [code, expected] of cases) {
      const { res, captured } = fakeRes()
      fail(res, { code, message: 'm' })
      expect(captured.status, 'code=' + String(code)).toBe(expected)
    }
  })

  it('ok() 仍是 200 + success:true（信封搬迁零行为变更）', () => {
    const { res, captured } = fakeRes()
    ok(res, { status: 'ok' })
    expect(captured.status).toBe(200)
    expect(parsed(captured)).toEqual({ success: true, data: { status: 'ok' } })
  })
})

/**
 * t3 · 降级 handler（FR-2 / FR-5）。
 *
 * 这一组是本需求的核心断言：**未就绪态绝不返回 404、绝不返回空册**。
 * 2026-10-03 事故里用户看到的"404"就是这里缺一条路由造成的。
 */
const tmpRoots: string[] = []
afterEach(() => { for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true }) })

describe('未就绪启动 t3 · 降级 handler：任何方法/路径都回 503（不是 404）', () => {
  const cases: [string, string][] = [
    ['GET', '/state'],
    ['GET', '/health'],
    ['POST', '/req/create'],
    ['GET', '/nope'],
  ]

  it('四类请求全 503，且信封与正常路由同形（A1 / A2）', async () => {
    const handler = createNotReadyHandler(failureFixture())
    for (const [method, url] of cases) {
      const { res, captured } = fakeRes()
      await handler({ method, url } as never, res)
      const label = method + ' ' + url
      expect(captured.status, label).toBe(503)
      expect(captured.status, label + ' 绝不能是 404').not.toBe(404)
      const body = parsed(captured)
      expect(body.success, label).toBe(false)
      expect(body.code, label).toBe(REQUIRES_MIGRATION)
      expect(String(body.error ?? '').length, label).toBeGreaterThan(0)
      expect(String(body.hint ?? '').length, label).toBeGreaterThan(0)
    }
  })

  it('SSE 路径不挂起：先写头再 end，恰好一次，不写 event-stream（A1）', async () => {
    const handler = createNotReadyHandler(failureFixture())
    const { res, captured } = fakeRes()
    await handler({ method: 'GET', url: '/events' } as never, res)
    expect(captured.status).toBe(503)
    expect(captured.endCount, '必须立即结束，不得进事件循环等推送').toBe(1)
    expect(captured.headers['Content-Type']).toContain('application/json')
    expect(JSON.stringify(captured.headers)).not.toContain('event-stream')
  })

  it('零副作用：不建数据根、不写 meta.json（A5 / FR-5）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-notready-'))
    tmpRoots.push(root)
    const dataRoot = join(root, 'reqboard')
    const handler = createNotReadyHandler(failureFixture(join(root, 'dsh-reqboard.json'), dataRoot))
    for (const [method, url] of cases) {
      const { res } = fakeRes()
      await handler({ method, url } as never, res)
    }
    expect(existsSync(dataRoot)).toBe(false)
    expect(existsSync(join(dataRoot, 'meta.json'))).toBe(false)
  })
})

/**
 * t4 · 接线（FR-1 / FR-5 / FR-6）。
 *
 * 假 ctx 捕获注入与注册调用；假 logger 捕获 error。**刻意断言只注入 webServer**——
 * 未就绪态注册工具或挂 systemPrompt 段会让插件"看起来已加载"，比不加载更难排查。
 */
describe('未就绪启动 t4 · 接线：只注册降级路由 + 双通道留痕', () => {
  it('只注入 webServer，注册同前缀的 prefix 路由（FR-1 / FR-5）', () => {
    const injected: string[][] = []
    const registered: unknown[] = []
    const ctx = {
      inject: (services: string[], cb: (c: unknown) => void) => {
        injected.push(services)
        cb({
          effect: (fn: () => void) => { fn() },
          webServer: { register: (r: unknown) => { registered.push(r); return () => {} } },
        })
      },
    }
    const errors: string[] = []
    enterNotReadyMode(ctx as never, failureFixture(), { error: (m: string) => { errors.push(m) } })

    expect(injected, '不得注入 tools / systemPrompt').toEqual([['webServer']])
    expect(registered).toHaveLength(1)
    const route = registered[0] as { kind: string; path: string }
    expect(route.kind).toBe('prefix')
    expect(route.path).toBe(NOT_READY_ROUTE_PATH)
    expect(route.path, '必须与正常路由同前缀，否则"未就绪"与"正常"可能同时挂上').toBe('/dashboard/api/reqboard')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(REQUIRES_MIGRATION)
    expect(errors[0], '日志要带可执行命令，而不只是"失败了"').toContain('--apply')
  })

  it('诊断通道留一条完整记录，不再停在半句话（A6 / FR-6）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-diag-'))
    tmpRoots.push(dir)
    const diag = join(dir, 'state', 'reqboard-capture-diag.log')
    initCaptureDiag(diag)
    enterNotReadyMode({ inject: () => {} } as never, failureFixture(), { error: () => {} })

    const lines = readFileSync(diag, 'utf8').split('\n').filter(l => l.includes('NOT-READY'))
    expect(lines, '一条失败一行').toHaveLength(1)
    expect(lines[0]).toContain(REQUIRES_MIGRATION)
    expect(lines[0]).toContain('--apply')
    expect(lines[0], '多行原因必须压成一行').not.toContain('\n')
  })

  it('静态判据：apply 的分叉只看 preflight.ok，不散落错误码字面量（A7）', () => {
    const src = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
    // 组合根若开始比较具体错误码，"只覆盖迁移门"的边界就会被悄悄放宽
    expect(src).not.toContain('REQBOARD_REQUIRES_MIGRATION')
    expect(src, '未就绪分支必须在建存储之前 return').toContain('enterNotReadyMode(ctx, preflight.failure, logger)')
  })
})
