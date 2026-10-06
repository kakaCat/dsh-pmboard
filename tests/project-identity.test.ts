// serves: FR-1, FR-2, FR-3, FR-4, FR-8, FR-10, FR-11
/**
 * 项目身份判定的用例（REQ-261005141830-7a3b）。
 *
 * 覆盖：会话→项目（N:1）、项目→根（1:1）、同一项目判据（id 优先 / 路径兜底 / 缺失不猜）。
 * 用例号与 `design/test-cases.md` 的 T-xx 一一对应——`-t T-01` 能单独跑。
 *
 * 判别力纪律（本需求硬要求）：每条判据都必须有"停用即红"的证明，
 * 证据与命令记在完工记录与验收材料里（t9 卡负责汇总）。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
// `node:sqlite` 只能这样取：vite 会把静态 `node:` 导入解析成包名而报 "Failed to load url sqlite"
// （仓库既有做法，见 tests/reqboard/sqlite-store.test.ts）。
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import {
  projectIdOfWindow,
  rootOfProject,
  sameProjectOf,
} from '../src/application/internal/project-identity.js'
import { WorkspaceRegistryProjectPort } from '../src/adapters/WorkspaceRegistryProjectPort.js'
import { toProjectEntries } from '../src/adapters/workspaceRegistryRows.js'
import { SessionWindowOpener } from '../src/adapters/SessionWindowOpener.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SqliteRequirementStore } from '../src/repositories/SqliteRequirementStore.js'
import {
  applyRequirementWorkspaceRoot,
  ensureWritableProjectRoot,
  partitionByProject,
  rootOfRequirement,
} from '../src/application/internal/support.js'
import { makeHarness, makeTestStore } from './application/harness.js'
import { harness as diveLoopHarness, makeReq as makeDiveReq } from './support/dive-loop-harness.js'
import { executeCreateRequirement } from '../src/application/use-cases/CreateRequirement.js'
import { executeMoveRequirement } from '../src/application/use-cases/MoveRequirement.js'
import { bindSeat } from '../src/application/use-cases/BindSeat.js'
import { handoffRequirement } from '../src/application/use-cases/HandoffOwner.js'
import type { RequirementRecord } from '../src/shared/protocol.js'
import type { ProjectEntry } from '../src/application/ports.js'

/** 两个项目：P1 有两个窗口（N:1 的常态），P2 有一个。 */
const P1: ProjectEntry = {
  id: 'w-1',
  path: '/Users/mac/Documents/ai/dsh/dsh-pmboard',
  sessionIds: ['session-x', 'session-y'],
}
const P2: ProjectEntry = {
  id: 'w-2',
  path: '/Users/mac/Documents/ai/dsh/dsh-notice-webhook',
  sessionIds: ['session-z'],
}
const REGISTRY: readonly ProjectEntry[] = [P1, P2]

describe('T-01 会话 → projectId（N : 1）', () => {
  it('T-01 同项目的两个窗口解出同一个 projectId，不同项目解出各自 id', () => {
    expect(projectIdOfWindow(REGISTRY, 'session-x')).toBe('w-1')
    expect(projectIdOfWindow(REGISTRY, 'session-y')).toBe('w-1') // N:1 —— 窗口不唯一标识项目
    expect(projectIdOfWindow(REGISTRY, 'session-z')).toBe('w-2')
  })

  it('T-01 项目表里的窗口集合就是反查键：不在任何 sessionIds 里的会话解析不出 id', () => {
    expect(projectIdOfWindow(REGISTRY, 'session-unknown')).toBeUndefined()
    expect(projectIdOfWindow(REGISTRY, '')).toBeUndefined()
  })
})

