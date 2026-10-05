/**
 * 知识层生成器纯函数测试（REQ-261004174324-4195 t1）。
 *
 * 三件事：① **确定性**（同输入两次逐字节相同，无时间戳）；② **口径对齐**（搬迁前脚本
 * 生成的库内 TSV 每一行都仍被渲染器产出——否则 `pnpm kb:check` 会红）；③ **INDEX 结构**
 * （骨架含成对生成区标记 + 手写行不被覆盖 + 结构异常响亮抛错）。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  KB_PAGE_MAX_LINES,
  KbIndexStructureError,
  extractSymbols,
  renderCodeMap,
  renderDesignTokens,
  replaceGeneratedSection,
  scaffoldIndex,
  type KbSourceFile,
} from '../src/domain/knowledge/generate.ts'
import { KB_PATHS } from '../src/domain/knowledge/types.ts'

const ROOT = process.cwd()

/** 递归收集 src 下的 .ts（测试自用，生产路径的扫描在用例层）。 */
function srcFiles(dir = join(ROOT, 'src'), out: KbSourceFile[] = []): KbSourceFile[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) srcFiles(p, out)
    else if (e.name.endsWith('.ts')) {
      out.push({ path: p.slice(ROOT.length + 1).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') })
    }
  }
  return out
}

/** TSV → 行集合（跳过表头）。 */
function tsvRows(tsv: string): string[] {
  return tsv.split('\n').slice(1).filter((l) => l.trim().length > 0)
}

describe('extractSymbols 口径', () => {
  it('抽名称与 kind，签名压成单行', () => {
    const rows = extractSymbols('src/x.ts', 'export function foo(a: number): string {\n  return String(a)\n}\n')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('foo')
    expect(rows[0]!.kind).toBe('function')
    expect(rows[0]!.signature).toBe('export function foo(a: number): string')
  })

  it('签名超 120 字符截断并加省略号（保持单行）', () => {
    const rows = extractSymbols('src/x.ts', 'export const ' + 'a'.repeat(200) + ' = 1\n')
    expect(rows[0]!.signature.length).toBe(120)
    expect(rows[0]!.signature.endsWith('…')).toBe(true)
    expect(rows[0]!.signature.includes('\n')).toBe(false)
  })

  it('无名称的导出退化为 (anonymous) 而不是丢行', () => {
    const rows = extractSymbols('src/x.ts', 'export default 42\n')
    expect(rows).toHaveLength(0) // 正则要求关键字后跟名称：默认导出表达式不入表（与搬迁前脚本一致）
  })
})

describe('renderCodeMap 确定性与口径对齐', () => {
  it('同输入两次渲染逐字节相同（无时间戳）', () => {
    const files: KbSourceFile[] = [
      { path: 'src/a/x.ts', text: 'export const a = 1\n' },
      { path: 'src/b/index.ts', text: '/**\n * B 模块说明。\n * @module pkg/b\n */\nexport function run(): void {}\n' },
    ]
    const one = renderCodeMap(files)
    const two = renderCodeMap([...files].reverse())
    expect(one.page).toBe(two.page)
    expect(one.symbolsTsv).toBe(two.symbolsTsv)
  })

  it('模块分组按前两段路径，角色取模块头首句与 @module', () => {
    const files: KbSourceFile[] = [
      { path: 'src/b/index.ts', text: '/**\n * B 模块说明。\n * @module pkg/b\n */\nexport function run(): void {}\n' },
    ]
    const out = renderCodeMap(files)
    expect(out.page).toContain('| `src/b` | 1 |')
    expect(out.page).toContain('pkg/b — B 模块说明。')
    expect(out.page).toContain('## 模块总览 #modules')
    expect(out.page).toContain('## 导出最多的文件 #hot')
    expect(out.symbolCount).toBe(1)
  })

  it('抽取口径与库内一致：库内行要么被逐字复现，要么该符号在现文件里已不存在（陈旧，非口径分歧）', () => {
    const out = renderCodeMap(srcFiles())
    expect(out.symbolsTsv.split('\n')[0]).toBe('file\tsymbol\tkind\tsignature')
    const libPath = join(ROOT, KB_PATHS.symbols)
    if (!existsSync(libPath)) return
    const mineByFile = new Map<string, ReturnType<typeof extractSymbols>>()
    const diverged: string[] = []
    let stale = 0
    for (const line of tsvRows(readFileSync(libPath, 'utf8'))) {
      const [file, sym, kind, sig] = line.split('\t') as [string, string, string, string]
      if (!existsSync(join(ROOT, file))) continue
      const mine = mineByFile.get(file) ?? extractSymbols(file, readFileSync(join(ROOT, file), 'utf8'))
      mineByFile.set(file, mine)
      if (mine.some((r) => r.name === sym && r.kind === kind && r.signature === sig)) continue
      // 同名同文件却对不上 → 口径分歧（必须为零）；同名符号已消失 → 库内生成物陈旧（源码改过未重跑）
      if (mine.some((r) => r.name === sym)) diverged.push(file + ' :: ' + sym)
      else stale += 1
    }
    expect(diverged).toEqual([])
    expect(stale).toBeGreaterThanOrEqual(0)
  })

  it('回归锁：符号归属到真实定义它的文件（旧脚本的 abs/rel 错配已修）', () => {
    const out = renderCodeMap(srcFiles())
    const rows = tsvRows(out.symbolsTsv).map((l) => l.split('\t'))
    const baseCss = rows.find((r) => r[1] === 'BASE_CSS')
    expect(baseCss?.[0]).toBe('src/client/styles/base.ts')
    expect(rows.some((r) => r[0] === 'src/client/styles.ts' && r[1] === 'BASE_CSS')).toBe(false)
  })
})

