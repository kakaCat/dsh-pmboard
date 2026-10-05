/**
 * 迁移与兼容：存量零改写 + 回滚开关（REQ-261003215944-9e04 FR-2/FR-9/FR-11 · t13）。
 *
 * 【为什么要有这道门】
 * 本需求往台账里加了 `seats`、往读路径加了「会话工作区」——两者都可能悄悄改写 39 条存量数据，
 * 或让运维在出问题时无路可退。这道门把两件事钉死：
 *   ① **读不写盘**：老形态记录（无 seats、无 driverHealth）读一遍，磁盘字节不变；
 *   ② **有退路**：`docsRootSource='legacy-cwd'` 一条配置回到改造前的读根行为；
 * 外加一条底线：台账 schema 版本**不因新增可缺省字段而升**（升了就意味着批量迁移与不可回滚）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { seatsOf } from '../src/application/internal/window.js'
import { docsRootSourceSetting, seatsMaxSetting } from '../src/plugin-config.js'
import { REQBOARD_SCHEMA_VERSION } from '../src/shared/protocol.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { makeTestStore } from './application/harness.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { EventEmitter } from 'node:events'

const SESSION = 'session-278681bb-b160-4067-8740-3d5a0f2c7426'

/** 老形态记录：**没有** seats、**没有** driverHealth（改造前落盘的形状）。 */
function legacyRecord(i: number): Record<string, unknown> {
  return {
    id: `REQ-2610032159${String(10 + i).padStart(2, '0')}-${i.toString(16).padStart(4, '0').slice(0, 4)}`,
    title: `存量需求 ${i}`,
    description: '改造前落盘的老形态',
    status: 'implementing',
    blocked: false,
    comments: [], version: 3, createdAt: 100 + i, updatedAt: 200 + i,
    createdBy: { kind: 'agent' }, updatedBy: { kind: 'agent' },
    sourceSessionId: `session-legacy-${i}`,
    dive: { phase: 'active', activation: 'armed', roundsInStage: 1 + i },
  }
}

/** 递归收集目录下所有文件的「路径 → 内容哈希」。 */
function hashAll(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string, base = ''): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) { walk(abs, base + name + '/'); continue }
      out[base + name] = createHash('sha256').update(readFileSync(abs)).digest('hex')
    }
  }
  if (statSync(root, { throwIfNoEntry: false }) !== undefined) walk(root)
  return out
}

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pmboard-legacy-compat-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('配置开关：默认值与非法值', () => {
  it('docsRootSource 缺省 session；显式 legacy-cwd 生效；非法值装配期抛错', () => {
    expect(docsRootSourceSetting(undefined)).toBe('session')
    expect(docsRootSourceSetting({})).toBe('session')
    expect(docsRootSourceSetting({ docsRootSource: 'legacy-cwd' })).toBe('legacy-cwd')
    expect(() => docsRootSourceSetting({ docsRootSource: 'nope' as never })).toThrow(/docsRootSource/)
  })

  it('seatsMax 缺省 8；必须是 ≥1 的整数，否则抛错', () => {
    expect(seatsMaxSetting(undefined)).toBe(8)
    expect(seatsMaxSetting({ seatsMax: 3 })).toBe(3)
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => seatsMaxSetting({ seatsMax: bad })).toThrow(/seatsMax/)
    }
  })

  it('台账 schema 版本保持 9（新增字段全部可缺省 ⇒ 不迁移、可回滚）', () => {
    expect(REQBOARD_SCHEMA_VERSION).toBe(9)
  })
})

describe('存量零改写：读一遍老台账，磁盘字节不变', () => {
  it('39 条老形态记录：折算出单 owner，且 record.json 逐文件哈希不变', async () => {
    const store = new ShardedRequirementStore({ root, onWarn: () => { /* 本用例不关心告警 */ } })
    const N = 39
    for (let i = 0; i < N; i++) {
      await store.create(legacyRecord(i) as never, { kind: 'agent' })
    }
    const before = hashAll(root)
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(N) // 每条至少一个文件

    // 读路径走一遍：列表 + 逐条取全文 + 读端折算
    const page = await store.listSummaries({ scope: 'all', limit: 1000 })
    expect(page.items).toHaveLength(N)
    const owners: string[] = []
    for (const sm of page.items) {
      const rec = (await store.get(sm.id))!
      const seats = seatsOf(rec)
      expect(seats).toHaveLength(1)                    // 老形态折算成单 owner
      expect(seats[0]!.role).toBe('owner')
      expect(seats[0]!.windowKey).toBe(rec.sourceSessionId)
      expect(seats[0]!.joinedAt).toBe(rec.createdAt)   // 入席时间取立项时间，不冒充 0
      owners.push(seats[0]!.windowKey)
    }
    expect(new Set(owners).size).toBe(N)               // 每个窗口各一条，未互相覆盖

    const after = hashAll(root)
    expect(after).toEqual(before)                      // 零改写（逐文件哈希相等）
  })
})

describe('回滚开关：legacy-cwd 回到改造前的读根', () => {
  async function call(handler: (req: unknown, res: unknown) => Promise<void>, method: 'GET' | 'POST', url: string, body?: unknown) {
    const req = new EventEmitter() as any
    req.url = '/dashboard/api/reqboard' + url
    req.method = method
    req[Symbol.asyncIterator] = async function* () { if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8') }
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.writeHead = (code: number) => { res.statusCode = code; return res }
    res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
    await handler(req, res)
    return res.payload
  }

  it('开（session）：会话工作区里的文档可打开；关（legacy-cwd = 不装配解析器）：回到"判不存在"', async () => {
    // 会话工作区：有 README.md
    const sessionWs = join(root, 'session-ws')
    mkdirSync(sessionWs, { recursive: true })
    writeFileSync(join(sessionWs, 'README.md'), '# 会话工作区里的 README\n')
    // 插件宿主目录：**故意**是另一个空目录（回滚后读的就是它）
    const hostCwd = join(root, 'host-cwd')
    mkdirSync(hostCwd, { recursive: true })

    const on = createReqboardHandler({
      requirementStore: makeTestStore(), applicationDeps: {} as never,
      taskStore: new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: hostCwd }), now: () => 1 }),
      now: () => 1, cwd: hostCwd,
      sessionWorkspace: (sid: string | undefined) => (sid === SESSION ? sessionWs : undefined),
    } as never) as (req: unknown, res: unknown) => Promise<void>

    const opened = await call(on, 'POST', '/docs/resolve', { paths: ['README.md'], sessionId: SESSION })
    expect(opened.data.results[0].openable).toBe(true)

    // 回滚：配置取 legacy-cwd 时组合根**不装配** sessionWorkspace ⇒ 走宿主目录
    const off = createReqboardHandler({
      requirementStore: makeTestStore(), applicationDeps: {} as never,
      taskStore: new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: hostCwd }), now: () => 1 }),
      now: () => 1, cwd: hostCwd,
    } as never) as (req: unknown, res: unknown) => Promise<void>
    const closed = await call(off, 'POST', '/docs/resolve', { paths: ['README.md'], sessionId: SESSION })
    expect(closed.data.results[0].openable).toBe(false)
    expect(closed.data.results[0].reason).toContain('文件不存在')

    // 且状态接口会如实告诉调用方"这次用的是哪个根"
    const state = await call(on, 'GET', '/state?session=' + SESSION)
    expect(state.data.docsRootSource).toBe('session')
    const stateOff = await call(off, 'GET', '/state?session=' + SESSION)
    expect(stateOff.data.docsRootSource).toBe('legacy-cwd')
  })
})
