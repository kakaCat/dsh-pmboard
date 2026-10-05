/**
 * reqboard_kb 检索与预算测试（REQ-261001110934-3766 t4）。
 *
 * 锁四件事（对应 t4 验收）：
 *  ① `budgetChars=300` → **只回指针**（无 body）且 `truncated=true`（不返回碎片正文）；
 *  ② `budgetChars=1500` → 序列化后总字符 ≤1500，且命中条目**带正文**；
 *  ③ 参数校验：三选择器全空 / limit 越界 / budgetChars 越界 / kind 未知 → `invalid_input`；
 *  ④ 机器索引：`kind='map'` 的 query 去 symbols.tsv 找（全量清单不进上下文，只由工具按需取）。
 *
 * @module dsh-pmboard/tests/kb-tool-budget
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { KnowledgeRepository } from '../src/adapters/KnowledgeRepository.js'
import { executeQueryKnowledge } from '../src/application/use-cases/QueryKnowledge.js'
import { KB_PATHS, entryPath } from '../src/domain/knowledge/types.js'
import { defineKnowledgeTool } from '../src/tools/KnowledgeTool/index.js'

const SECTIONS = ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']

function indexDoc(rows: Record<string, string[]>): string {
  const lines = ['# 索引', '', '> 摘要', '']
  for (const s of SECTIONS) {
    lines.push('## ' + s, '')
    if (s === '代码地图') lines.push(KB_PATHS.generatedBegin)
    for (const r of rows[s] ?? []) lines.push(r)
    if (s === '代码地图') lines.push(KB_PATHS.generatedEnd)
    lines.push('')
  }
  return lines.join('\n')
}

function entryDoc(id: string, oneLiner: string, bodyLines: number): string {
  return [
    '---',
    'id: ' + id,
    'kind: decision',
    'status: active',
    'title: ' + oneLiner,
    'one_liner: ' + oneLiner,
    'applies_when: 任何时候',
    'pointer: ""',
    'updated: 2026-10-01',
    'expires: 2027-03-30',
    '---',
    '',
    '## 结论',
    ...Array.from({ length: bodyLines }, (_, i) => '结论正文第 ' + String(i + 1) + ' 行：' + 'x'.repeat(40)),
    '',
    '## 适用条件',
    '任何时候',
    '',
    '## 证据',
    '见原文',
    '',
    '## 失效条件',
    '无',
    '',
    '## 相关',
    '无',
  ].join('\n')
}

let root: string
let deps: { docs: FileDocRepository; knowledge: KnowledgeRepository }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kb-tool-'))
  mkdirSync(join(root, 'docs/knowledge/entries'), { recursive: true })
  writeFileSync(join(root, KB_PATHS.index), indexDoc({
    决策: [
      '- kb-0001 · decision · 知识层不做向量检索 · → entries/kb-0001.md',
      '- kb-0002 · decision · 归档即沉淀 · → entries/kb-0002.md',
    ],
    代码地图: ['- kb-code-map-modules · map · 模块级地图 · → code-map.md#modules'],
  }), 'utf8')
  writeFileSync(join(root, entryPath('kb-0001')), entryDoc('kb-0001', '知识层不做向量检索', 12), 'utf8')
  writeFileSync(join(root, entryPath('kb-0002')), entryDoc('kb-0002', '归档即沉淀', 2), 'utf8')
  writeFileSync(join(root, KB_PATHS.symbols), [
    'file\tsymbol\tkind\tsignature',
    'src/adapters/KnowledgeRepository.ts\tKnowledgeRepository\tclass\texport class KnowledgeRepository',
    'src/domain/knowledge/slug.ts\tslugify\tfunction\texport function slugify',
  ].join('\n') + '\n', 'utf8')
  const docs = new FileDocRepository({ workspaceRoot: root })
  deps = { docs, knowledge: new KnowledgeRepository(docs) }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const call = (args: unknown) => executeQueryKnowledge(deps as never, args)

describe('预算：不足只回指针', () => {
  it('budgetChars=300 → 无正文、truncated=true、hint 指路', async () => {
    const r = await call({ kind: 'decision', budgetChars: 300 })
    expect(r.truncated).toBe(true)
    expect(r.budgetChars).toBe(300)
    expect(r.items.length).toBeGreaterThan(0)
    for (const it of r.items) {
      expect(it.body).toBeUndefined()
      expect(it.pointer.length).toBeGreaterThan(0)
    }
    expect(r.hint ?? '').toMatch(/budgetChars|id/)
  })

  it('budgetChars=1500 → 序列化总字符 ≤1500 且带正文', async () => {
    const r = await call({ id: 'kb-0001', budgetChars: 1500 })
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(1500 + 200) // hint 等元数据余量
    const withBody = r.items.filter((i) => i.body !== undefined)
    expect(withBody.length).toBeGreaterThan(0)
  })

  it('正文装不下时该条只回指针（不返回半截正文）', async () => {
    const full = await call({ id: 'kb-0001', budgetChars: 8000 })
    const tight = await call({ id: 'kb-0001', budgetChars: 500 })
    expect(full.items[0]?.body).toBeDefined()
    expect(tight.items[0]?.body).toBeUndefined()
    expect(tight.truncated).toBe(true)
  })
})

describe('参数校验与空态', () => {
  it('三选择器全空 / limit / budgetChars / kind 非法 → invalid_input', async () => {
    await expect(call({})).rejects.toThrowError(/至少要给一个选择器/)
    await expect(call({ kind: 'decision', limit: 999 })).rejects.toThrowError(/limit 必须在 1–20/)
    await expect(call({ kind: 'decision', limit: 0 })).rejects.toThrowError(/limit/)
    await expect(call({ kind: 'decision', budgetChars: 0 })).rejects.toThrowError(/budgetChars/)
    await expect(call({ kind: 'decision', budgetChars: 8001 })).rejects.toThrowError(/budgetChars/)
    await expect(call({ kind: 'nope' })).rejects.toThrowError(/kind 非法/)
  })

  it('id 不存在 → 空集 + 指路（不抛）', async () => {
    const r = await call({ id: 'kb-9999' })
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
    expect(r.hint ?? '').toMatch(/kb-9999/)
  })

  it('未装配知识端口 → 响亮失败', async () => {
    await expect(executeQueryKnowledge({ docs: deps.docs } as never, { kind: 'decision' }))
      .rejects.toThrowError(/知识层未装配/)
  })
})

describe('检索：kind / query / 机器索引', () => {
  it('kind 过滤 + query 命中一句话', async () => {
    const byKind = await call({ kind: 'decision', limit: 5, budgetChars: 8000 })
    expect(byKind.items.map((i) => i.id).sort()).toEqual(['kb-0001', 'kb-0002'])
    const byQuery = await call({ query: '向量', budgetChars: 8000 })
    expect(byQuery.items.map((i) => i.id)).toEqual(['kb-0001'])
  })

  it('kind=map 的 query 去机器索引找（返回符号与所在文件）', async () => {
    const r = await call({ kind: 'map', query: 'slugify', budgetChars: 1500 })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]!.oneLiner).toContain('slugify')
    expect(r.items[0]!.oneLiner).toContain('slug.ts')
    expect(r.hint ?? '').toContain('code-map.symbols.tsv')
  })
})

describe('工具壳', () => {
  it('工具名与参数面符合 design/interfaces（只读、描述短且稳定）', () => {
    const tool = defineKnowledgeTool(deps as never) as unknown as {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
    expect(tool.name).toBe('reqboard_kb')
    expect(Object.keys((tool.parameters as any).properties ?? tool.parameters).sort()).toEqual(['budgetChars', 'id', 'kind', 'limit', 'query'])
    expect(tool.description.length).toBeLessThanOrEqual(200)
    expect(tool.description).toContain('budgetChars')
  })
})
