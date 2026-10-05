/**
 * 自举用例测试（REQ-261004174324-4195 t2）。
 *
 * 四态 + 幂等 + 手写保护 + 根漂移：全部用**内存假端口**跑（能精确断言「没读源码」「没写盘」），
 * 另加两条真文件系统的用例（mtime 不变、check 模式零漂移）。
 */
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureKnowledgeLayer } from '../src/application/use-cases/EnsureKnowledgeLayer.ts'
import { FileDocRepository } from '../src/adapters/FileDocRepository.ts'
import { KB_PAGE_PATHS, KB_PATHS } from '../src/domain/knowledge/types.ts'
import type { DocEntry, DocRepository, UseCaseDeps } from '../src/application/ports.ts'

/** 内存文档仓储（假端口）：记录读次数与写入序列，可注入写失败与根漂移。 */
class FakeDocs {
  readonly files = new Map<string, string>()
  readonly readCounts = new Map<string, number>()
  readonly writes: string[] = []
  failWrite?: string
  driftAfterFirstWrite = false

  constructor(
    public root: string,
    src: Record<string, string> = {},
  ) {
    for (const [p, t] of Object.entries(src)) this.files.set(p, t)
  }

  workspaceRoot(): string {
    return this.root
  }

  exists(p: string): boolean {
    return this.files.has(p)
  }

  async read(p: string): Promise<string> {
    this.readCounts.set(p, (this.readCounts.get(p) ?? 0) + 1)
    const v = this.files.get(p)
    if (v === undefined) throw new Error('ENOENT: ' + p)
    return v
  }

  async write(p: string, content: string): Promise<void> {
    if (this.failWrite === p) throw new Error('EACCES: ' + p)
    this.writes.push(p)
    this.files.set(p, content)
    if (this.driftAfterFirstWrite && this.writes.length === 1) this.root = this.root + '-moved'
  }

  list(dir: string): readonly DocEntry[] {
    const seen = new Map<string, boolean>()
    for (const p of this.files.keys()) {
      if (!p.startsWith(dir + '/')) continue
      const seg = p.slice(dir.length + 1).split('/')
      seen.set(seg[0]!, seg.length === 1)
    }
    return [...seen].map(([name, isFile]) => ({ name, isFile, mtimeMs: 0, size: 0 }))
  }

  stat(): undefined {
    return undefined
  }

  resolve(p: string): string {
    return this.root + '/' + p
  }

  /** 读源码文件的次数（子断言「没读源码」用）。 */
  sourceReads(): number {
    let n = 0
    for (const [p, c] of this.readCounts) if (p.startsWith('src/')) n += c
    return n
  }
}

const deps = (docs: FakeDocs): Pick<UseCaseDeps, 'docs'> => ({ docs: docs as unknown as DocRepository })

const SRC: Record<string, string> = {
  'src/a/index.ts': '/**\n * A 模块说明。\n * @module pkg/a\n */\nexport function run(): void {}\n',
  'src/client/styles/base.ts': '.dsh-pm-a { color: #abcdef }\n',
}

describe('ensureKnowledgeLayer · 缺层即自举', () => {
  it('空根 → created，五个产物齐备（含 INDEX 骨架）', async () => {
    const docs = new FakeDocs('/proj', SRC)
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('created')
    expect([...res.created].sort()).toEqual([
      KB_PATHS.classes, KB_PATHS.index, KB_PATHS.symbols, KB_PAGE_PATHS['code-map'], KB_PAGE_PATHS.tokens,
    ].sort())
    expect(docs.files.get(KB_PATHS.index)).toContain('# 项目知识索引')
    expect(docs.files.get(KB_PATHS.symbols)!.startsWith('file\tsymbol\tkind\tsignature')).toBe(true)
  })

  it('手写页永不创建（architecture/conventions/glossary 不在产物里）', async () => {
    const docs = new FakeDocs('/proj', SRC)
    await ensureKnowledgeLayer(deps(docs))
    for (const p of [KB_PAGE_PATHS.architecture, KB_PAGE_PATHS.conventions, KB_PAGE_PATHS.glossary]) {
      expect(docs.files.has(p)).toBe(false)
    }
  })

  it('幂等：索引与生成物齐备后再次调用 → 零读源码、零写盘', async () => {
    const docs = new FakeDocs('/proj', SRC)
    await ensureKnowledgeLayer(deps(docs))
    docs.readCounts.clear()
    const before = new Map(docs.files)
    const writesBefore = docs.writes.length
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('skipped')
    expect(res.reason).toBe('index-exists')
    expect(res.created).toEqual([])
    expect(docs.writes.length).toBe(writesBefore)
    expect(docs.sourceReads()).toBe(0)
    expect(docs.files).toEqual(before)
  })

  it('半残态（索引在、生成物缺）→ 只补缺的，索引一字不改', async () => {
    const docs = new FakeDocs('/proj', SRC)
    await ensureKnowledgeLayer(deps(docs))
    const indexBefore = docs.files.get(KB_PATHS.index)!
    docs.files.delete(KB_PATHS.symbols)
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('created')
    expect(res.created).toEqual([KB_PATHS.symbols])
    expect(docs.files.get(KB_PATHS.index)).toBe(indexBefore)
  })

  it('手写内容被保护：既有 INDEX 手写行与手写页逐字不变', async () => {
    const docs = new FakeDocs('/proj', SRC)
    await ensureKnowledgeLayer(deps(docs))
    docs.files.set(KB_PATHS.index, docs.files.get(KB_PATHS.index)!.replace('> （待写：一句话项目摘要', '> 手写摘要：别动我\n\n> （待写：一句话项目摘要'))
    docs.files.set(KB_PAGE_PATHS.architecture, '# 架构（人写的）\n')
    docs.files.set(KB_PATHS.symbols, 'stale') // 制造差异 → 触发一次写入
    await ensureKnowledgeLayer(deps(docs))
    expect(docs.files.get(KB_PATHS.index)).toContain('> 手写摘要：别动我')
    expect(docs.files.get(KB_PAGE_PATHS.architecture)).toBe('# 架构（人写的）\n')
    expect(docs.writes).not.toContain(KB_PAGE_PATHS.architecture)
  })
})

