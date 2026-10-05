/**
 * 工程操作覆盖清单与四要素判定测试（REQ-261001143526-8475 t1）。
 *
 * 锁四件事：
 *  ① 覆盖清单 = package.json scripts（去排除）∪ 白名单；**排除项缺理由 → 抛错**；
 *  ② `scripts/` 下未归类文件必须被点名（不静默放过）；
 *  ③ 四要素校验：时机枚举 / 命令 runner 与路径 / 期望锚点 / 失败怎么办指向（含"待补"占位即红）；
 *  ④ 缺口判定与编号分配：给了清单没有条目 → 报缺口 + 建议 id。
 *
 * @module dsh-pmboard/tests/kb-operations
 */
import { describe, it, expect } from 'vitest'
import {
  EXCLUDED,
  EXTRA_ENTRIES,
  OPERATION_TRIGGERS,
  buildCoverage,
  entryToIndexRow,
  findGaps,
  listUnclassified,
  nextCodeOf,
  parseOperationEntries,
  renderEntrySkeleton,
  validateOperationEntry,
} from '../src/domain/knowledge/operations.ts'

const PKG = {
  build: 'tsdown -c tsdown.config.mjs && pnpm build:client',
  'build:client': 'tsdown -c tsdown.client.config.mjs && node scripts/wrap-client.mjs',
  'verify:client': 'node scripts/verify-client-build.mjs',
  'kb:build': 'tsx scripts/kb-build.mts --write',
  'kb:check': 'tsx scripts/kb-build.mts --check && tsx scripts/kb-probe.mts',
  'kb:probe': 'tsx scripts/kb-probe.mts',
  test: 'vitest run --passWithNoTests',
  typecheck: 'tsc --noEmit -p tsconfig.json',
  prepublishOnly: 'pnpm build && pnpm typecheck',
  prepare: 'pnpm build',
}

const SCOPE = (body: string): string => '## 工程操作 #operations\n\n' + body + '\n'

const GOOD_ENTRY = [
  '### C-12 改了客户端源码必须重建 bundle #c-12',
  '- 时机：改动后',
  '- 命令：`pnpm build:client`',
  '- 期望：`[verify-client] OK … 样式归属章在场, CSS 分片完整`',
  '- 失败怎么办：缺归属章 → 见 C-05；分片截断 → 检查 src/client/styles/base.ts 收尾',
].join('\n')

describe('覆盖清单', () => {
  it('package.json scripts 去排除 + 白名单 → 10 项必跑', () => {
    const list = buildCoverage(PKG)
    const commands = list.map((c) => c.command)
    expect(commands).toContain('pnpm typecheck')
    expect(commands).toContain('pnpm build:client')
    expect(commands).toContain('pnpm kb:check')
    expect(commands).toContain('pnpm test')
    expect(commands).toContain('pnpm build')
    expect(commands).toContain('node scripts/inline-prompt-fragments.mjs')
    expect(commands).toContain('node scripts/check-prompt-fragments.mjs')
    expect(commands).toContain('bash scripts/sync-to-github.sh')
    // REQ-261004065652-5c1c t10：两条护栏入口进白名单（护栏靠它们证明没空转 / 台账零改写）
    expect(commands).toContain('npx tsx scripts/reverse-drill-matrix.mts')
    expect(commands).toContain('npx tsx scripts/reconcile-terminal-drill.mts')
    // 排除项不得出现
    expect(commands).not.toContain('pnpm verify:client')
    expect(commands).not.toContain('pnpm kb:build')
    expect(commands).not.toContain('pnpm prepublishOnly')
    expect(commands).not.toContain('pnpm prepare')
    expect(list).toHaveLength(10)
  })

  it('时机按映射表分配，未知 script 缺省「改动后」', () => {
    const list = buildCoverage({ ...PKG, 'new:thing': 'node x.mjs' })
    const find = (c: string) => list.find((i) => i.command === c)!.trigger
    expect(find('pnpm typecheck')).toBe('改动后')
    expect(find('pnpm test')).toBe('提交前')
    expect(find('pnpm build')).toBe('发版前')
    expect(find('pnpm new:thing')).toBe('改动后')
  })

  it('排除项缺理由 → 抛错（防"为了过检查而藏起必跑项"）', () => {
    expect(() => buildCoverage(PKG, EXTRA_ENTRIES, [{ name: 'x', reason: '  ' }])).toThrowError(/缺少理由/)
  })

  it('scripts/ 下未归类文件被点名；已归类/已排除的不报', () => {
    const files = ['inline-prompt-fragments.mjs', 'check-prompt-fragments.mjs', 'kb-probe.mts', 'brand-new.mjs']
    const out = listUnclassified(files)
    expect(out).toEqual(['brand-new.mjs'])
  })

  it('三张表自带一致性：排除项理由全非空、时机枚举合法', () => {
    for (const e of EXCLUDED) expect(e.reason.trim().length).toBeGreaterThan(0)
    for (const e of EXTRA_ENTRIES) expect(OPERATION_TRIGGERS).toContain(e.trigger)
  })
})

