/**
 * 宿主接线与开关测试（REQ-261004174324-4195 t4）。
 *
 * 三处通知点各一条（激活由 index.ts 装配，只测「仅 legacy-cwd 才通知」这一判定在别处的可见面，
 * 见下方注释）、协调器去重/失败留存、以及开关的严格解析。
 */
import { describe, expect, it } from 'vitest'
import { KnowledgeBootstrap } from '../src/application/internal/knowledge-bootstrap.ts'
import { applyRequirementWorkspaceRoot } from '../src/application/internal/support.ts'
import { resolveDocRoot } from '../src/http/routers/shared.ts'
import { knowledgeSettings } from '../src/plugin-config.ts'
import { FileDocRepository } from '../src/adapters/FileDocRepository.ts'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocRepository } from '../src/application/ports.ts'

/** 计数用文档仓储：包一层真仓储，按 `list('src')` 次数计「自举跑了几次」（每次自举只列一次源码根）。 */
function countingDocs(root: string): { docs: DocRepository; bootstraps: () => number } {
  const inner = new FileDocRepository({ workspaceRoot: root })
  let n = 0
  const docs: DocRepository = {
    exists: (p) => inner.exists(p),
    read: async (p) => await inner.read(p),
    write: async (p, c) => await inner.write(p, c),
    list: (d) => { if (d === 'src') n += 1; return inner.list(d) },
    stat: (p) => inner.stat(p),
    resolve: (p) => inner.resolve(p),
    workspaceRoot: () => inner.workspaceRoot(),
  }
  return { docs, bootstraps: () => n }
}

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-hooks-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), 'export function a(): void {}\n', 'utf8')
  return root
}

describe('通知点 ②：用例根校正', () => {
  it('需求级根校正后通知一次（带该根）', () => {
    const seen: string[] = []
    const docs = new FileDocRepository({ workspaceRoot: '/host' })
    applyRequirementWorkspaceRoot(
      { docs, knowledgeBootstrap: { ensure: (r?: string) => { seen.push(r ?? '(undef)') } } },
      { workspaceRoot: '/proj-x' },
    )
    expect(seen).toEqual(['/proj-x'])
  })

  it('无需求级根 → 不通知（保持现状）', () => {
    const seen: string[] = []
    const docs = new FileDocRepository({ workspaceRoot: '/host' })
    applyRequirementWorkspaceRoot({ docs, knowledgeBootstrap: { ensure: (r?: string) => { seen.push(r ?? '(undef)') } } }, {})
    expect(seen).toEqual([])
  })
})

describe('通知点 ③：看板按会话解析读根', () => {
  it('命中会话根 → 通知该根；回落 legacy 则不通知', () => {
    const seen: string[] = []
    const deps = {
      cwd: '/legacy',
      sessionWorkspace: (sid: string | undefined) => (sid === 's1' ? '/sess-ws' : undefined),
      knowledgeBootstrap: { ensure: (r?: string) => { seen.push(r ?? '(undef)') } },
    }
    expect(resolveDocRoot(deps as never, 's1').root).toBe('/sess-ws')
    expect(seen).toEqual(['/sess-ws'])
    expect(resolveDocRoot(deps as never, 's2').source).toBe('legacy-cwd')
    expect(seen).toEqual(['/sess-ws']) // 未新增
  })
})

describe('协调器：每根一次、失败不重试、开关', () => {
  it('同根并发只跑一次自举，两个调用者拿到同一结果', async () => {
    const root = makeProject()
    const { docs, bootstraps } = countingDocs(root)
    const bootstrap = new KnowledgeBootstrap({ docs, enabled: true })
    const [a, b] = await Promise.all([bootstrap.run(root), bootstrap.run(root)])
    expect(a.status).toBe('created')
    expect(b).toEqual(a)
    expect(bootstraps()).toBe(1) // workspaceRoot 只被问过一次（= 只起了一次用例）
  })

  it('失败留存：同根再调不再重跑（force 才重跑）', async () => {
    const root = makeProject()
    const inner = new FileDocRepository({ workspaceRoot: root })
    let calls = 0
    const docs: DocRepository = {
      exists: (p) => inner.exists(p),
      read: async (p) => await inner.read(p),
      write: async (p, c) => {
        calls += 1
        if (calls === 1) throw new Error('EACCES: 注入失败')
        await inner.write(p, c)
      },
      list: (d) => inner.list(d),
      stat: (p) => inner.stat(p),
      resolve: (p) => inner.resolve(p),
      workspaceRoot: () => inner.workspaceRoot(),
    }
    const logs: string[] = []
    const bootstrap = new KnowledgeBootstrap({ docs, enabled: true, log: (m) => logs.push(m) })
    const first = await bootstrap.run(root)
    expect(first.status).toBe('failed')
    expect(first.error).toContain('EACCES')
    expect(logs[0]).toContain('知识层自举失败')
    const second = await bootstrap.run(root)
    expect(second.error).toContain('EACCES')
    expect(calls).toBe(1) // 未重试
    const forced = await bootstrap.run(root, { force: true })
    expect(forced.status).toBe('created') // force 显式重跑后成功
  })

  it('关掉开关 → disabled，一次文件系统都不碰', async () => {
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: '/nowhere' }), enabled: false })
    const res = await bootstrap.run('/nowhere')
    expect(res.status).toBe('skipped')
    expect(res.reason).toBe('disabled')
  })

  it('根为空 → root-unknown，不猜目录', async () => {
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: '/x' }), enabled: true })
    const res = await bootstrap.run('')
    expect(res.reason).toBe('root-unknown')
  })
})

describe('config：knowledge.autoBootstrap', () => {
  it('缺省 true；显式 false 为 false', () => {
    expect(knowledgeSettings(undefined).autoBootstrap).toBe(true)
    expect(knowledgeSettings({ knowledge: {} }).autoBootstrap).toBe(true)
    expect(knowledgeSettings({ knowledge: { autoBootstrap: false } }).autoBootstrap).toBe(false)
  })

  it('非布尔 → 装配期抛错（不静默当默认）', () => {
    expect(() => knowledgeSettings({ knowledge: { autoBootstrap: 'no' as never } })).toThrow(/autoBootstrap 只能是 boolean/)
  })
})