describe('ensureKnowledgeLayer · 失败要响亮', () => {
  it('索引缺生成区标记 → failed(markers-missing)，零写入', async () => {
    const docs = new FakeDocs('/proj', SRC)
    await ensureKnowledgeLayer(deps(docs))
    docs.files.set(KB_PATHS.index, docs.files.get(KB_PATHS.index)!.split(KB_PATHS.generatedBegin).join('').split(KB_PATHS.generatedEnd).join(''))
    docs.files.delete(KB_PATHS.symbols) // 半残 → 会走「读索引」分支
    docs.writes.length = 0
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('failed')
    expect(res.reason).toBe('markers-missing')
    expect(res.error).toContain('生成区标记')
    expect(docs.writes).toEqual([])
  })

  it('写盘失败 → failed 带 failedPath/error，且不抛异常', async () => {
    const docs = new FakeDocs('/proj', SRC)
    docs.failWrite = KB_PAGE_PATHS.tokens
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('failed')
    expect(res.failedPath).toBe(KB_PATHS.root)
    expect(res.error).toContain('EACCES')
    expect(res.created.length).toBeGreaterThan(0) // 已写入的如实列出
  })

  it('根漂移 → failed(root-drifted)，不把内容写进另一个项目', async () => {
    const docs = new FakeDocs('/proj', SRC)
    docs.driftAfterFirstWrite = true
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('failed')
    expect(res.reason).toBe('root-drifted')
  })

  it('根未知 → skipped(root-unknown)，不猜目录', async () => {
    const docs = new FakeDocs('', SRC)
    const res = await ensureKnowledgeLayer(deps(docs))
    expect(res.status).toBe('skipped')
    expect(res.reason).toBe('root-unknown')
    expect(docs.writes).toEqual([])
  })
})

describe('ensureKnowledgeLayer · 真文件系统', () => {
  it('二次自举内容与 mtime 双不变（保 mtime）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kb-ensure-'))
    const docs = new FileDocRepository({ workspaceRoot: root })
    const first = await ensureKnowledgeLayer({ docs })
    expect(first.status).toBe('created')
    const before = new Map([KB_PATHS.index, KB_PATHS.symbols, KB_PAGE_PATHS['code-map'], KB_PAGE_PATHS.tokens, KB_PATHS.classes]
      .map((p) => [p, { text: readFileSync(join(root, p), 'utf8'), mtime: statSync(join(root, p)).mtimeMs }] as const))
    const second = await ensureKnowledgeLayer({ docs })
    expect(second.status).toBe('skipped')
    for (const [p, snap] of before) {
      expect(readFileSync(join(root, p), 'utf8')).toBe(snap.text)
      expect(statSync(join(root, p)).mtimeMs).toBe(snap.mtime)
    }
  })

  it('check 模式：缺失即漂移，补写后零漂移', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kb-check-'))
    const docs = new FileDocRepository({ workspaceRoot: root })
    const before = await ensureKnowledgeLayer({ docs }, { mode: 'check' })
    expect(before.status).toBe('created')
    expect(before.drift.length).toBeGreaterThan(0)
    await ensureKnowledgeLayer({ docs })
    const after = await ensureKnowledgeLayer({ docs }, { mode: 'check' })
    expect(after.drift).toEqual([])
  })
})
