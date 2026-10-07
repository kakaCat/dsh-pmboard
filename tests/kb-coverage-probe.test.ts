/**
 * K13 / K14 读数测试（REQ-261006201841-944d t6 / FR-3、FR-4）。
 *
 * 为什么用子进程跑整支 CLI（而不是把判定抽出来单测）：K13/K14 的读数**就是探针的输出**，
 * 抽出来测等于测另一份实现；这里用 `DSH_HOME`（台账根）与 `--baseline-dir`（基线副本）
 * 两个注入点把探针指向临时世界，再读它的 `--json` 输出。断言逐条对应验收：
 *  ① 冷侧有归档材料、却没有 `req:` 条目 → K13 红并点名该需求 id；
 *  ② 把该 id 写进基线副本 → K13 绿（基线集合差：已知豁免不再是缺口）；
 *  ③ 含锚点的条目**不进** K14 不可判定集合（口径 = 只判「## 失效条件」小节）；
 *  ④ 台账根不可达（`DSH_HOME` 指向不存在的目录）→ K13/K14 均 ok=true 且 detail 写「读数不可得」；
 *  ⑤ 热侧 `requirements/` 里堆再多 archive.json 也不改 K13 缺口（只报数，不判红）；
 *  ⑥ `--refresh-coverage` 幂等：连跑两次基线文件逐字节相同（排序 + 行尾换行 + `#` 注释头）；
 *  ⑦ 真实仓库跑一次：输出含 K13/K14 两项，退出码语义不变（0 = 全绿 / 1 = 有失败）。
 *
 * @module dsh-pmboard/tests/kb-coverage-probe
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx')
const PROBE = join(ROOT, 'scripts', 'kb-probe.mts')
const COVERAGE_BASELINE = 'archive-coverage.baseline.txt'
const UNVERIFIABLE_BASELINE = 'unverifiable.baseline.txt'

interface Finding {
  readonly check: string
  readonly ok: boolean
  readonly detail: string
}
interface Run {
  readonly status: number
  readonly ok: boolean
  readonly findings: readonly Finding[]
  readonly stdout: string
  readonly stderr: string
}

/** 跑一次探针（`DSH_HOME` = 临时台账根；`--baseline-dir` = 基线副本目录）。 */
function runProbe(opts: {
  dshHome: string
  baselineDir: string
  cwd?: string
  extraArgs?: readonly string[]
}): Run {
  const res = spawnSync(
    TSX,
    [PROBE, '--json', '--baseline-dir', opts.baselineDir, ...(opts.extraArgs ?? [])],
    {
      cwd: opts.cwd ?? ROOT,
      // offline 只影响探针内部的 `kb-build --check` 子进程：让它失败得快，别去网上找 tsx
      env: { ...process.env, DSH_HOME: opts.dshHome, npm_config_offline: 'true' },
      encoding: 'utf8',
    },
  )
  const stdout = res.stdout ?? ''
  let parsed: { ok?: boolean; findings?: Finding[] } = {}
  try {
    parsed = JSON.parse(stdout) as { ok?: boolean; findings?: Finding[] }
  } catch {
    parsed = {}
  }
  return {
    status: res.status ?? -1,
    ok: parsed.ok === true,
    findings: parsed.findings ?? [],
    stdout,
    stderr: res.stderr ?? '',
  }
}

function findingOf(run: Run, check: string): Finding {
  const hit = run.findings.find((f) => f.check === check)
  if (hit === undefined) {
    throw new Error(check + ' 不在探针输出里（stdout 前 300 字）：' + run.stdout.slice(0, 300) + run.stderr.slice(0, 300))
  }
  return hit
}

let base: string
/** 仓库里真实的 K14 基线（临时世界用它，才能把 K14 的绿/红隔离在 K13 上）。 */
let repoTemplates: string
/** 基线副本目录（每次调用造一个新的，避免用例之间互相污染）。 */
let baselineSeq = 0

/** 造一个基线副本目录；`unverifiable` 缺省 = 抄仓库真实基线。 */
function baselineDirWith(coverage: readonly string[], unverifiable?: readonly string[]): string {
  const dir = join(base, 'baselines-' + String((baselineSeq += 1)))
  mkdirSync(dir, { recursive: true })
  const head = (name: string, flag: string): string[] => [
    '# ' + name,
    '# 由 `npx tsx scripts/kb-probe.mts ' + flag + '` 生成（已排序、行尾换行）；机器读，别手改。',
  ]
  writeFileSync(
    join(dir, COVERAGE_BASELINE),
    [...head('K13 归档沉淀覆盖度基线（用例副本）', '--refresh-coverage'), ...coverage].join('\n') + '\n',
    'utf8',
  )
  const inv = unverifiable ?? readFileSync(join(repoTemplates, UNVERIFIABLE_BASELINE), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0 && !l.startsWith('#'))
  writeFileSync(
    join(dir, UNVERIFIABLE_BASELINE),
    [...head('K14 失效条件不可判定条目基线（用例副本）', '--refresh-unverifiable'), ...inv].join('\n') + '\n',
    'utf8',
  )
  return dir
}

