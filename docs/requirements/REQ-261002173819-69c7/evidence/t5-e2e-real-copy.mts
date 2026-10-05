/**
 * 真实台账副本上的路由级端到端（REQ-261002173819-69c7 t5 证据）。
 *
 * 为什么这样做：卡面要求的"实机端到端"要等宿主重载插件 + 人点继续，agent 做不了。
 * 这里退一步但仍然是**真实数据 + 真实实现**：把生产台账整份复制到临时目录，
 * 用真实仓储 + 真实 HTTP 路由跑一次「继续」，验证 277d 那条真实记录会被正确接回。
 * 全程只读生产文件（跑完比对 sha256），不写生产台账。
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonLedgerRepository } from '../../../../src/adapters/JsonLedgerRepository.js'
import { createReqboardHandler } from '../../../../src/http/routes.js'
import { isDrivableRequirement } from '../../../../src/application/dive/round-state.js'

const REAL = process.env['HOME'] + '/.dsh/dsh-reqboard.json'
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
const REQ_ID = 'REQ-261002161439-277d'

const before = sha(REAL)
const raw = JSON.parse(readFileSync(REAL, 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'reqboard-e2e-'))
const copy = join(dir, 'dsh-reqboard.json')
writeFileSync(copy, JSON.stringify(raw))

const store = new JsonLedgerRepository({ file: copy })
// 仓储是懒加载：先读一次，否则首个 snapshot() 还是空台账（实测：直接 snapshot 会打印 0 条）。
await store.read(() => undefined)
const seedRec = store.snapshot().requirements.find((r) => r.id === REQ_ID)
console.log('【副本端到端】台账需求总数 =', store.snapshot().requirements.length)
console.log('【基线】', REQ_ID, 'dive =', JSON.stringify(seedRec?.dive))

const handler = createReqboardHandler({
  store: store as never,
  now: () => Date.now(),
  docs: { exists: () => false, read: async () => '', write: async () => {}, list: () => [], workspaceRoot: () => dir } as never,
} as never)

const { EventEmitter } = await import('node:events')
function fakeReq(body: unknown, url: string): never {
  const r = new EventEmitter() as never as { url: string; method: string; [Symbol.asyncIterator]: unknown }
  r.url = url
  r.method = 'POST'
  ;(r as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return r as never
}
const res = new EventEmitter() as unknown as Record<string, unknown>
res['statusCode'] = 0
res['writeHead'] = (c: number) => { res['statusCode'] = c; return res }
let payload = ''
res['end'] = (t?: string) => { payload = t ?? ''; return res }

await (handler as unknown as (a: unknown, b: unknown) => Promise<void>)(
  fakeReq({ id: REQ_ID, on: true }, '/dashboard/api/reqboard/req/autorun'), res as never,
)

const body = JSON.parse(payload) as { data?: Record<string, unknown> }
const after = store.snapshot().requirements.find((r) => r.id === REQ_ID)!
const comments = (after.comments ?? []).map((c) => String(c.body)).join('\n')
console.log('【响应】statusCode =', res['statusCode'])
console.log('【结果】dive =', JSON.stringify(after.dive))
console.log('【判据】isDrivableRequirement =', isDrivableRequirement(after))
console.log('【留痕】含 [Dive 重新武装] =', comments.includes('[Dive 重新武装]'))
console.log('【响应键】', Object.keys((body.data ?? {}) as object).sort().join(','))
console.log('【生产台账未被改写】sha256 相同 =', sha(REAL) === before)

const ok =
  after.dive?.activation === 'armed' &&
  after.dive?.phase === 'active' &&
  isDrivableRequirement(after) &&
  comments.includes('[Dive 重新武装]') &&
  sha(REAL) === before
console.log(ok ? 'E2E-COPY: PASS' : 'E2E-COPY: FAIL')
rmSync(dir, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