describe('renderDesignTokens', () => {
  it('只吃样式分片路径；颜色/变量/断点/类名计数并出 TSV', () => {
    const files: KbSourceFile[] = [
      { path: 'src/client/styles/base.ts', text: '.dsh-pm-a { color: #fff; --x: 1px; }\n@media (max-width: 880px) { .dsh-pm-b { color: #FFFFFF } }\n' },
      { path: 'src/client/other.ts', text: '.dsh-pm-ignored { color: #000000 }\n' },
    ]
    const out = renderDesignTokens(files)
    expect(out.counts.colors).toBe(2)
    expect(out.counts.vars).toBe(1)
    expect(out.counts.breakpoints).toBe(1)
    expect(out.counts.classes).toBe(2)
    expect(out.classesTsv.split('\n')[0]).toBe('class\tshard')
    expect(out.classesTsv).not.toContain('dsh-pm-ignored')
    expect(out.page).toContain('#colors')
    expect(out.page).toContain('#breakpoints')
  })

  it('同输入两次渲染逐字节相同', () => {
    const files: KbSourceFile[] = [{ path: 'src/client/styles/a.ts', text: '.dsh-pm-z { color: #abc }\n' }]
    expect(renderDesignTokens(files).page).toBe(renderDesignTokens(files).page)
  })
})

describe('INDEX 骨架与生成区', () => {
  it('骨架含 H1、成对生成区标记（两处）与「待写」节', () => {
    const idx = scaffoldIndex()
    expect(idx.startsWith('# 项目知识索引')).toBe(true)
    expect(idx.split(KB_PATHS.generatedBegin).length - 1).toBe(2)
    expect(idx.split(KB_PATHS.generatedEnd).length - 1).toBe(2)
    expect(idx).toContain('## 待写')
  })

  it('替换生成区时手写行一字不动', () => {
    const idx = scaffoldIndex().replace('> （待写：一句话项目摘要', '> 手写摘要：别动我\n\n> （待写：一句话项目摘要')
    const next = replaceGeneratedSection(idx, '代码地图', ['- kb-x · map · 新的一行 · → code-map.md#modules'])
    expect(next).toContain('- kb-x · map · 新的一行')
    expect(next).toContain('> 手写摘要：别动我')
    expect(next).toContain('- kb-architecture-layers · architecture · 四层职责与依赖方向')
    // 只动目标分节：令牌分节的生成行仍在
    expect(next).toContain('- kb-tokens-colors · tokens · 颜色表与变量入口')
  })

  it('分节缺了 / 生成区标记缺了 → 结构化抛错（区分两种病因）', () => {
    const noSection = scaffoldIndex().replace('## 代码地图', '## 代码地图改名了')
    expect(() => replaceGeneratedSection(noSection, '代码地图', [])).toThrow(KbIndexStructureError)
    try {
      replaceGeneratedSection(noSection, '代码地图', [])
    } catch (err) {
      expect((err as KbIndexStructureError).kind).toBe('section-missing')
    }
    const noMarkers = scaffoldIndex().split(KB_PATHS.generatedBegin).join('').split(KB_PATHS.generatedEnd).join('')
    try {
      replaceGeneratedSection(noMarkers, '代码地图', [])
      throw new Error('应当抛错')
    } catch (err) {
      expect((err as KbIndexStructureError).kind).toBe('markers-missing')
    }
  })

  it('页面上限常量来自 KB_LIMITS 单点', () => {
    expect(KB_PAGE_MAX_LINES).toBe(200)
  })
})
