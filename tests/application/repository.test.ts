/**
 * L2 适配器测试 · JsonLedgerRepository / FileDocRepository / SystemClock / RandomIdFactory
 * （REQ-47939a t5）。
 *
 * 用**临时目录跑真实现**（非 mock）：台账串行写、原子写（temp+rename）、损坏隔离、
 * 深冻快照、replaceAll 备份；文档仓储读写/列目录/路径解析。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 原子写已迁到新家（REQ-261002161439-277d t3）：本测试跟着改 import，不再从单册适配器取它。
import { persistAtomic } from '../../src/repositories/atomicWrite.js'
import { FileDocRepository } from '../../src/adapters/FileDocRepository.js'
import { SystemClock } from '../../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../../src/adapters/RandomIdFactory.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-repo-'))
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })


// B12 阶段②c：原「JsonLedgerRepository：加载/写/订阅」整段随旧实现删除（覆盖由 tests/reqboard/* 承接）；
// 本文件保留仍存在的适配器：persistAtomic（atomicWrite.ts）/ FileDocRepository / SystemClock / RandomIdFactory。

describe('原子写（temp + rename）', () => {
  it('persistAtomic：写临时文件后 rename，目标内容完整且无 .tmp 残留', async () => {
    const target = join(dir, 'out.json')
    await persistAtomic(target, '{"ok":true}')
    expect(readFileSync(target, 'utf8')).toBe('{"ok":true}')
    expect(readdirSync(dir).filter(n => n.endsWith('.tmp'))).toEqual([])
  })

  it('persistAtomic：自动创建父目录', async () => {
    const target = join(dir, 'a', 'b', 'out.json')
    await persistAtomic(target, 'x')
    expect(readFileSync(target, 'utf8')).toBe('x')
  })

  it('故障注入：rename 失败时目标不被污染，且临时文件被清理（t3 起行为变更，见下）', async () => {
    const target = join(dir, 'occupied')
    mkdirSync(target) // 目标已是目录 → rename(file, dir) 失败
    await expect(persistAtomic(target, 'x')).rejects.toThrow()
    expect(readdirSync(target)).toEqual([]) // 目标目录未被写入
    // ⚠️ 行为变更（REQ-261002161439-277d t3 / FR-2）：原实现在此处**残留一个 .tmp**，
    // 旧断言正是 `expect(temps.length).toBe(1)`。分片布局让写点变多（每需求一个分片），
    // 失败即泄漏一个临时文件，故 t3 起失败路径 best-effort 清理临时文件，
    // "先写临时再 rename" 的顺序证据改由「目标未被污染」承担（更强的性质）。
    expect(readdirSync(dir).filter(n => n.endsWith('.tmp'))).toEqual([])
  })
})

describe('FileDocRepository', () => {
  it('write/read/exists/list/resolve/workspaceRoot', async () => {
    const docs = new FileDocRepository({ workspaceRoot: dir })
    expect(docs.workspaceRoot()).toBe(dir)
    expect(docs.resolve('a/b.md')).toBe(join(dir, 'a/b.md'))
    expect(docs.exists('a/b.md')).toBe(false)
    await docs.write('a/b.md', 'hello')
    expect(docs.exists('a/b.md')).toBe(true)
    expect(await docs.read('a/b.md')).toBe('hello')
    expect(docs.list('a').map(e => e.name)).toEqual(['b.md'])
    expect(docs.list('a')[0].isFile).toBe(true)
    expect(docs.list('missing')).toEqual([])
  })
})

describe('SystemClock / RandomIdFactory', () => {
  it('SystemClock.now() 约等于当前时间', () => {
    const before = Date.now()
    const now = new SystemClock().now()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })

  it('RandomIdFactory：前缀与 6 位 hex 格式（与 protocol new*Id 同形）', () => {
    const ids = new RandomIdFactory()
    for (let i = 0; i < 20; i++) {
      expect(ids.requirement()).toMatch(/^REQ-[0-9a-f]{6}$/)
      expect(ids.task()).toMatch(/^t-[0-9a-f]{6}$/)
      expect(ids.execution()).toMatch(/^e-[0-9a-f]{6}$/)
      expect(ids.comment()).toMatch(/^c-[0-9a-f]{6}$/)
    }
  })
})