describe('四要素校验', () => {
  it('合法条目零问题', () => {
    const [entry] = parseOperationEntries(SCOPE(GOOD_ENTRY))
    expect(validateOperationEntry(entry!)).toEqual([])
  })

  it('缺时机 / 缺期望 / 期望无锚点 / 命令非 runner / 失败怎么办无指向 / 待补占位 → 各自报错', () => {
    const bad = SCOPE([
      '### C-13 缺时机 #c-13',
      '- 命令：`pnpm test`',
      '- 期望：`退出码 0`',
      '- 失败怎么办：看 C-01',
    ].join('\n'))
    // 已经带节头的夹具不再二次包裹（二次包裹会让条目落到节外 → 解析为空）
    const codes = (text: string): string => {
      const scoped = text.includes('## 工程操作') ? text : SCOPE(text)
      return validateOperationEntry(parseOperationEntries(scoped)[0]!).map((i) => i.detail).join(' | ')
    }
    expect(codes(bad)).toContain('时机缺失或非法')
    expect(codes(GOOD_ENTRY.replace(/^- 期望：.*$/m, ''))).toContain('缺「期望」')
    expect(codes(GOOD_ENTRY.replace('`[verify-client] OK … 样式归属章在场, CSS 分片完整`', '`看起来没问题`'))).toContain('缺少可对照锚点')
    expect(codes(GOOD_ENTRY.replace('`pnpm build:client`', '`./some-script.sh`'))).toContain('不是可执行入口')
    expect(codes(GOOD_ENTRY.replace(/^- 失败怎么办：.*$/m, '- 失败怎么办：再试一次'))).toContain('必须指向既有规范 id')
    expect(codes(GOOD_ENTRY.replace(/^- 失败怎么办：.*$/m, '- 失败怎么办：（待补：写清失败信号）'))).toContain('仍是骨架占位')
  })

  it('命令里的路径存在性交给调用方判定（domain 不碰 fs）', () => {
    const [entry] = parseOperationEntries(SCOPE(GOOD_ENTRY.replace('`pnpm build:client`', '`npx tsx scripts/not-there.mts`')))
    expect(validateOperationEntry(entry!, () => false).map((i) => i.detail).join()).toContain('路径不存在')
    expect(validateOperationEntry(entry!, () => true)).toEqual([])
  })
})

describe('缺口判定与编号', () => {
  it('清单有、条目无 → 报缺口并给建议 id（编号从最大值 +1）', () => {
    const entries = parseOperationEntries(SCOPE(GOOD_ENTRY))
    const gaps = findGaps(buildCoverage(PKG), entries)
    const missed = gaps.map((g) => g.command)
    expect(missed).toContain('pnpm typecheck')
    expect(missed).not.toContain('pnpm build:client') // 已有条目
    expect(gaps[0]!.suggestedCode).toBe('C-13')
    expect(gaps[0]!.suggestedId).toBe('kb-conventions-c-13')
  })

  it('无既有条目时从 C-11 起编（不与既有 C-01…C-10 冲突）', () => {
    expect(nextCodeOf([]).code).toBe('C-11')
  })

  it('骨架与索引行：骨架带四要素、占位可见；索引行符合既有语法', () => {
    const item = buildCoverage(PKG).find((i) => i.command === 'pnpm typecheck')!
    const skeleton = renderEntrySkeleton(item, 'C-11', '改了源码必须跑类型检查')
    expect(skeleton).toContain('### C-11 改了源码必须跑类型检查 #c-11')
    expect(skeleton).toContain('- 时机：改动后')
    expect(skeleton).toContain('- 命令：`' + item.command + '`')
    expect(skeleton).toContain('（待补')
    const [parsed] = parseOperationEntries(SCOPE(skeleton))
    expect(validateOperationEntry(parsed!).map((i) => i.detail).join()).toContain('仍是骨架占位')
    const row = entryToIndexRow(parseOperationEntries(SCOPE(GOOD_ENTRY))[0]!)
    expect(row).toEqual({ id: 'kb-conventions-c-12', kind: 'standard', oneLiner: '改了客户端源码必须重建 bundle', pointer: 'conventions.md#c-12' })
  })
})
