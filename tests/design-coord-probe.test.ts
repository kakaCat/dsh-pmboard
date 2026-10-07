/**
 * 设计坐标探针（`scripts/design-coord-probe.mts`）的判据用例（REQ 缺口 2：设计坐标实施后失效且无回写）。
 *
 * 分工：这里只测**纯函数与可注入 root 的扫描逻辑**——不 spawn 真探针进程、不碰仓库里的
 * `docs/**`、`src/**`、`tests/**`（所有合成树都建在 `mkdtempSync` 下，跑完删干净）。
 * 脚本本体的 import 安全性由底部的「只在被直接执行时跑 main」守卫保证（同 `req-doc-validate.mts:876`）。
 *
 * 为什么每条判据都要有反例：本仓铁律——只测成功路径等于没测。路径判据的反例是「不存在的坐标必须红」，
 * 回写判据的反例是「未通报落点必须红」，白名单的反例是「不得吞掉真缺口」，符号轨的反例是
 * 「词表外标识符不得进 gaps」。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  WHITELIST,
  checkWriteback,
  classifyPaths,
  classifySymbols,
  extractCodeSymbols,
  extractFilesChanged,
  extractPathTokens,
  isSourceLanding,
  loadSymbolSet,
  parseArgs,
  scanRequirement,
} from '../scripts/design-coord-probe.mts'

/** 合成树登记表：`afterEach` 里逐棵删掉（绝不在仓库里留文件）。 */
const tempRoots: string[] = []

function makeRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'design-coord-test-'))
  tempRoots.push(d)
  return d
}