/** 造一个台账根：`archive/<REQ>/archive.json`（冷侧）+ `requirements/<REQ>/archive.json`（热侧）。 */
function ledgerWith(cold: readonly string[], hot: readonly string[]): string {
  const home = join(base, 'homes-' + String((baselineSeq += 1)))
  mkdirSync(join(home, 'reqboard/archive'), { recursive: true })
  mkdirSync(join(home, 'reqboard/requirements'), { recursive: true })
  for (const id of cold) {
    mkdirSync(join(home, 'reqboard/archive', id), { recursive: true })
    writeFileSync(join(home, 'reqboard/archive', id, 'archive.json'), '{"indexEntry":"x"}\n', 'utf8')
  }
  for (const id of hot) {
    mkdirSync(join(home, 'reqboard/requirements', id), { recursive: true })
    writeFileSync(join(home, 'reqboard/requirements', id, 'archive.json'), '{"indexEntry":"x"}\n', 'utf8')
  }
  return home
}

/** K13 缺口读数的可对照片段：`缺口 N 条（有归档材料但没有 req: 知识条目）：<ids>`。 */
function gapPhrase(detail: string): string {
  const at = detail.indexOf('归档沉淀缺口')
  if (at < 0) return detail
  const end = detail.indexOf('——补齐指引', at)
  return detail.slice(at, end < 0 ? undefined : end)
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'kb-probe-'))
  repoTemplates = join(ROOT, 'docs/knowledge')
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('K13 归档沉淀覆盖度（读数 + 基线集合差）', () => {
  it('① 冷侧有归档材料但无 req: 条目 → K13 红并点名该 id', () => {
    const home = ledgerWith(['REQ-261001010101-aaaa'], [])
    const run = runProbe({ dshHome: home, baselineDir: baselineDirWith([]) })
    const k13 = findingOf(run, 'K13')
    expect(k13.ok).toBe(false)
    expect(k13.detail).toContain('REQ-261001010101-aaaa')
    expect(k13.detail).toContain('归档沉淀缺口 1 条')
    expect(k13.detail).toContain('--refresh-coverage') // 补齐指引指向刷新基线
  }, 120_000)

  it('② 把该 id 写进基线副本 → K13 绿；判词仍如实说「仍有 1 条零沉淀（基线豁免）」不假绿；旧豁免提示「已补齐，可刷新基线」', () => {
    const home = ledgerWith(['REQ-261001010101-aaaa'], [])
    const dir = baselineDirWith(['REQ-261001010101-aaaa', 'REQ-260000000000-stale'])
    const run = runProbe({ dshHome: home, baselineDir: dir })
    const k13 = findingOf(run, 'K13')
    expect(k13.ok).toBe(true)
    // REQ-261006201841-944d F-6：基线豁免 ≠ 已沉淀。判决绿（无新增缺口），
    // 但判词必须逐字说清「仍有 N 条零沉淀」，不得写成「全部有」（那是假绿话术）。
    expect(k13.detail).toContain('冷侧 1 条归档需求中仍有 1 条零沉淀（已登记为基线豁免、非新增）：REQ-261001010101-aaaa')
    expect(k13.detail).not.toContain('全部有 req: 知识条目')
    expect(k13.detail).toContain('已补齐，可刷新基线')
    expect(k13.detail).toContain('REQ-260000000000-stale')
  }, 120_000)

  it('⑤ 热侧 requirements/ 堆 50 条 archive.json → 缺口读数一字不变（只报数）', () => {
    const id = 'REQ-261001010101-aaaa'
    const hot = Array.from({ length: 50 }, (_, i) => 'REQ-hot-' + String(i).padStart(2, '0'))
    const cold = runProbe({ dshHome: ledgerWith([id], []), baselineDir: baselineDirWith([]) })
    const warm = runProbe({ dshHome: ledgerWith([id], hot), baselineDir: baselineDirWith([]) })
    const coldK13 = findingOf(cold, 'K13')
    const warmK13 = findingOf(warm, 'K13')
    expect(coldK13.ok).toBe(false)
    expect(warmK13.ok).toBe(false)
    // 缺口（点名 + 条数）不受热侧影响
    expect(gapPhrase(warmK13.detail)).toBe(gapPhrase(coldK13.detail))
    expect(gapPhrase(warmK13.detail)).toContain(id)
    // 热侧只报数：读数里如实写出 50
    expect(warmK13.detail).toContain('热侧 requirements/ 50 条只报数不判红')
    expect(coldK13.detail).toContain('热侧 requirements/ 0 条只报数不判红')
  }, 180_000)

  it('⑥ --refresh-coverage 幂等：连跑两次，基线文件逐字节相同（排序 + 行尾换行 + # 注释头）', () => {
    const home = ledgerWith(['REQ-261001010102-bbbb', 'REQ-261001010101-aaaa'], [])
    const dir = baselineDirWith([])
    const first = runProbe({ dshHome: home, baselineDir: dir, extraArgs: ['--refresh-coverage'] })
    const path = join(dir, COVERAGE_BASELINE)
    expect(existsSync(path), '刷新后基线文件存在：' + first.stderr).toBe(true)
    const bytesA = readFileSync(path)
    const second = runProbe({ dshHome: home, baselineDir: dir, extraArgs: ['--refresh-coverage'] })
    const bytesB = readFileSync(path)
    expect(bytesB.equals(bytesA)).toBe(true)
    expect(second.status).toBe(first.status)
    // 注释头 + 排序 + 行尾换行
    const text = bytesA.toString('utf8')
    expect(text.endsWith('\n')).toBe(true)
    const lines = text.split('\n').slice(0, -1)
    expect(lines[0]!.startsWith('# ')).toBe(true)
    expect(lines[1]!.startsWith('# ')).toBe(true)
    expect(lines.slice(2)).toEqual(['REQ-261001010101-aaaa', 'REQ-261001010102-bbbb'])
  }, 180_000)

  it('④ 台账根不可达（DSH_HOME 指向不存在目录）→ K13/K14 均 ok=true 且写明「读数不可得」', () => {
    const run = runProbe({ dshHome: join(base, 'no-such-home'), baselineDir: baselineDirWith([]) })
    for (const check of ['K13', 'K14']) {
      const f = findingOf(run, check)
      expect(f.ok, check).toBe(true)
      expect(f.detail, check).toContain('读数不可得')
      // 拿不到数据就说拿不到——**不得**写「全部通过」这类"没问题"的口径
      expect(f.detail, check).not.toContain('全部通过')
    }
    expect(findingOf(run, 'K13').detail).toContain('不判')
  }, 120_000)
})

