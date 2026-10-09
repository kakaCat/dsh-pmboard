/**
 * 失效条件可判定性 + 沉淀侧派生测试（REQ-261006201841-944d t5 / FR-4，TC-34 / TC-38）。
 *
 * 锁四件事：
 *  ① `isDecidableInvalidation` 三类锚点各自成立（反引号字面量 / 文件指针 / supersede + kb-NNNN）；
 *  ② **两态**：写死的模板句判 false（它是 K14 存量的主力），带锚点的样本判 true；
 *  ③ **实测口径**：对 `docs/knowledge/entries/` 全量真实条目的「## 失效条件」小节跑判定，
 *     断「分母 ≥ 60 + 不可判定集合 == 基线集合」的**集合差**（2026-10-07 实测 74 条中
 *     63 条不可判定、11 条带锚点已可判定）；口径 = **只判该小节**，不判整文件——整文件因
 *     front-matter 的 pointer 与「## 相关」的路径而恒可判定，那样的断言测不到任何东西；
 *  ④ **根因**：`DepositKnowledge` 新沉淀出的条目，其失效条件由 pointer + req id 派生且判 true
 *     （用临时目录的桩 docs 真跑一次沉淀，从落盘条目里读回，不是只看组装函数）。
 *
 * @module dsh-pmboard/tests/kb-invalidation
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDecidableInvalidation } from '../src/domain/knowledge/invalidation.js'
import { buildDepositDraft, depositArchiveKnowledge } from '../src/application/use-cases/DepositKnowledge.js'
import { parseEntryDoc } from '../src/domain/knowledge/entry.js'
import { KB_PATHS, entryPath } from '../src/domain/knowledge/types.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { KnowledgeRepository } from '../src/adapters/KnowledgeRepository.js'
import type { UseCaseDeps } from '../src/application/ports.js'

/** 真实知识条目目录（仓库内，只读）。 */
const ENTRIES_DIR = fileURLToPath(new URL('../docs/knowledge/entries', import.meta.url))

/** 写死的模板句（两态里的 false 态；58 条存量条目逐字或近逐字是它）。 */
const TEMPLATE = '相关实现被重构、或该结论被新条目 supersede 时'

/**
 * K14 分母基线：**不可判定**条目的全量集合（2026-10-07 实测 63 条 / 条目总数 74）。
 * 刷新纪律（集合差）：新条目带锚点沉淀 → 走可判定、不动本清单；出现**新的不可判定条目**
 * → 必须显式加进本清单并在改动旁写明理由。与 `docs/knowledge/unverifiable.baseline.txt`
 * （K14 探针自己的基线，由 `kb-probe --refresh-unverifiable` 生成）是**两份**基线：
 * 本清单管本用例，那份管探针，互不代跑。
 */
const BASELINE_UNDECIDABLE: readonly string[] = [
  'kb-0001.md', 'kb-0002.md', 'kb-0003.md', 'kb-0004.md', 'kb-0005.md', 'kb-0006.md',
  'kb-0007.md', 'kb-0008.md', 'kb-0009.md', 'kb-0010.md', 'kb-0011.md', 'kb-0012.md',
  'kb-0013.md', 'kb-0014.md', 'kb-0015.md', 'kb-0016.md', 'kb-0018.md', 'kb-0019.md',
  'kb-0020.md', 'kb-0021.md', 'kb-0022.md', 'kb-0024.md', 'kb-0025.md', 'kb-0026.md',
  'kb-0027.md', 'kb-0028.md', 'kb-0029.md', 'kb-0030.md', 'kb-0031.md', 'kb-0032.md',
  'kb-0033.md', 'kb-0034.md', 'kb-0035.md', 'kb-0036.md', 'kb-0037.md', 'kb-0038.md',
  'kb-0039.md', 'kb-0040.md', 'kb-0041.md', 'kb-0042.md', 'kb-0043.md', 'kb-0044.md',
  'kb-0045.md', 'kb-0046.md', 'kb-0047.md', 'kb-0048.md', 'kb-0049.md', 'kb-0050.md',
  'kb-0051.md', 'kb-0052.md', 'kb-0053.md', 'kb-0054.md', 'kb-0055.md', 'kb-0056.md',
  'kb-0057.md', 'kb-0058.md', 'kb-0059.md', 'kb-0060.md', 'kb-0061.md', 'kb-0062.md',
  'kb-0063.md', 'kb-0064.md', 'kb-0065.md',
]