function put(root: string, rel: string, body: string): void {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

/** 合成一棵最小需求树：设计文档 + 任务卡 + 真实存在的 src 占位 + 符号词表。 */
function scanTree(
  opts: { design: string; changed: readonly string[]; symbols: string },
): { root: string; result: ReturnType<typeof scanRequirement>; exitCode: 0 | 1 } {
  const root = makeRoot()
  put(root, 'docs/requirements/REQ-SPECIMEN/design/architecture.md', opts.design)
  put(root, 'docs/requirements/REQ-SPECIMEN/tasks/t-1.md', [
    '# t-1', '', '### 改动文件', '', ...opts.changed.map((p) => '- `' + p + '`'), '',
  ].join('\n'))
  put(root, 'docs/knowledge/code-map.symbols.tsv', opts.symbols)
  put(root, 'src/real/a.ts', 'export function liveCountOf(): number { return 0 }\n')
  put(root, 'src/extra/new-module.ts', 'export const extra = 1\n')
  const result = scanRequirement(root, 'REQ-SPECIMEN', join(root, 'docs/knowledge/code-map.symbols.tsv'))
  return { root, result, exitCode: result.gaps.length === 0 ? 0 : 1 }
}

/** 判定一个 token 的结论（存在 / 白名单 / 缺口），root 给空树即可——这里只关心白名单分支。 */
function verdictOf(root: string, token: string): 'exists' | 'whitelist' | 'gap' {
  const r = classifyPaths(root, [{ token, occurrences: [{ file: '<test>', line: 1 }] }])
  if (r.gaps.some((g) => g.token === token)) return 'gap'
  return r.verdicts[0]?.verdict ?? 'gap'
}

describe('design-coord-probe · 参数解析（未知参数不许静默忽略）', () => {
  it('认 --req/--root/--json/--specimen/--symbols/--help', () => {
    const a = parseArgs(['--req', 'REQ-1', '--root', '/tmp/x', '--json', '--symbols', 's.tsv'])
    expect(a).toEqual({ req: 'REQ-1', root: '/tmp/x', symbols: 's.tsv', json: true, specimen: false, help: false })
    expect(parseArgs(['--specimen'])).toMatchObject({ specimen: true })
    expect(parseArgs(['--help'])).toMatchObject({ help: true })
  })

  it('未知参数 / 缺值 → 返回错误字符串（调用方 exit 2）', () => {
    expect(typeof parseArgs(['--nope'])).toBe('string')
    expect(parseArgs(['--nope'])).toContain('未知参数')
    expect(typeof parseArgs(['--req'])).toBe('string')
    expect(parseArgs(['--req'])).toContain('缺少参数值')
    // 值不许被当成下一个开关吞掉
    expect(typeof parseArgs(['--req', '--json'])).toBe('string')
  })
})

describe('design-coord-probe · 路径抽取（真实需求号必须被当成一个 token）', () => {
  it('抽出的 token 带出处，行尾标点被剥掉', () => {
    const hits = extractPathTokens([{ file: 'design/a.md', text: '见 `src/real/a.ts`，以及 src/nope/b.ts。' }])
    const tokens = hits.map((h) => h.token).sort()
    expect(tokens).toEqual(['src/nope/b.ts', 'src/real/a.ts'])
    expect(hits[0]!.occurrences[0]).toEqual({ file: 'design/a.md', line: 1 })
  })

  it('`REQ-261005193546-1b1a`（含连字符的真实需求号）不被截断——`REQ-[\\dx]+` 那个 bug 的回归锁', () => {
    const hits = extractPathTokens([{
      file: 'design/a.md',
      text: '条款源：`docs/requirements/REQ-261005193546-1b1a/requirement.md`',
    }])
    expect(hits.map((h) => h.token)).toEqual(['docs/requirements/REQ-261005193546-1b1a/requirement.md'])
  })
})

describe('design-coord-probe · 路径判据：白名单不吞真缺口', () => {
  /** 派发说明点名的、设计文档里**合法但不存在**的形态（逐条都必须放行）。 */
  const LEGAL_FORMS: readonly string[] = [
    'src/**',
    'src/**/*.ts',
    'scripts/migrate-*',
    'src/application/query/{QueryStageDetail',
    'src/application/query/{QueryStageDetail,QueryDag}.ts',
    'src/client/views/{timeline,panels/dag}.ts',
    'tests/<文件>.test.ts',
    'tests/<',
    'docs/requirements/*/queue.json',
    'docs/requirements/<REQ>/tasks/<task_id>.md',
    'prototypes/x.html#FR-1',
    'prototypes/INDEX.md',
    'design/architecture.md',
    'vendor/.../accepting-generator.ts',
  ]

  /** 实测到的真缺口（必须有名字）：白名单一条都不许命中它们。 */
  const REAL_GAPS: readonly string[] = [
    'src/domain/queue/normalizeQueueFile.ts',
    'tests/t1-decompose-queue-write.test.ts',
  ]

  it('每条白名单形态都放行，且命中时给出非空理由', () => {
    const root = makeRoot()
    for (const token of LEGAL_FORMS) {
      const r = classifyPaths(root, [{ token, occurrences: [{ file: '<test>', line: 1 }] }])
      expect(r.gaps.map((g) => g.token), '应当放行：' + token).toEqual([])
      expect(r.verdicts[0]!.verdict, '应当是白名单：' + token).toBe('whitelist')
      expect(r.verdicts[0]!.reason ?? '', '白名单条目必须写明理由：' + token).not.toBe('')
    }
  })

  it('真缺口不被任何白名单规则吞掉（半角白名单失效即红）', () => {
    const root = makeRoot()
    for (const token of REAL_GAPS) {
      expect(verdictOf(root, token), '必须判缺口：' + token).toBe('gap')
    }
    // 白名单表本身也不许空转：每条都要有理由
    for (const rule of WHITELIST) expect(rule.reason.trim().length).toBeGreaterThan(0)
  })

  it('写实号的需求路径不按占位放行：盘上有 → exists；盘上没有 → 缺口', () => {
    const root = makeRoot()
    put(root, 'docs/requirements/REQ-261005193546-1b1a/design/architecture.md', '# 架构\n')
    expect(verdictOf(root, 'docs/requirements/REQ-261005193546-1b1a/design/architecture.md')).toBe('exists')
    // 同形态但盘上不存在的实号：不许被 `<REQ>` / `*` 那两条占位规则顺带放过
    expect(verdictOf(root, 'docs/requirements/REQ-999999999999-zzzz/design/architecture.md')).toBe('gap')
  })

  it('盘上真实存在的路径 → exists（路径判据不误报）', () => {
    const root = makeRoot()
    put(root, 'src/real/a.ts', 'export const a = 1\n')
    expect(verdictOf(root, 'src/real/a.ts')).toBe('exists')
  })

  it('花括号简写的目录前缀不在盘上 → 只出软观测（放行是对的，但要给人线索）', () => {
    const root = makeRoot()
    const token = 'src/nowhere/at-all/{QueryStageDetail,QueryDag}.ts'
    const r = classifyPaths(root, [{ token, occurrences: [{ file: '<test>', line: 1 }] }])
    expect(r.gaps).toEqual([])
    expect(r.observations.map((o) => o.kind)).toEqual(['brace-dir'])
    // 前缀在盘上时不产生该观测（否则噪声会淹没线索）
    const root2 = makeRoot()
    mkdirSync(join(root2, 'src/application/query'), { recursive: true })
    const r2 = classifyPaths(root2, [{
      token: 'src/application/query/{QueryStageDetail,QueryDag}.ts', occurrences: [{ file: '<test>', line: 1 }],
    }])
    expect(r2.observations).toEqual([])
  })
})

describe('design-coord-probe · 回写判据：通报落点必须在设计里被提到', () => {
  const CARD = [
    '# t-1 标本卡',
    '',
    '## 实施方案（implementation）',
    '',
    '- `src/not-a-report-entry.ts`  ← 只出现在实施方案里，不算通报过的落点',
    '',
    '---',
    '## 汇报 1（2026-10-01T00:00:00.000Z，窗口 session-x）',
    '',
    '### 完成项',
    '',
    '- 做了点事',
    '',
    '### 改动文件',
    '',
    '- `src/real/a.ts`',
    '- `src/extra/new-module.ts`',
    '',
    '### 下一步',
    '',
    '无',
    '',
    '---',
    '',
  ].join('\n')

  it('只收「改动文件」小节内的条目（小节外的同形路径不算通报）', () => {
    const got = extractFilesChanged(CARD, 'tasks/t-1.md').map((c) => c.path)
    expect(got).toEqual(['src/real/a.ts', 'src/extra/new-module.ts'])
    expect(got).not.toContain('src/not-a-report-entry.ts')
  })

  it('设计里没提到的源码类落点 → 缺口，且点名「模块改动地图」这条可执行修复锚点', () => {
    const root = makeRoot()
    const changed = extractFilesChanged(CARD, join(root, 'tasks/t-1.md'))
    const r = checkWriteback(root, '模块改动地图里只有 `src/real/a.ts`', changed)
    expect(r.gaps.map((g) => g.token)).toEqual(['src/extra/new-module.ts'])
    expect(r.gaps[0]!.kind).toBe('writeback')
    expect(r.gaps[0]!.fix).toContain('模块改动地图')
    expect(r.gaps[0]!.fix).toContain('templates/design/architecture.md:18')
    expect(r.excluded).toBe(0)
  })

  it('设计里都提到了 → 无缺口（回写判据不误报）', () => {
    const root = makeRoot()
    const changed = extractFilesChanged(CARD, join(root, 'tasks/t-1.md'))
    const design = '改动地图：`src/real/a.ts`（改）、`src/extra/new-module.ts`（新增）'
    expect(checkWriteback(root, design, changed).gaps).toEqual([])
  })

  it('只判源码类落点：tests/docs/fixtures 等不服判据，但**如实登记条数**（不静默少判）', () => {
    const root = makeRoot()
    const changed: { path: string; taskFile: string }[] = [
      { path: 'src/never-mentioned.ts', taskFile: join(root, 'tasks/t-1.md') },
      { path: 'scripts/never-mentioned.mts', taskFile: join(root, 'tasks/t-1.md') },
      { path: 'tests/never-mentioned.test.ts', taskFile: join(root, 'tasks/t-1.md') },
      { path: 'tests/fixtures/never-mentioned.json', taskFile: join(root, 'tasks/t-1.md') },
      { path: 'docs/never-mentioned/notes.md', taskFile: join(root, 'tasks/t-1.md') },
      { path: 'vendor/never-mentioned.ts', taskFile: join(root, 'tasks/t-1.md') },
    ]
    for (const p of ['src/never-mentioned.ts', 'scripts/never-mentioned.mts']) {
      expect(isSourceLanding(p), p + ' 应属源码类落点').toBe(true)
    }
    for (const p of ['tests/x.test.ts', 'tests/fixtures/x.json', 'docs/x/y.md', 'vendor/x.ts', 'templates/x.md']) {
      expect(isSourceLanding(p), p + ' 不该属源码类落点').toBe(false)
    }
    const r = checkWriteback(root, '设计里什么都没提', changed)
    // 只有 src/ 与 scripts/ 两条进缺口；其余四条只登记条数
    expect(r.gaps.map((g) => g.token)).toEqual(['src/never-mentioned.ts', 'scripts/never-mentioned.mts'])
    expect(r.excluded).toBe(4)
  })
})

describe('design-coord-probe · 符号轨是软的（observation，绝不进 gaps）', () => {
  const SYMBOLS_TSV = 'file\tsymbol\tkind\tsignature\n'
    + 'src/real/a.ts\tliveCountOf\tfunction\texport function liveCountOf('

  it('词表外的代码形态标识符进 observations；纯小写散文词根本不收', () => {
    const root = makeRoot()
    put(root, 'docs/knowledge/code-map.symbols.tsv', SYMBOLS_TSV)
    const hits = extractCodeSymbols([{
      file: 'design/a.md',
      text: '接口：`liveCountOf`（词表内）与 `computeTestingCoverage`（词表外）；散文 `design` 与 `true` 不算代码形态。',
    }])
    const names = hits.map((h) => h.symbol).sort()
    expect(names).toEqual(['computeTestingCoverage', 'liveCountOf'])
    const obs = classifySymbols(root, hits, loadSymbolSet(join(root, 'docs/knowledge/code-map.symbols.tsv')))
    expect(obs.map((o) => o.token)).toEqual(['computeTestingCoverage'])
    expect(obs[0]!.kind).toBe('symbol')
    expect(obs[0]!.reason).toContain('symbol 列')
  })

  it('整链扫描：词表外标识符只进 observations，gaps 为空、退出码仍绿', () => {
    const { result, exitCode } = scanTree({
      design: [
        '# 架构设计（REQ-SPECIMEN）',
        '',
        '| 模块/文件 | 类型 | 改动内容 | 原因 | 影响范围 |',
        '|---|---|---|---|---|',
        '| `src/real/a.ts` | 改 | 加判断 | FR-1 | 小 |',
        '',
        '接口：`computeTestingCoverage`（全仓不存在的名字，软轨线索）。',
        '',
      ].join('\n'),
      changed: ['src/real/a.ts'],
      symbols: SYMBOLS_TSV,
    })
    expect(result.gaps).toEqual([])
    expect(exitCode).toBe(0)
    expect(result.observations.map((o) => o.token)).toContain('computeTestingCoverage')
  })
})

describe('design-coord-probe · 可注入 root 的整链扫描（判据一份，标本与测试共用）', () => {
  const GREEN_DESIGN = [
    '# 架构设计（REQ-SPECIMEN）',
    '',
    '## 模块改动地图 `serves: FR-1`',
    '',
    '| 模块/文件 | 类型 | 改动内容 | 原因（serves哪条FR） | 影响范围 |',
    '|---|---|---|---|---|',
    '| `src/real/a.ts` | 改 | 加一个判断 | FR-1 | 小 |',
    '| `src/**` | 通配 | 白名单形态 | FR-1 | — |',
    '| `tests/<文件>.test.ts` | 占位 | 白名单形态 | FR-1 | — |',
    '',
  ].join('\n')

  it('全绿：路径都存在 + 落点都提到 → 无缺口、exit 0', () => {
    const { result, exitCode } = scanTree({
      design: GREEN_DESIGN, changed: ['src/real/a.ts'], symbols: 'file\tsymbol\tkind\tsignature\n',
    })
    expect(result.gaps).toEqual([])
    expect(exitCode).toBe(0)
    expect(result.designDocs).toBe(1)
    expect(result.taskDocs).toBe(1)
    expect(result.filesChanged).toBe(1)
  })

  it('设计点名不存在的坐标 → 路径缺口并点名（真缺口场景）', () => {
    const { result, exitCode } = scanTree({
      design: GREEN_DESIGN.replace('src/real/a.ts', 'src/nope/x.ts'),
      changed: ['src/real/a.ts'],
      symbols: 'file\tsymbol\tkind\tsignature\n',
    })
    expect(exitCode).toBe(1)
    expect(result.gaps.filter((g) => g.kind === 'path').map((g) => g.token)).toEqual(['src/nope/x.ts'])
    // 同一次改坏同时暴露第二个方向：被替掉的落点不再被设计提到 → 回写缺口
    expect(result.gaps.filter((g) => g.kind === 'writeback').map((g) => g.token)).toEqual(['src/real/a.ts'])
  })

  it('任务卡通报了设计没提的落点 → 回写缺口并点名（真缺口场景，路径判据仍绿）', () => {
    const { result, exitCode } = scanTree({
      design: GREEN_DESIGN,
      changed: ['src/real/a.ts', 'src/extra/new-module.ts'],
      symbols: 'file\tsymbol\tkind\tsignature\n',
    })
    expect(exitCode).toBe(1)
    expect(result.gaps.map((g) => g.kind)).toEqual(['writeback'])
    expect(result.gaps.map((g) => g.token)).toEqual(['src/extra/new-module.ts'])
    expect(result.excludedLandings).toBe(0)
  })

  it('只落测试文件 → 不判回写（exit 0），但条数如实登记在 excludedLandings（不静默少判）', () => {
    const { result, exitCode } = scanTree({
      design: GREEN_DESIGN,
      changed: ['src/real/a.ts', 'tests/real/a.test.ts', 'tests/fixtures/real.json'],
      symbols: 'file\tsymbol\tkind\tsignature\n',
    })
    expect(exitCode).toBe(0)
    expect(result.gaps).toEqual([])
    expect(result.excludedLandings).toBe(2)
    expect(result.filesChanged).toBe(3)
  })
})
