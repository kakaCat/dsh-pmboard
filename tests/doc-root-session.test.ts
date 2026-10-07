/**
 * 文档读根与会话同源（REQ-261003215944-9e04 FR-11 · t12）。
 *
 * 【现场】看板/右侧栏打开工作区文档报「文件不存在，可能已被移动或删除」。实测根因是**读根取错**：
 * HTTP 服务跑在**插件宿主**的工作目录（实测 `~/.dsh/profiles/<profile>`），而文档躺在**会话工作区**里。
 * 于是除 `docs/requirements/<REQ>/`（有需求级回退兜着）之外的工作区文档一律被判不存在——
 * 实测 `README.md` / `docs/knowledge/INDEX.md` / `docs/handoff/*.md` 三条全灭。
 *
 * 【本文件锁四件事】
 *   1. `/state?session=<id>` 下发的 `workspaceRoot` **等于会话工作区**（不再是宿主 cwd），并如实标注来源；
 *   2. 不带会话 id（或解析不到）时回落 legacy cwd，且 `docsRootSource` 如实写 `legacy-cwd`（不静默降级）；
 *   3. `/docs/resolve` 带会话 id 时，**需求目录之外**的工作区文档也 `openable:true`；
 *      不带会话 id 时它们仍是 `not_found`——这既是修复证据，也是"根真的换了"的对照；
 *   4. `/file` 读全文与预检**同根**（同一处 resolveDocRoot），不会"预检说能开、点开打不开"。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { expectCode } from './helpers/code-assert.js'

const SESSION = 'session-278681bb-b160-4067-8740-3d5a0f2c7426'
const README = '# 项目说明\n\n这是工作区根下的 README 正文。\n'
const INDEX = '# 知识层索引\n\n这是 docs/knowledge/INDEX.md 的正文。\n'

let sessionWs: string
let hostCwd: string

beforeEach(() => {
  // 会话工作区：文档真正所在的地方
  sessionWs = mkdtempSync(join(tmpdir(), 'pmboard-session-ws-'))
  mkdirSync(join(sessionWs, 'docs', 'knowledge'), { recursive: true })
  writeFileSync(join(sessionWs, 'README.md'), README)
  writeFileSync(join(sessionWs, 'docs', 'knowledge', 'INDEX.md'), INDEX)
  // 插件宿主工作目录：**故意**是个空目录，模拟"服务跑在 profile 目录"的真实形态
  hostCwd = mkdtempSync(join(tmpdir(), 'pmboard-host-cwd-'))
})

afterEach(() => {
  rmSync(sessionWs, { recursive: true, force: true })
  rmSync(hostCwd, { recursive: true, force: true })
})

/** 装配真实路由；sessionWorkspace 只认本文件那个会话 id（其余 → undefined，走回落）。 */
function makeHandler() {
  const store = makeTestStore()
  const taskStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: hostCwd }), now: () => 1 })
  return createReqboardHandler({
    requirementStore: store,
    applicationDeps: { store } as never,
    taskStore,
    now: () => 1000,
    cwd: hostCwd,
    sessionWorkspace: (sid: string | undefined) => (sid === SESSION ? sessionWs : undefined),
  } as never) as (req: unknown, res: unknown) => Promise<void>
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

async function call(handler: (req: unknown, res: unknown) => Promise<void>, method: 'GET' | 'POST', url: string, body?: unknown) {
  const req = new EventEmitter() as any
  req.url = '/dashboard/api/reqboard' + url
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  const res = fakeRes()
  await handler(req, res)
  return res.payload
}

describe('FR-11：文档读根与会话同源', () => {
  it('① /state 带会话 id → workspaceRoot 等于**会话工作区**，并标注来源为 session', async () => {
    const p = await call(makeHandler(), 'GET', '/state?session=' + SESSION)
    expect(p.success).toBe(true)
    expect(p.data.workspaceRoot).toBe(sessionWs)
    expect(p.data.sessionWorkspaceRoot).toBe(sessionWs)
    expect(p.data.docsRootSource).toBe('session')
    expect(p.data.workspaceRoot).not.toBe(hostCwd)
  })

  it('② /state 不带会话 id（或会话解析不到）→ 回落 legacy cwd，且**如实标注** legacy-cwd', async () => {
    const noSession = await call(makeHandler(), 'GET', '/state')
    expect(noSession.data.workspaceRoot).toBe(hostCwd)
    expect(noSession.data.sessionWorkspaceRoot).toBeUndefined()
    expect(noSession.data.docsRootSource).toBe('legacy-cwd')

    const unknownSession = await call(makeHandler(), 'GET', '/state?session=session-unknown')
    expect(unknownSession.data.workspaceRoot).toBe(hostCwd)
    expect(unknownSession.data.docsRootSource).toBe('legacy-cwd')
  })

  it('③ /docs/resolve 带会话 id → 需求目录**之外**的文档也 openable（修复前三条全灭）', async () => {
    const p = await call(makeHandler(), 'POST', '/docs/resolve', {
      paths: ['README.md', 'docs/knowledge/INDEX.md'],
      sessionId: SESSION,
    })
    const byPath = Object.fromEntries(p.data.results.map((r: any) => [r.path, r]))
    expect(byPath['README.md'].openable).toBe(true)
    expect(byPath['docs/knowledge/INDEX.md'].openable).toBe(true)
    expect(byPath['README.md'].reason).toBeUndefined()
  })

  it('③对照 /docs/resolve 不带会话 id → 同样两条判 not_found（证明"能开"是换根换来的）', async () => {
    const p = await call(makeHandler(), 'POST', '/docs/resolve', { paths: ['README.md', 'docs/knowledge/INDEX.md'] })
    for (const r of p.data.results) {
      expect(r.openable).toBe(false)
      expect(r.reason).toContain('文件不存在')
    }
  })

  it('④ /file 读全文与预检同根：带会话 id 能读到正文', async () => {
    const ok = await call(makeHandler(), 'GET', '/file?path=README.md&session=' + SESSION)
    expect(ok.success).toBe(true)
    expect(ok.data.content).toBe(README)

    const miss = await call(makeHandler(), 'GET', '/file?path=README.md')
    expect(miss.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（文件不存在 = notFound → not_found）
    expectCode(miss, 'not_found')
    expect(String(miss.error)).toContain('文件不存在')
  })

  it('⑤ 需求目录内的文档两种根下都能开（需求级回退仍在，不是把老路拆了）', async () => {
    const rel = 'docs/requirements/REQ-261003215944-9e04/requirement.md'
    mkdirSync(join(sessionWs, 'docs', 'requirements', 'REQ-261003215944-9e04'), { recursive: true })
    writeFileSync(join(sessionWs, rel), '# 需求\n')
    const p = await call(makeHandler(), 'POST', '/docs/resolve', { paths: [rel], sessionId: SESSION })
    expect(p.data.results[0].openable).toBe(true)
  })
})