describe('T-02 未装配 / 抛错 / 未命中一律 undefined（不抛、不编造）', () => {
  it('T-02 注册表未装配或形态不可用 → undefined', () => {
    expect(new WorkspaceRegistryProjectPort(() => undefined).list()).toBeUndefined()
    expect(new WorkspaceRegistryProjectPort(() => null).list()).toBeUndefined()
    expect(new WorkspaceRegistryProjectPort(() => 'not-an-object').list()).toBeUndefined()
    expect(new WorkspaceRegistryProjectPort(() => ({})).list()).toBeUndefined() // 无 list 方法
    expect(new WorkspaceRegistryProjectPort(() => ({ list: 'not-a-function' })).list()).toBeUndefined()
  })

  it('T-02 取服务抛错 / list 抛错 / list 返回非数组 → undefined（不冒泡）', () => {
    expect(new WorkspaceRegistryProjectPort(() => { throw new Error('boom') }).list()).toBeUndefined()
    expect(new WorkspaceRegistryProjectPort(() => ({ list: () => { throw new Error('boom') } })).list()).toBeUndefined()
    // 非数组 ≠ 空数组：前者是"拿不到"，后者是"确实没有项目"——不给上层混同的机会
    expect(new WorkspaceRegistryProjectPort(() => ({ list: () => 'not-array' })).list()).toBeUndefined()
    expect(new WorkspaceRegistryProjectPort(() => ({ list: () => [] })).list()).toEqual([])
  })

  it('T-02 纯函数面对 undefined 项目表 / 未命中会话，一律 undefined 且不抛', () => {
    expect(projectIdOfWindow(undefined, 'session-x')).toBeUndefined()
    expect(rootOfProject(undefined, 'w-1')).toBeUndefined()
    expect(projectIdOfWindow(REGISTRY, 'session-unknown')).toBeUndefined()
    expect(rootOfProject(REGISTRY, 'w-unknown')).toBeUndefined()
  })

  it('T-02 坏行被跳过、数字 id 归一为字符串（不编造 id）', () => {
    const rows = [
      null,
      'x',
      { path: '/a', sessionIds: ['s1'] }, // 无 id → 跳过
      { id: '', path: '/a', sessionIds: ['s1'] }, // 空 id → 跳过
      { id: 42, path: '/b', sessionIds: ['s2'] }, // 数字 id → '42'
      { id: 'w-3', path: '/c', sessionIds: 'not-array' }, // sessionIds 坏 → 空数组
    ]
    const entries = toProjectEntries(rows)
    expect(entries).toEqual([
      { id: '42', path: '/b', sessionIds: ['s2'] },
      { id: 'w-3', path: '/c', sessionIds: [] },
    ])
    expect(projectIdOfWindow(entries, 's2')).toBe('42')
  })
})

describe('T-03 同一 projectId、路径写法不同 → 判同一项目（id 优先）', () => {
  it('T-03 路径一个是软链、一个带尾斜杠、一个是相对写法，只要 id 相同就是同一项目', () => {
    const a = { projectId: 'w-1', workspaceRoot: '/private/var/proj' }
    const b = { projectId: 'w-1', workspaceRoot: '/var/proj/' }
    const c = { projectId: 'w-1', workspaceRoot: './proj' }
    for (const other of [b, c]) {
      const v = sameProjectOf(a, other)
      expect(v).toEqual({ same: true, attributed: true, by: 'project-id' })
    }
  })

  it('T-03 同 id 但两侧根也一致时同样走 id 判据（根不参与比较）', () => {
    const v = sameProjectOf(
      { projectId: 'w-1', workspaceRoot: '/a' },
      { projectId: 'w-1', workspaceRoot: '/a' },
    )
    expect(v.by).toBe('project-id')
    expect(v.same).toBe(true)
  })
})

describe('T-04 两个不同 projectId、路径字符串同形 → 判不同项目', () => {
  it('T-04 id 不同即不同项目，哪怕路径一模一样', () => {
    const v = sameProjectOf(
      { projectId: 'w-1', workspaceRoot: '/same/path' },
      { projectId: 'w-2', workspaceRoot: '/same/path' },
    )
    expect(v).toEqual({ same: false, attributed: true, by: 'project-id' })
  })
})

describe('T-05 任一侧缺 projectId → 路径兜底且必须标注', () => {
  it('T-05 一侧有 id、一侧只有路径：走路径比较，attributed=false', () => {
    const withId = { projectId: 'w-1', workspaceRoot: '/a' }
    const withoutId = { workspaceRoot: '/a/' }
    const v = sameProjectOf(withId, withoutId)
    expect(v).toEqual({ same: true, attributed: false, by: 'path-fallback' })
  })

  it('T-05 两侧都缺 id 且路径相同（含尾斜杠差异）→ 判同一项目但如实标注未归属', () => {
    const v = sameProjectOf({ workspaceRoot: '/a/b' }, { workspaceRoot: '/a/b/' })
    expect(v.same).toBe(true)
    expect(v.attributed).toBe(false)
    expect(v.by).toBe('path-fallback')
  })

  it('T-05 路径兜底同样可注入 realpath 解算器（软链等价）', () => {
    const realpath = (p: string): string => (p === '/link/proj' ? '/real/proj' : p)
    const v = sameProjectOf({ workspaceRoot: '/link/proj' }, { workspaceRoot: '/real/proj' }, realpath)
    expect(v.same).toBe(true)
    expect(v.by).toBe('path-fallback')
  })
})

describe('T-06 两侧都缺 id 且无法比较 → 不猜是同一项目', () => {
  it('T-06 一侧连路径都没有 → same=false（宁可不同，也不猜"是同一项目"）', () => {
    expect(sameProjectOf({ workspaceRoot: '/a' }, {})).toEqual({ same: false, attributed: false, by: 'path-fallback' })
    expect(sameProjectOf({}, {})).toEqual({ same: false, attributed: false, by: 'path-fallback' })
    expect(sameProjectOf(undefined, undefined)).toEqual({ same: false, attributed: false, by: 'path-fallback' })
  })

  it('T-06 空串 id / 空串路径都不算"有值"', () => {
    expect(sameProjectOf({ projectId: '' }, { projectId: '' }).by).toBe('path-fallback')
    expect(sameProjectOf({ projectId: 'w-1' }, { projectId: '' }).by).toBe('path-fallback')
  })
})