/** 取条目文本的「## 失效条件」小节正文（到下一个二级/三级标题为止）。 */
function invalidationSection(entryText: string): string {
  const out: string[] = []
  let on = false
  for (const line of entryText.split('\n')) {
    if (/^#{2,3}\s/.test(line)) {
      on = line.replace(/^#{2,3}\s*/, '').trim() === '失效条件'
      continue
    }
    if (on) out.push(line)
  }
  return out.join('\n').trim()
}

describe('I-4 isDecidableInvalidation（domain 纯判定）', () => {
  it('防假绿：小节抽取器自检（抽错小节会让下面的读数全部失真）', () => {
    const sample = ['## 结论', '甲', '', '## 失效条件', '`docs/a/b.md` 改名时', '', '## 相关', 'x'].join('\n')
    expect(invalidationSection(sample)).toBe('`docs/a/b.md` 改名时')
    expect(invalidationSection('## 结论\n甲\n')).toBe('')
  })

  it('TC-34 两态：含 `src/x.ts` 锚点 → true；模板句 → false（④）', () => {
    expect(isDecidableInvalidation('该结论被 `src/x.ts` 的重构推翻时')).toBe(true)
    expect(isDecidableInvalidation(TEMPLATE)).toBe(false)
  })

  it('① 反引号字面量：代码路径 / 命令 / 条目 id 都算锚点', () => {
    expect(isDecidableInvalidation('`src/x.ts` 被删除时')).toBe(true)
    expect(isDecidableInvalidation('`pnpm kb:check` 不再报红时')).toBe(true)
    expect(isDecidableInvalidation('`kb-0043` 的结论被推翻时')).toBe(true)
  })

  it('② 文件指针：路径.扩展名 与 带 #锚点 都算（裸文件名不算，见实现注）', () => {
    expect(isDecidableInvalidation('docs/a/b.md 被删除或改名时')).toBe(true)
    expect(isDecidableInvalidation('docs/architecture/project-manual.md#收尾门 改名时')).toBe(true)
    expect(isDecidableInvalidation('src/domain/knowledge/invalidation.ts 被删时')).toBe(true)
    expect(isDecidableInvalidation('README.md 被删除时')).toBe(false)
  })

  it('③ supersede / 取代 必须**同时**带 kb-NNNN（只有词不算——那正是模板句的毛病）', () => {
    expect(isDecidableInvalidation('该结论被 `kb-0043` supersede 时')).toBe(true)
    expect(isDecidableInvalidation('该结论被 kb-0043 取代时')).toBe(true)
    expect(isDecidableInvalidation('该结论被新条目 supersede 时')).toBe(false)
    expect(isDecidableInvalidation('kb-0043 已归档')).toBe(false)
  })

  it('负例：主题散文 / 空串 / 未登记文本 → false', () => {
    expect(isDecidableInvalidation('')).toBe(false)
    expect(isDecidableInvalidation('相关实现被重构时')).toBe(false)
    expect(isDecidableInvalidation('（未登记）')).toBe(false)
    expect(isDecidableInvalidation('DSH 插槽机制不再"崩溃即退役"，或本仓不再注册任何席位时。')).toBe(false)
  })

  it('模板句的全部存量变体都判 false（口径：这 60 条就是 K14 的分母）', () => {
    for (const variant of [
      TEMPLATE,
      '相关实现被重构或被新条目 supersede',
      '相关实现被重构、或该结论被新条目 supersede 时。具体触发点：\n- DSH 将来定义项目级 skill 目录\n- 上游 skill 换版本',
    ]) {
      expect(isDecidableInvalidation(variant), variant).toBe(false)
    }
  })
})

describe('⑤ 真实条目实测口径（K14 分母）', () => {
  it('docs/knowledge/entries/ 全量条目的「## 失效条件」不可判定集合与基线一致（集合差 = ∅；实测 74 条 / 63 不可判定）', () => {
    const files = readdirSync(ENTRIES_DIR).filter((f) => f.endsWith('.md')).sort()
    const rows = files.map((f) => {
      const text = readFileSync(join(ENTRIES_DIR, f), 'utf8')
      const section = invalidationSection(text)
      return { file: f, section, decidable: isDecidableInvalidation(section) }
    })
    // 抽取器若跑偏（例如小节名匹配不上）会得到一票空串 → 下面的读数会假绿，故先钉住小节非空。
    const emptySections = rows.filter((r) => r.section.length === 0).map((r) => r.file)
    expect(emptySections, '这些条目的「## 失效条件」小节抽不到正文：' + emptySections.join(', ')).toEqual([])

    const undecidable = rows.filter((r) => !r.decidable).map((r) => r.file)
    // 口径（2026-10-07 刷新，取代「存量全部不可判定」）：K14 已允许新条目带锚点沉淀，
    // 实测 11 条可判定 ⇒「全部不可判定」这一事实源已被**进步**推翻，继续钉它等于钉住落后。
    // 改判两条结构性事实（都不写死一个会烂的数字）：
    //   · 分母 ≥ 60（存量规模不许缩水）；
    //   · 不可判定集合 == 基线集合（双向集合差均为空）：新出现的不可判定条目必须被显式看见，
    //     而新出现的可判定条目不再误报红。
    expect(rows.length, '知识条目总数（实现时实测 60，此后只许增）').toBeGreaterThanOrEqual(60)
    const added = undecidable.filter((f) => !BASELINE_UNDECIDABLE.includes(f))
    const removed = BASELINE_UNDECIDABLE.filter((f) => !undecidable.includes(f))
    expect(added, '这些条目新落入不可判定（补锚点，或写清理由后刷新 BASELINE_UNDECIDABLE）：' + added.join(', ')).toEqual([])
    expect(removed, '这些条目已可判定（进步）：请从 BASELINE_UNDECIDABLE 删出：' + removed.join(', ')).toEqual([])
  })
})

describe('TC-38 沉淀侧派生（根因：不再生产模板句）', () => {
  it('buildDepositDraft：失效条件由 pointer + req id 派生，判 true（不再是模板句）', () => {
    const d = buildDepositDraft({
      requirementId: 'REQ-abc123',
      requirementTitle: '知识层需求',
      indexEntry: '一句话结论',
      mergedInto: ['docs/architecture/project-manual.md'],
      dir: 'docs/requirements/REQ-abc123',
      docKinds: ['requirement', 'plan'],
      archivedOn: '2026-10-06',
      hasRetro: false,
    })
    const section = invalidationSection(d.body)
    expect(section).not.toBe(TEMPLATE)
    expect(section).toContain('`docs/architecture/project-manual.md`') // pointer 来自 mergedInto[0]
    expect(section).toContain('REQ-abc123') // req id 取自入参
    expect(isDecidableInvalidation(section)).toBe(true)
  })

  it('buildDepositDraft：无合并去向 → 回落 dir 派生，仍可判定', () => {
    const d = buildDepositDraft({
      requirementId: 'REQ-x',
      requirementTitle: '标题',
      indexEntry: '一句话',
      mergedInto: [],
      dir: 'docs/requirements/REQ-x',
      docKinds: [],
      archivedOn: '2026-10-01',
      hasRetro: false,
    })
    const section = invalidationSection(d.body)
    expect(section).toContain('`docs/requirements/REQ-x/verification.md`')
    expect(isDecidableInvalidation(section)).toBe(true)
  })

  it('端到端：桩 docs 跑一次沉淀 → 落盘条目的失效条件判 true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-invalidation-'))
    try {
      mkdirSync(join(dir, 'docs/knowledge'), { recursive: true })
      writeFileSync(join(dir, KB_PATHS.index), indexSkeleton(), 'utf8')
      const docs = new FileDocRepository({ workspaceRoot: dir })
      const deps = { docs, knowledge: new KnowledgeRepository(docs) } as unknown as UseCaseDeps

      const out = await depositArchiveKnowledge(deps, {
        requirementId: 'REQ-abc123',
        requirementTitle: '知识层需求',
        indexEntry: '知识层让新窗口少花一个数量级的 token 就能认识项目',
        mergedInto: ['docs/architecture/project-manual.md'],
        dir: 'docs/requirements/REQ-abc123',
        docKinds: ['requirement', 'plan', 'verification'],
        archivedOn: '2026-10-06',
        hasRetro: false,
      })
      expect(out.deposited, out.reason ?? '').toBe(true)
      const id = out.id!
      const entryText = readFileSync(join(dir, entryPath(id)), 'utf8')
      const section = invalidationSection(parseEntryDoc(entryText).body)
      expect(section, '落盘条目的失效条件原文').toBe(
        '`docs/architecture/project-manual.md` 被删除或改名，或该结论被 `kb-XXXX` supersede（源需求 REQ-abc123）',
      )
      expect(isDecidableInvalidation(section)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/** 最小可用索引骨架（与 kb-archive-deposit 夹具同款：九个分节 + 生成区标记）。 */
function indexSkeleton(): string {
  const lines = ['# 项目知识索引', '', '> 摘要', '']
  for (const s of ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']) {
    lines.push('## ' + s, '', KB_PATHS.generatedBegin, KB_PATHS.generatedEnd, '')
  }
  return lines.join('\n')
}
