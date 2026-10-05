/**
 * 注入侧三档灰度与逐字节兼容测试（REQ-261001110934-3766 t8）。
 *
 * 锁四件事（对应 t8 验收）：
 *  ① **缺省零改动**：不给 `knowledgeIndex` / `trimRequirementDoc` → 输出既无索引节、需求文档仍为全文
 *     （另有更强证据：HEAD 代码与本代码在**同一份片段**下输出逐字节相同，见 evidence/t8-inject-compat.txt）；
 *  ② `injectIndex`：索引节追加在**末尾**（前缀稳定），超预算**按行截断并标注**，不返回半行；
 *  ③ 索引本身超预算（overflows）→ 超限写在节首（不让读者以为这就是全部知识）；
 *  ④ `trimRequirementDoc`：需求文档节变「TL;DR + 指针」，缺 TL;DR 时如实标注，原文全文不再注入。
 *
 * @module dsh-pmboard/tests/kb-inject-compat
 */
import { describe, it, expect } from 'vitest'
import {
  buildNodeInputPackage,
  type NodeInputPackageInput,
} from '../src/application/internal/node-input-package.js'
import { buildKnowledgeSection, digestRequirementDoc } from '../src/application/internal/knowledge-inject.js'

const DOC = [
  '# REQ-000001 示例需求',
  '',
  '## TL;DR',
  '一句话目标：把 X 做好。',
  '',
  '## 边界',
  '做 A、不做 B。',
  '',
].join('\n')

const base: NodeInputPackageInput = {
  stage: 'design',
  difficulty: 'light',
  category: 'feature',
  requirementDoc: DOC,
  requirementDocPath: 'docs/requirements/REQ-000001/requirement.md',
}

const INDEX_TEXT = [
  '# 项目知识索引',
  '',
  '> 项目摘要',
  '',
  '## 架构',
  '- kb-architecture-layers · architecture · 四层职责与依赖方向 · → architecture.md#layers',
  '',
].join('\n')

describe('缺省：零改动', () => {
  it('不给新入参 → 无索引节、需求文档仍为全文', () => {
    const text = buildNodeInputPackage(base).text
    expect(text).not.toContain('项目知识索引')
    expect(text).toContain('## 需求文档（docs/requirements/REQ-000001/requirement.md）')
    expect(text).toContain('做 A、不做 B。')
    expect(text).toContain('## 路由提示词')
  })

  it('trimRequirementDoc=false 与缺省等价（同字节）', () => {
    const a = buildNodeInputPackage(base).text
    const b = buildNodeInputPackage({ ...base, trimRequirementDoc: false }).text
    expect(b).toBe(a)
  })
})

describe('injectIndex：位置与预算', () => {
  it('索引节追加在末尾（前缀稳定 → 缓存友好）', () => {
    const text = buildNodeInputPackage({ ...base, knowledgeIndex: { text: INDEX_TEXT, overflows: [], budgetChars: 3000 } }).text
    expect(text).toContain('## 项目知识索引')
    expect(text.indexOf('## 项目知识索引')).toBeGreaterThan(text.indexOf('## 需求文档'))
    expect(text.indexOf('## 项目知识索引')).toBeGreaterThan(text.indexOf('## 路由提示词'))
  })

  it('超预算按行截断并标注剩余行数（不返回半行）', () => {
    const long = ['# 索引', ...Array.from({ length: 200 }, (_, i) => '- kb-0001 · decision · 第 ' + String(i) + ' 行 · → entries/kb-0001.md')].join('\n')
    const r = buildKnowledgeSection({ text: long, overflows: [], budgetChars: 400 })
    expect(r.truncated).toBe(true)
    expect(r.keptLines).toBeLessThan(r.totalLines)
    expect(r.section).toContain('（已截断：还有')
    for (const line of r.section.split('\n')) {
      if (line.startsWith('- kb-0001')) expect(line).toMatch(/^- kb-0001 · decision · 第 \d+ 行 · → entries\/kb-0001\.md$/) // 整行，不是半行
    }
  })

  it('索引自身超预算 → 超限写在节首', () => {
    const r = buildKnowledgeSection({
      text: INDEX_TEXT,
      overflows: [{ reason: 'index-chars', actual: 9001, limit: 8000, unit: 'chars' }],
      budgetChars: 3000,
    })
    const warnIdx = r.section.indexOf('⚠️')
    expect(warnIdx).toBeGreaterThan(-1)
    expect(warnIdx).toBeLessThan(r.section.indexOf('## 架构'))
  })
})

describe('trimRequirementDoc：摘要 + 指针', () => {
  it('有 TL;DR → 只注入摘要，全文不再进上下文，且带原文指针', () => {
    const text = buildNodeInputPackage({ ...base, trimRequirementDoc: true }).text
    expect(text).toContain('以下为需求文档的 TL;DR')
    expect(text).toContain('一句话目标：把 X 做好。')
    expect(text).not.toContain('做 A、不做 B。') // 全文（边界节）不再注入
    expect(text).toContain('> 指针：docs/requirements/REQ-000001/requirement.md')
  })

  it('没有 TL;DR → 取开头若干行并如实标注（不假装有摘要）', () => {
    const d = digestRequirementDoc('# 标题\n\n## 边界\n只有边界节\n', 'docs/x.md', 1800)
    expect(d.hadTldr).toBe(false)
    expect(d.text).toContain('未找到 `## TL;DR`')
    expect(d.text).toContain('只有边界节')
    expect(d.text).toContain('> 指针：docs/x.md')
  })

  it('摘要超上限 → 按行截断并标注', () => {
    const longDoc = ['## TL;DR', ...Array.from({ length: 200 }, (_, i) => '第 ' + String(i) + ' 行：' + 'x'.repeat(30))].join('\n')
    const d = digestRequirementDoc(longDoc, 'docs/x.md', 300)
    expect(d.truncated).toBe(true)
    expect(d.text).toContain('已截断')
  })

  it('文档不可用（空串）时不走瘦身（如实标注不可用）', () => {
    const text = buildNodeInputPackage({ ...base, requirementDoc: '', trimRequirementDoc: true }).text
    expect(text).toContain('（需求文档不可用或为空')
  })
})