describe('T-07 项目 id → 根（1 : 1，同一条目上的两个字段）', () => {  it('T-07 按 id 取到条目 path（形状归一：去尾斜杠）', () => {
    expect(rootOfProject(REGISTRY, 'w-1')).toBe('/Users/mac/Documents/ai/dsh/dsh-pmboard')
    expect(rootOfProject([{ id: 'w-9', path: '/x/y/', sessionIds: [] }], 'w-9')).toBe('/x/y')
  })

  it('T-07 条目缺失 / 有 id 无根 → undefined（不可用，交由调用方兜底并标注）', () => {
    expect(rootOfProject(REGISTRY, 'w-unknown')).toBeUndefined()
    expect(rootOfProject([{ id: 'w-9', path: '', sessionIds: [] }], 'w-9')).toBeUndefined()
    expect(rootOfProject([{ id: 'w-9', path: '   ', sessionIds: [] }], 'w-9')).toBeUndefined()
  })

  it('T-07 同一项目两个窗口取到的根一致（根来自"哪个项目"，不来自"哪个窗口"）', () => {
    const fromX = rootOfProject(REGISTRY, projectIdOfWindow(REGISTRY, 'session-x')!)
    const fromY = rootOfProject(REGISTRY, projectIdOfWindow(REGISTRY, 'session-y')!)
    expect(fromX).toBe(fromY)
    expect(fromX).toBe(P1.path)
  })

  it('T-07 开窗落点与项目身份同源（抽共用实现后行为不变）', () => {
    const opener = new SessionWindowOpener(
      () => undefined, // 本用例不建会话，只要落点解析
      () => ({ list: () => [{ id: 7, path: '/p', sessionIds: ['session-q'] }] }),
    )
    expect(opener.resolveSourceProject('session-q')).toEqual({ workspaceId: '7' })
    expect(opener.resolveSourceProject('session-none')).toBeUndefined()
  })
})

describe('T-07b 联调：两条消费路径对同一份注册表给出一致结论', () => {
  it('T-07b 项目身份端口 + projectIdOfWindow 与开窗落点解析，同一行集合结论一致', () => {
    const rows = [
      { id: 'w-1', path: '/p1', sessionIds: ['session-x', 'session-y'] },
      { id: 2, path: '/p2', sessionIds: ['session-z'] },
    ]
    const entries = new WorkspaceRegistryProjectPort(() => ({ list: () => rows })).list()!
    const opener = new SessionWindowOpener(() => undefined, () => ({ list: () => rows }))

    for (const sessionId of ['session-x', 'session-y', 'session-z', 'session-none']) {
      const byPort = projectIdOfWindow(entries, sessionId)
      const byOpener = opener.resolveSourceProject(sessionId)?.workspaceId
      expect(byPort).toBe(byOpener)
    }
    expect(projectIdOfWindow(entries, 'session-z')).toBe('2')
  })

  it('T-07b 端口未装配时两条路径同样都拿不到结论（一致降级，不一边有一边无）', () => {
    const entries = new WorkspaceRegistryProjectPort(() => undefined).list()
    const opener = new SessionWindowOpener(() => undefined, () => undefined)
    expect(projectIdOfWindow(entries, 'session-x')).toBeUndefined()
    expect(opener.resolveSourceProject('session-x')).toBeUndefined()
  })
})

describe('T-07c 复核补口：同一会话被两个项目认领 = 宿主不一致 → 不猜（返回 undefined）', () => {
  it('T-07c 歧义会话返回 undefined，而不是悄悄取第一个项目', () => {
    const ambiguous: readonly ProjectEntry[] = [
      { id: 'w-1', path: '/p1', sessionIds: ['session-x'] },
      { id: 'w-2', path: '/p2', sessionIds: ['session-x'] },
    ]
    expect(projectIdOfWindow(ambiguous, 'session-x')).toBeUndefined()
  })

  it('T-07c 同一项目被两条重复条目认领（id 相同）不算歧义，照常解析', () => {
    const duplicated: readonly ProjectEntry[] = [
      { id: 'w-1', path: '/p1', sessionIds: ['session-x'] },
      { id: 'w-1', path: '/p1', sessionIds: ['session-x', 'session-y'] },
    ]
    expect(projectIdOfWindow(duplicated, 'session-x')).toBe('w-1')
    expect(projectIdOfWindow(duplicated, 'session-y')).toBe('w-1')
  })
})

