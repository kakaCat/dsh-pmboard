/**
 * 知识层只读路由测试（REQ-261001110934-3766 t5）。
 *
 * 锁四件事（对应 t5 验收）：
 *  ① `GET /kb?kind=…` → 200、信封 `success/data`、items 与工具同构、另带 `pages[]`；
 *  ② `budget_chars=300` → `truncated=true`（只回指针，与工具同口径）；
 *  ③ 参数非法（`budget_chars=0`）→ **400**（走既有错误映射，不新造状态码）；
 *  ④ 未装配知识层 → 200 + 空集 + hint（看板不因此变红）；既有路由抽样仍正常。
 *
 * @module dsh-pmboard/tests/kb-route
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { KnowledgeRepository } from '../src/adapters/KnowledgeRepository.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import { KB_PATHS, entryPath } from '../src/domain/knowledge/types.js'

const SECTIONS = ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']

function indexDoc(): string {
  const lines = ['# 索引', '', '> 摘要', '', '## 架构', '- kb-architecture-layers · architecture · 四层职责与依赖方向 · → architecture.md#layers', '']
  for (const s of SECTIONS.slice(1)) {
    lines.push('## ' + s, '')
    if (s === '决策') lines.push('- kb-0007 · decision · 20 万 token 以下整装更便宜 · → entries/kb-0007.md')
    lines.push(KB_PATHS.generatedBegin, KB_PATHS.generatedEnd, '')
  }
  return lines.join('\n')
}

const ARCH_PAGE = ['# 架构总览', '', '## 分层与依赖方向 #layers', '', 'domain ← application ← adapters / tools / http', ''].join('\n')

let dir: string
let store: ReturnType<typeof makeTestStore>

function fakeReq(url: string): any {
  const req = new EventEmitter() as any
  req.url = '/dashboard/api/reqboard' + url
  req.method = 'GET'
  req[Symbol.asyncIterator] = async function* () {}
  return req
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

function handler(withKnowledge: boolean) {
  const docs = new FileDocRepository({ workspaceRoot: dir })
  const applicationDeps: Record<string, unknown> = { docs }
  if (withKnowledge) applicationDeps['knowledge'] = new KnowledgeRepository(docs)
  return createReqboardHandler({ requirementStore: store,

    taskStore: taskStoreAt(dir),
    now: () => Date.now(),
    docs,
    cwd: dir,
    applicationDeps,
  } as never)
}

async function get(h: ReturnType<typeof createReqboardHandler>, url: string) {
  const res = fakeRes()
  await h(fakeReq(url), res)
  return res
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kb-route-'))
  store = makeTestStore()
  mkdirSync(join(dir, 'docs/knowledge/entries'), { recursive: true })
  writeFileSync(join(dir, KB_PATHS.index), indexDoc(), 'utf8')
  writeFileSync(join(dir, 'docs/knowledge/architecture.md'), ARCH_PAGE, 'utf8')
  writeFileSync(join(dir, entryPath('kb-0007')), [
    '---', 'id: kb-0007', 'kind: decision', 'status: active',
    'title: 知识层不做向量检索', 'one_liner: 20 万 token 以下整装更便宜',
    'applies_when: 有人提议引入向量库时', 'pointer: ""',
    'updated: 2026-10-01', 'expires: 2027-03-30', '---', '',
    '## 结论', '不做。', ...Array.from({ length: 20 }, (_, i) => '理由第 ' + String(i + 1) + ' 条：' + 'x'.repeat(40)),
    '', '## 适用条件', 'x', '', '## 证据', 'x', '', '## 失效条件', 'x', '', '## 相关', 'x',
  ].join('\n'), 'utf8')
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('GET /kb', () => {
  it('kind=architecture → 200，items 与工具同构，附 pages[]', async () => {
    const res = await get(handler(true), '/kb?kind=architecture&budget_chars=1500')
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
    const data = res.payload.data
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items[0].id).toBe('kb-architecture-layers')
    expect(data.budgetChars).toBe(1500)
    expect(Array.isArray(data.pages)).toBe(true)
    expect(data.pages.some((p: { path: string }) => p.path.endsWith('architecture.md'))).toBe(true)
    expect(typeof data.pages[0].lines).toBe('number')
  })

  it('budget_chars=300 → truncated=true（与工具同口径：只回指针）', async () => {
    const res = await get(handler(true), '/kb?id=kb-0007&budget_chars=300')
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.truncated).toBe(true)
    expect(res.payload.data.items[0].body).toBeUndefined()
  })

  it('id 精确取条目 → 带回正文；query 也能命中', async () => {
    const byId = await get(handler(true), '/kb?id=kb-0007&budget_chars=8000')
    expect(byId.payload.data.items[0].body).toContain('不做。')
    // 检索范围 = 索引层（id / 一句话 / 指针）——不读正文，这是"零额外 IO 命中"的代价与边界
    const byQuery = await get(handler(true), '/kb?query=整装&budget_chars=8000')
    expect(byQuery.payload.data.items.map((i: { id: string }) => i.id)).toEqual(['kb-0007'])
  })

  it('参数非法 → 400（既有错误映射，不新造状态码）', async () => {
    const res = await get(handler(true), '/kb?budget_chars=0&kind=decision')
    expect(res.statusCode).toBe(400)
    expect(res.payload.success).toBe(false)
  })

  it('未装配知识层 → 200 + 空集 + hint（看板不红）', async () => {
    const res = await get(handler(false), '/kb?kind=decision')
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.items).toEqual([])
    expect(res.payload.data.hint).toContain('未装配')
  })

  it('既有路由抽样仍正常（本次只新增 /kb）', async () => {
    const res = await get(handler(true), '/state')
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
  })
})