describe('K14 失效条件可判定（口径 = 只判「## 失效条件」小节）', () => {
  it('③ 含锚点的条目（`src/x.ts`）不进不可判定集合；模板句条目被点名', () => {
    const ws = join(base, 'ws-anchored')
    mkdirSync(join(ws, 'docs/knowledge/entries'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), '{"name":"kb-probe-fixture"}\n', 'utf8')
    writeFileSync(
      join(ws, 'docs/knowledge/entries/kb-0001.md'),
      ['---', 'id: kb-0001', '---', '', '## 失效条件', '`src/x.ts` 被删除或改名时', '', '## 相关', 'docs/a/b.md'].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(ws, 'docs/knowledge/entries/kb-0002.md'),
      ['---', 'id: kb-0002', '---', '', '## 失效条件', '相关实现被重构、或该结论被新条目 supersede 时', '', '## 相关', 'docs/a/b.md'].join('\n'),
      'utf8',
    )
    // 基线为空 → 两条都算"新增缺口"，但只有模板句那条该被点名
    const run = runProbe({
      dshHome: ledgerWith([], []),
      baselineDir: join(ws, 'docs/knowledge'),
      cwd: ws,
    })
    const k14 = findingOf(run, 'K14')
    expect(k14.ok).toBe(false)
    expect(k14.detail).toContain('kb-0002')
    expect(k14.detail, '含锚点的 kb-0001 不该被判成不可判定').not.toContain('kb-0001')
    // 第二读数：同模板句条数
    expect(k14.detail).toContain('不可判定 1 条')
    expect(k14.detail).toContain('可判定 1 条')
    expect(k14.detail).toContain('同模板句 1 条')
  }, 120_000)
})

describe('真实仓库跑一次（退出码语义与两项读数在场）', () => {
  it('⑦ --json 输出含 K13/K14；退出码语义不变（0 = 全绿 / 1 = 有失败）；K2/K5 不因排序变红', () => {
    const dshHome = process.env['DSH_HOME'] !== undefined && process.env['DSH_HOME'].length > 0
      ? process.env['DSH_HOME']
      : join(homedir(), '.dsh')
    const run = runProbe({ dshHome, baselineDir: join(ROOT, 'docs/knowledge') })
    expect(run.findings.length, run.stdout.slice(0, 400)).toBeGreaterThanOrEqual(14)
    expect(run.findings.some((f) => f.check === 'K13')).toBe(true)
    expect(run.findings.some((f) => f.check === 'K14')).toBe(true)
    // 退出码语义：全绿 → 0；有失败 → 1（0/1 与 findings 的真实状态一一对应）
    const allOk = run.findings.every((f) => f.ok)
    expect(run.status).toBe(allOk ? 0 : 1)
    expect(run.ok).toBe(allOk)
    // 索引行文法（K2）与条目 ↔ 索引一一对应（K5）不因降权排序变红
    expect(findingOf(run, 'K2').ok, findingOf(run, 'K2').detail).toBe(true)
    expect(findingOf(run, 'K5').ok, findingOf(run, 'K5').detail).toBe(true)
  }, 180_000)
})