describe('T-08 / T-10 数据契约：projectId 进记录、进摘要、可按项目筛', () => {
  it('T-08 建档写入 projectId，记录与摘要都能读到', async () => {
    const store = makeTestStore()
    const created = await store.create(
      { id: 'REQ-261005141830-a001', title: '带项目身份的需求', projectId: 'w-1', workspaceRoot: '/p1' },
      { kind: 'agent', sessionId: 'session-x' },
    )
    expect(created.projectId).toBe('w-1')

    const page = await store.listSummaries({ ids: [created.id] })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.projectId).toBe('w-1')
  })

  it('T-08 不传 projectId 时记录与摘要都不带该键（未归属，不伪造空串）', async () => {
    const store = makeTestStore()
    const created = await store.create(
      { id: 'REQ-261005141830-a002', title: '存量式需求' },
      { kind: 'agent', sessionId: 'session-x' },
    )
    expect('projectId' in created).toBe(false)
    const page = await store.listSummaries({ ids: [created.id] })
    expect('projectId' in (page.items[0] ?? {})).toBe(false)
  })

  it('T-10 同一项目 3 条需求一次问出；另一个项目 0 条', async () => {
    const store = makeTestStore()
    const actor = { kind: 'agent' as const, sessionId: 'session-x' }
    for (const [id, projectId] of [
      ['REQ-261005141830-b001', 'w-1'],
      ['REQ-261005141830-b002', 'w-1'],
      ['REQ-261005141830-b003', 'w-1'],
      ['REQ-261005141830-b004', 'w-2'],
    ] as const) {
      await store.create({ id, title: '需求 ' + id, projectId }, actor)
    }
    const mine = await store.listSummaries({ projectId: 'w-1' })
    expect(mine.items.map((s) => s.id).sort()).toEqual([
      'REQ-261005141830-b001', 'REQ-261005141830-b002', 'REQ-261005141830-b003',
    ])
    expect((await store.listSummaries({ projectId: 'w-2' })).items.map((s) => s.id)).toEqual(['REQ-261005141830-b004'])
    expect((await store.listSummaries({ projectId: 'w-none' })).items).toEqual([])
  })

  it('T-10 不传 projectId 筛 = 全量（老行为零变化）', async () => {
    const store = makeTestStore()
    const actor = { kind: 'agent' as const, sessionId: 'session-x' }
    await store.create({ id: 'REQ-261005141830-c001', title: 'p1', projectId: 'w-1' }, actor)
    await store.create({ id: 'REQ-261005141830-c002', title: '无归属' }, actor)
    expect((await store.listSummaries()).items).toHaveLength(2)
  })
})

describe('T-16 落库列：新建库带 project_id，缺键读回 undefined（不丢数据）', () => {
  it('T-16 SQLite 新库写入后可往返；无 projectId 的记录读回不带该键', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-projectid-'))
    const store = new SqliteRequirementStore({ file: join(dir, 'reqboard.sqlite'), now: () => 100, onWarn: () => { /* 静音 */ } })
    try {
      const actor = { kind: 'agent' as const, sessionId: 'session-x' }
      await store.create({ id: 'REQ-261005141830-d001', title: '有身份', projectId: 'w-1', workspaceRoot: '/p1' }, actor)
      await store.create({ id: 'REQ-261005141830-d002', title: '无身份', workspaceRoot: '/p1' }, actor)

      expect((await store.get('REQ-261005141830-d001'))?.projectId).toBe('w-1')
      expect((await store.get('REQ-261005141830-d002'))?.projectId).toBeUndefined()
      // 按项目筛只命中带身份的那条（未归属不混进来）
      expect((await store.listSummaries({ projectId: 'w-1' })).items.map((s) => s.id)).toEqual(['REQ-261005141830-d001'])
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('T-16b 老库（缺 project_id 列）打开时自动补列：读为未归属，写入不再失败', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-projectid-old-'))
    const file = join(dir, 'reqboard.sqlite')
    const actor = { kind: 'agent' as const, sessionId: 'session-x' }
    const OLD = 'REQ-261005141830-e001'
    const NEW = 'REQ-261005141830-e002'
    try {
      // ① 建库并写一条，然后**把列删掉** —— 等价于"升级前就存在的老库"（比手抄老 DDL 更可靠）
      {
        const s = new SqliteRequirementStore({ file, now: () => 1, onWarn: () => { /* 静音 */ } })
        await s.create({ id: OLD, title: '升级前的老记录' }, actor)
        s.close()
      }
      {
        const raw = new DatabaseSync(file)
        raw.exec('ALTER TABLE requirements DROP COLUMN project_id')
        raw.exec('ALTER TABLE archived DROP COLUMN project_id')
        raw.close()
      }

      // ② 用本次代码重开：必须自动补列，否则"存量库升级后变只读"（复核探针实测过这个失败）
      const reopened = new SqliteRequirementStore({ file, now: () => 2, onWarn: () => { /* 静音 */ } })
      try {
        const old = await reopened.get(OLD)
        expect(old?.title).toBe('升级前的老记录') // 老数据不丢
        expect(old?.projectId).toBeUndefined() // 未归属，而不是编一个

        const created = await reopened.create({ id: NEW, title: '升级后的新记录', projectId: 'w-1' }, actor)
        expect(created.projectId).toBe('w-1')
        expect((await reopened.listSummaries({ projectId: 'w-1' })).items.map((s) => s.id)).toEqual([NEW])
      } finally {
        reopened.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('T-13 / T-14 / T-15 取根的判据：项目身份带出根，路径只兜底', () => {
  const makeDirs = () => {
    const a = mkdtempSync(join(tmpdir(), 'dsh-root-a-'))
    const b = mkdtempSync(join(tmpdir(), 'dsh-root-b-'))
    return {
      a,
      b,
      cleanup: () => {
        rmSync(a, { recursive: true, force: true })
        rmSync(b, { recursive: true, force: true })
      },
    }
  }
  /** P1 项目：id=w-1，根=B（与记录自带的路径 A **故意不同**，好看出谁说了算）。 */
  const registryOf = (b: string) => ({ list: () => [{ id: 'w-1', path: b, sessionIds: ['session-x'] }] })

  it('T-13 有项目身份时：根由项目条目带出，记录自带的旧路径不作数（也不读共享单例当前值）', () => {
    const { a, b, cleanup } = makeDirs()
    try {
      const docs = new FileDocRepository({ workspaceRoot: a }) // 共享单例此刻指向 A（别的窗口留下的状态）
      const deps = { docs, projectRegistry: registryOf(b) }
      const record = { id: 'REQ-261005141830-f001', projectId: 'w-1', workspaceRoot: a }
      expect(rootOfRequirement(deps, record)).toEqual({ root: b, attributed: true, by: 'project-id' })
      // 写侧入口同源：校正后共享单例的根 = 项目根（不是 A、不是"最后一个调用的窗口"）
      expect(ensureWritableProjectRoot(deps, record)).toBe(b)
      expect(docs.workspaceRoot()).toBe(b)
      // 读侧入口同源（读盘闸门那 12 处调用点走的就是它）
      docs.setWorkspaceRoot(a)
      applyRequirementWorkspaceRoot(deps, record)
      expect(docs.workspaceRoot()).toBe(b)
    } finally {
      cleanup()
    }
  })

  it('T-13 项目表未装配 / 查不到该项目 → 回落记录自带路径（不猜、不崩）', () => {
    const { a, b, cleanup } = makeDirs()
    try {
      const record = { id: 'REQ-261005141830-f002', projectId: 'w-1', workspaceRoot: a }
      expect(rootOfRequirement({ docs: new FileDocRepository({ workspaceRoot: a }) }, record))
        .toEqual({ root: a, attributed: false, by: 'path-fallback' })
      const docs = new FileDocRepository({ workspaceRoot: a })
      expect(rootOfRequirement({ docs, projectRegistry: { list: () => [{ id: 'w-9', path: b, sessionIds: [] }] } }, record))
        .toEqual({ root: a, attributed: false, by: 'path-fallback' })
    } finally {
      cleanup()
    }
  })

  it('T-14 存量记录（无项目身份）：回落自带路径并标注未归属，读写照旧可用', () => {
    const { a, b, cleanup } = makeDirs()
    try {
      const docs = new FileDocRepository({ workspaceRoot: a })
      const deps = { docs, projectRegistry: registryOf(b) }
      const legacy = { id: 'REQ-261005141830-f003', workspaceRoot: a }
      expect(rootOfRequirement(deps, legacy)).toEqual({ root: a, attributed: false, by: 'path-fallback' })
      expect(ensureWritableProjectRoot(deps, legacy)).toBe(a)
      expect(docs.workspaceRoot()).toBe(a)
    } finally {
      cleanup()
    }
  })

  it('T-15 两者都没有：取根返回 undefined；写侧回落调用方自己的根，连它也没有则 undefined', () => {
    const { a, cleanup } = makeDirs()
    try {
      const docs = new FileDocRepository({ workspaceRoot: a })
      const deps = { docs, projectRegistry: registryOf(a) }
      // 显式标注类型：TS 的"弱类型"检查不允许只带 id 的对象字面量传给全可选参数的函数（TS2559）
      const bare: { id?: string; projectId?: string; workspaceRoot?: string } = { id: 'REQ-261005141830-f004' }
      expect(rootOfRequirement(deps, bare)).toBeUndefined()
      expect(ensureWritableProjectRoot(deps, bare, { callerRoot: a })).toBe(a) // 既有语义，本次不动
      expect(ensureWritableProjectRoot(deps, bare)).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  it('T-15 项目身份指向的根不存在 → 写侧响亮拒绝（不降级到别的项目）', () => {
    const { a, cleanup } = makeDirs()
    try {
      const docs = new FileDocRepository({ workspaceRoot: a })
      const deps = { docs, projectRegistry: { list: () => [{ id: 'w-1', path: join(a, 'deleted-project'), sessionIds: [] }] } }
      const record = { id: 'REQ-261005141830-f005', projectId: 'w-1', workspaceRoot: a }
      expect(() => ensureWritableProjectRoot(deps, record)).toThrowError(/REQBOARD_INVALID_WORKSPACE/)
    } finally {
      cleanup()
    }
  })
})

describe('T-08 / T-09 / T-11 / T-12 立项即定身份（入口级：走真实立项用例）', () => {
  /**
   * 真实文档仓储 + 真实临时工作区（照 tests/t17-queue-e2e 的口径）：
   * ① 写侧守卫会拿 `exists(声明根)` 硬校验，用内存替身的话任何目录都"不存在"而被正当拒绝；
   * ② 项目条目上的 `path` 必须是**真实存在的目录**——否则取根会走"身份优先"命中一个不可用的根，
   *    被写侧 fail-closed 拒绝（这是设计要的行为，故 fixture 必须真实）。
   */
  const makeEntryDeps = (sessions: readonly string[] | undefined, projectId = 'w-1') => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-entry-'))
    const h = makeHarness()
    const docs = new FileDocRepository({ workspaceRoot: root })
    const deps = {
      ...h.deps,
      docs,
      ...(sessions === undefined ? {} : { projectRegistry: { list: () => [{ id: projectId, path: root, sessionIds: sessions }] } }),
    }
    return { root, h, deps: deps as never, cleanup: () => rmSync(root, { recursive: true, force: true }) }
  }
  /** 最小 exec：会话 id 即窗口码，cwd = 真实临时工作区（与宿主契约同形）。 */
  const exec = (id: string, cwd: string) => ({ agent: { id, session: { header: { cwd } } } })
  const create = async (deps: unknown, id: string, title: string, cwd: string): Promise<Record<string, unknown>> =>
    await executeCreateRequirement(
      deps as never,
      { title, category: 'feature', summary: '摘要', reason: '理由', workspace_root: cwd },
      exec(id, cwd),
    ) as Record<string, unknown>

  it('T-08 立项写入项目身份：回执与台账都能读到（同项目两个窗口解出同一个 id）', async () => {
    const { h, deps, root, cleanup } = makeEntryDeps(['session-a', 'session-b'])
    try {
      const a = await create(deps, 'session-a', 'A 的需求', root)
      const b = await create(deps, 'session-b', 'B 的需求', root)
      expect(a.projectId).toBe('w-1')
      expect(a.project_source).toBe('project-id')
      expect(b.projectId).toBe('w-1') // N:1 —— 同项目两条需求身份相同
      expect((await h.store.get(String(a.requirement_id)))?.projectId).toBe('w-1')
    } finally {
      cleanup()
    }
  })

  it('T-09 窗口不属于任何项目：不写身份键，回执标 path-fallback，台账评论如实标注未归属', async () => {
    const a = makeEntryDeps(undefined) // 未装配项目表
    try {
      const res = await create(a.deps, 'session-x', '未归属需求', a.root)
      expect('projectId' in res).toBe(false)
      expect(res.project_source).toBe('path-fallback')
      const rec = await a.h.store.get(String(res.requirement_id))
      expect(rec?.projectId).toBeUndefined()
      expect(rec?.comments.some((c) => c.body.includes('未归属项目'))).toBe(true)
    } finally {
      a.cleanup()
    }
    // 项目表在位但本窗口不在任何项目的窗口列表里 → 同上（不猜、不回落成"当前项目"）
    const b = makeEntryDeps(['session-other'])
    try {
      const res2 = await create(b.deps, 'session-x', '未归属需求 2', b.root)
      expect('projectId' in res2).toBe(false)
      expect(res2.project_source).toBe('path-fallback')
    } finally {
      b.cleanup()
    }
  })

  it('T-11 守卫是窗口级：同项目另一窗口照常立项；同一窗口再立一条才被拒', async () => {
    const { deps, root, cleanup } = makeEntryDeps(['session-a', 'session-b'])
    try {
      const first = await create(deps, 'session-a', '窗口 A 第一条', root)
      // 同项目的**另一个窗口**立项 → 必须放行（一个项目下多条需求是正常态）
      const second = await create(deps, 'session-b', '窗口 B 第一条', root)
      expect(second.projectId).toBe(first.projectId)
      // 同一窗口再立一条 → 仍按既有「一窗口一需求」守卫拒绝
      await expect(create(deps, 'session-a', '窗口 A 第二条', root))
        .rejects.toMatchObject({ code: 'REQBOARD_WINDOW_BOUND' })
    } finally {
      cleanup()
    }
  })

  it('T-12 推进同项目其中一条：另两条逐字段零变化', async () => {
    const { h, deps, root, cleanup } = makeEntryDeps(['session-a', 'session-b', 'session-c'])
    try {
      const r1 = await create(deps, 'session-a', '需求 1', root)
      const r2 = await create(deps, 'session-b', '需求 2', root)
      const r3 = await create(deps, 'session-c', '需求 3', root)
      const ids = [String(r2.requirement_id), String(r3.requirement_id)]
      const before = await Promise.all(ids.map((id) => h.store.get(id)))
      await executeMoveRequirement(deps, { requirement_id: r1.requirement_id, to: 'brainstorming' }, exec('session-a', root))
      expect((await h.store.get(String(r1.requirement_id)))?.status).toBe('brainstorming')
      const after = await Promise.all(ids.map((id) => h.store.get(id)))
      expect(after).toEqual(before) // 身份、根、状态、版本都不许被邻居带动
      for (const r of after) expect(r?.projectId).toBe('w-1')
    } finally {
      cleanup()
    }
  })
})

describe('T-10c 分区判据：给了调用方项目身份就按 id 分区（不再比路径）', () => {
  const records = [
    { id: 'A', projectId: 'w-1', workspaceRoot: '/p1' },
    { id: 'B', projectId: 'w-2', workspaceRoot: '/p1' }, // 路径与 A 一字不差，但属于别的项目
    { id: 'C', workspaceRoot: '/p1' }, // 存量：有根、无身份
    { id: 'D' }, // 存量：连根都没有（既无身份也无根）
  ]

  it('T-10c 有调用方身份：同 id 归我、异 id 归别人、无身份的单列一桶', () => {
    const part = partitionByProject(records, '/p1', '/p1', undefined, 'w-1')
    expect(part.mine.map((r) => r.id)).toEqual(['A'])
    expect(part.others.map((r) => r.id)).toEqual(['B']) // 路径与 A 一字不差也拦得住：判据是 id
    expect(part.unattributed.map((r) => r.id)).toEqual(['C', 'D']) // 缺身份 → 单列并如实标注
  })

  it('T-10c 没有调用方身份：退回路径口径（老行为零变化）', () => {
    const part = partitionByProject(records, '/p1', '/p1')
    expect(part.mine.map((r) => r.id)).toEqual(['A', 'B', 'C']) // 声明了根的按根比
    expect(part.unattributed.map((r) => r.id)).toEqual(['D']) // 连根都没有的仍单列
  })
})

// ---------------------------------------------------------------------------
// T-17：Dive 归属按项目（FR-7）——归属不符 → 零投递 + 留痕；起轮仍是窗口级
// ---------------------------------------------------------------------------

describe('T-17 Dive 归属按项目：不符则零投递并留痕（不静默）', () => {
  const REQ = 'REQ-261005141830-e001'

  it('T-17 需求属 w-1、窗口被解析成 w-2 → 零投递 + 一条含 project= 的留痕', async () => {
    const rec = { ...makeDiveReq(REQ, 'session-x'), projectId: 'w-1' } as RequirementRecord
    const h = diveLoopHarness({ reqs: [rec], withLatch: false, projectIdOfWindow: () => 'w-2' })
    await h.idle('session-x')
    expect(h.deliveredFor(REQ)).toBe(0)
    expect(h.warns.some((w) => w.includes('project=') && w.includes('跳过归属不符'))).toBe(true)
  })

  it('T-17 同项目（窗口也解析成 w-1）→ 照常起轮一次（不误拦）', async () => {
    const rec = { ...makeDiveReq(REQ, 'session-x'), projectId: 'w-1' } as RequirementRecord
    const h = diveLoopHarness({ reqs: [rec], withLatch: false, projectIdOfWindow: () => 'w-1' })
    await h.idle('session-x')
    expect(h.deliveredFor(REQ)).toBe(1)
  })

  it('T-17 存量未归属需求（无身份）→ 不拦（FR-8：老记录照旧可驱动）', async () => {
    const h = diveLoopHarness({ reqs: [makeDiveReq(REQ, 'session-x')], withLatch: false, projectIdOfWindow: () => 'w-2' })
    await h.idle('session-x')
    expect(h.deliveredFor(REQ)).toBe(1)
  })

  it('T-17 端口未装配（老装配）→ 归属一律放行，行为与改造前逐字一致', async () => {
    const rec = { ...makeDiveReq(REQ, 'session-x'), projectId: 'w-1' } as RequirementRecord
    const h = diveLoopHarness({ reqs: [rec], withLatch: false })
    await h.idle('session-x')
    expect(h.deliveredFor(REQ)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// T-18~T-21：派席与交接拦跨项目（FR-11）——被拒时台账零改动
// ---------------------------------------------------------------------------

describe('T-18~T-21 派席 / 交接拦跨项目（FR-11）', () => {
  const OWNER = 'session-x' // 需求 owner，属 w-1
  const PEER = 'session-y' // 同项目（w-1）的另一个窗口
  const OTHER = 'session-z' // 另一个项目（w-2）的窗口
  const REQ = 'REQ-261005141830-f001'
  const EXEC_OWNER = { agent: { id: OWNER } }

  function ownRequirement(extra: Partial<RequirementRecord> = {}): RequirementRecord {
    return {
      id: REQ, title: '派席用例需求', description: '', category: 'feature', status: 'implementing',
      blocked: false, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      statusHistory: [], sourceSessionId: OWNER, projectId: 'w-1', workspaceRoot: '/p1',
      ...extra,
    } as unknown as RequirementRecord
  }

  /** 席位 / 交接夹具：需求进真存储，项目表用本文件顶部那份 REGISTRY。 */
  function seatHarness(requirement: RequirementRecord) {
    const h = makeHarness({ requirements: [requirement] })
    const deps = { ...h.deps, projectRegistry: { list: () => REGISTRY } } as typeof h.deps
    return { h, deps }
  }

  it('T-18 需求属 P1、目标窗口属 P2 → 拒 REQBOARD_CROSS_PROJECT_SEAT，文案含两个 id 与各自根', async () => {
    const { deps } = seatHarness(ownRequirement())
    const err = await bindSeat(deps, OWNER, { role: 'worker', windowKey: OTHER })
      .then(() => undefined, (e: unknown) => e as { code?: string; message: string })
    expect(err?.code).toBe('REQBOARD_CROSS_PROJECT_SEAT')
    expect(err?.message).toContain('w-1')
    expect(err?.message).toContain('w-2')
    expect(err?.message).toContain(P1.path)
    expect(err?.message).toContain(P2.path)
    // FR-9（判据可观测）：文案还要说清本次用的是哪个判据来源，而不是只给两个 id 让人猜。
    expect(err?.message).toContain('判据来源=项目身份')
  })

  it('T-18 被拒时台账零改动（席位表没被写出半份）', async () => {
    const { deps, h } = seatHarness(ownRequirement())
    const before = JSON.stringify(h.store.peek(REQ))
    await bindSeat(deps, OWNER, { role: 'worker', windowKey: OTHER }).catch(() => undefined)
    expect(JSON.stringify(h.store.peek(REQ))).toBe(before)
  })

  it('T-19 需求属 P1、目标窗口也属 P1（异 session）→ 派席成功 changed=true', async () => {
    const { deps } = seatHarness(ownRequirement())
    const r = await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    expect(r.changed).toBe(true)
    expect(r.project_source).toBe('project-id')
    expect(r.seats.map((s) => s.windowKey)).toContain(PEER)
  })

  it('T-20 解绑跨项目窗口 → 不因项目而拒（只做减法）', async () => {
    const rec = ownRequirement({
      seats: [
        { windowKey: OWNER, role: 'owner', joinedAt: 1 },
        { windowKey: OTHER, role: 'worker', joinedAt: 2 },
      ],
    } as never)
    const { deps } = seatHarness(rec)
    const r = await bindSeat(deps, OWNER, { role: 'worker', windowKey: OTHER, remove: true })
    expect(r.changed).toBe(true)
    expect(r.removed).toBe(true)
    expect(r.seats.map((s) => s.windowKey)).not.toContain(OTHER)
  })

  it('T-21 交接（handoff）到跨项目窗口 → 被拒且台账零改动', async () => {
    const { h, deps } = seatHarness(ownRequirement())
    const before = JSON.stringify(h.store.peek(REQ))
    const err = await handoffRequirement(deps, { requirement_id: REQ, to_window: OTHER, reason: '跨项目用例' }, EXEC_OWNER)
      .catch((e) => e as Error)
    expect((err as { code?: string }).code).toBe('REQBOARD_CROSS_PROJECT_SEAT')
    expect(JSON.stringify(h.store.peek(REQ))).toBe(before)
  })

  it('T-21 同项目异 session 交接 → 放行并如实给出判据（不误拦）', async () => {
    const { deps } = seatHarness(ownRequirement())
    const r = await handoffRequirement(deps, { requirement_id: REQ, to_window: PEER, reason: '同项目接管用例' }, EXEC_OWNER)
    expect(r.to_window).toBe(PEER)
    expect(r.project_source).toBe('project-id')
    expect(r.project_id).toBe('w-1')
  })
})
