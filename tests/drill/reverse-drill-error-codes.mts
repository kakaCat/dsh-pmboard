#!/usr/bin/env tsx
/**
 * 反向演练：**证明判据不是自称在判**（REQ-261006201814-ac4f FR-8）。
 *
 * ## 为什么必须有这一层
 *
 * 本需求治的病是**假绿**：判据自己失守时，单元/集成层照样全绿。唯一的解法是
 * **当场把实现改坏**，看判据会不会红、红的地方对不对（点名到具体码/条），然后**逐字节还原**。
 *
 * ## 五条演练（每条都要红，且红得要「点名」）
 *
 * | id | 改坏什么 | 期望 |
 * |---|---|---|
 * | `drill-code-matrix` | 让 NO_UI 的触发条件不再触发 | 码矩阵红并点名 REQBOARD_NO_UI |
 * | `drill-exempt-ratchet` | 从豁免白名单删一条 | 棘轮红并点名该码 |
 * | `drill-inventory-guard` | 从口径清单删一个 src 里仍在的码 | 口径守卫红并给自助刷新命令 |
 * | `drill-hermetic-contract` | 让夹具根返回 `.` | 契约锚点红并抛 TEST_HERMETIC_CONTRACT |
 * | `drill-triage-refresh` | 往基线追加一条假失败 | 分诊红并点名「既不在 reverse 也不在 other」 |
 *
 * ## 纪律（照抄 scripts/reverse-drill-matrix.mts，血的教训）
 *
 * 1. **文件级备份 + sha256 校验还原**（`snapshotFiles` / `restoreFiles`）；
 * 2. **禁用按路径检出还原**（`git checkout -- <path>` 会退掉同工作树里别的窗口的未提交改动，
 *    2026-10-04 事故）——本脚本只提供逐字节还原这一条路径；
 * 3. **并发写入检测**：改坏后若目标文件内容不再是「我们写进去的那份」，
 *    说明别的窗口动了它 → **放弃还原并响亮报错**（宁可不还原，也不覆盖别人的改动）；
 * 4. **跑前范围自检**：目标不存在/越界 → 退出码 1（不静默跳过）。
 *
 * 用法：`npx tsx tests/drill/reverse-drill-error-codes.mts [--json] [--keep]`
 * （`--keep` 只用于排查：保留改坏后的状态，**不要**在正常运行里用）
 *
 * @module dsh-pmboard/tests/drill/reverse-drill-error-codes
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { restoreFiles, snapshotFiles, type FileSnapshot } from '../helpers/ab-attribution.js'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const abs = (rel: string): string => join(REPO_ROOT, rel)

interface Drill {
  readonly id: string
  /** 改坏什么（人读）。 */
  readonly what: string
  /** 工作区相对路径。 */
  readonly target: string
  /** 返回改坏后的文件内容（必须是**确定性**的纯变换）。 */
  readonly breakIt: (src: string) => string
  /** 期望变红的守卫命令。 */
  readonly run: readonly string[]
  /** 输出里必须命中的「点名」证据（任一命中即可）。 */
  readonly expectOutput: readonly string[]
}

/** 把 JSON 文本读成对象再写回（保证改坏后的文件仍是合法 JSON）。 */
function editJson(src: string, fn: (data: Record<string, unknown>) => void): string {
  const data = JSON.parse(src) as Record<string, unknown>
  fn(data)
  return JSON.stringify(data, null, 2) + '\n'
}

/** 改前形态：夹具根 `'.'`、替身只认相对键（A/B 实测会打红 10 条立项用例的那一版）。 */
function toLegacyFakeDocs(source: string): string {
  let out = source
  out = out.replace(
    'constructor(now: () => number = () => 0, root: string = testWorkspaceRoot()) {',
    "constructor(now: () => number = () => 0, root: string = '.') {",
  )
  out = out.replace(
    'workspaceRoot(): string { return this.root }',
    "workspaceRoot(): string { return '.' }",
  )
  out = out.replace(
    /private keyOf\(p: string\): string \{[\s\S]*?\n  \}/,
    'private keyOf(p: string): string { return p }',
  )
  return out
}

const DRILLS: readonly Drill[] = [
  {
    id: 'drill-code-matrix',
    what: '让 NO_UI 的触发条件不再触发（把「无弹框通道」换成「有弹框通道」）',
    target: 'tests/error-code-matrix.test.ts',
    breakIt: src => {
      const from = 'const adapter = new UserQuestionsAdapter(() => undefined)'
      const to = 'const adapter = new UserQuestionsAdapter(() => ({ ask: async () => ({ answers: [] }) }))'
      if (!src.includes(from)) throw new Error('定位失败：找不到 NO_UI 的触发点原文——本演练需随实现同步')
      return src.replace(from, to)
    },
    run: ['npx', 'vitest', 'run', 'tests/error-code-matrix.test.ts'],
    expectOutput: ['REQBOARD_NO_UI'],
  },
  {
    id: 'drill-exempt-ratchet',
    what: '从豁免白名单删掉一条（清单仍零覆盖）',
    target: 'tests/fixtures/error-code-exempt.json',
    breakIt: src => editJson(src, data => {
      const entries = data.entries as unknown[]
      data.entries = entries.slice(1)
    }),
    run: ['npx', 'vitest', 'run', 'tests/error-code-exempt.test.ts'],
    expectOutput: ['REQBOARD_NOT_AUTORUN'],
  },
  {
    id: 'drill-inventory-guard',
    what: '从口径清单删掉一个 src 里仍在的码（模拟「漏登记新码」）',
    target: 'tests/fixtures/error-code-inventory.json',
    breakIt: src => editJson(src, data => {
      const upper = data.uppercase as { code: string }[]
      const victim = upper.find(u => u.code === 'REQBOARD_AWAITING_MANUAL')
      if (victim === undefined) throw new Error('定位失败：清单里找不到 REQBOARD_AWAITING_MANUAL')
      data.uppercase = upper.filter(u => u.code !== 'REQBOARD_AWAITING_MANUAL')
    }),
    run: ['npx', 'vitest', 'run', 'tests/error-code-inventory.test.ts'],
    expectOutput: ['REQBOARD_AWAITING_MANUAL', 'refresh-error-code-inventory'],
  },
  {
    id: 'drill-hermetic-contract',
    what: '让夹具根返回 `.`（改回会写真实工作树的那一版）',
    target: 'tests/application/harness.ts',
    breakIt: toLegacyFakeDocs,
    run: ['npx', 'vitest', 'run', 'tests/hermetic-guard.test.ts'],
    expectOutput: ['TEST_HERMETIC_CONTRACT'],
  },
  {
    id: 'drill-triage-refresh',
    what: '往基线追加一条假失败（模拟 refresh 静默吞掉新失败）',
    target: 'docs/reviews/test-baseline.failures.txt',
    breakIt: src => src + 'tests/fake-drill.test.ts :: 假失败 :: 演练用\n',
    run: ['npx', 'vitest', 'run', 'tests/baseline-triage.test.ts'],
    expectOutput: ['既不在 reverse.txt 也不在 other.txt'],
  },
]

interface DrillOutcome {
  readonly id: string
  readonly ok: boolean
  readonly exitCode: number
  readonly named: boolean
  readonly restored: boolean
  readonly note: string
}

/** 跑命令并返回 {exitCode, output}（**容忍非零**：这里要的正是非零）。 */
function runCommand(argv: readonly string[]): { exitCode: number; output: string } {
  try {
    const out = execFileSync(argv[0]!, argv.slice(1), {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { exitCode: 0, output: out }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { exitCode: e.status ?? 1, output: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

async function main(): Promise<void> {
  const wantJson = process.argv.includes('--json')
  const keep = process.argv.includes('--keep')

  // ── 跑前范围自检：目标必须存在（不存在 → 退出码 1，不静默跳过）────────────────
  const missing = DRILLS.filter(d => !existsSync(abs(d.target))).map(d => d.target)
  if (missing.length > 0) {
    console.error('[drill] 范围自检失败：以下演练目标不存在（路径写错或文件被移走）：')
    for (const m of missing) console.error('  - ' + m)
    process.exit(1)
  }

  console.log('[drill] 反向演练 ' + String(DRILLS.length) + ' 条 · 目标存在性自检通过')
  const outcomes: DrillOutcome[] = []

  for (const drill of DRILLS) {
    const snapshot: readonly FileSnapshot[] = snapshotFiles([drill.target])
    const original = snapshot[0]!.content
    let broken: string
    try {
      broken = drill.breakIt(original)
      if (broken === original) throw new Error('改坏变换没有产生任何差异')
    } catch (err) {
      console.error('[drill] ' + drill.id + ' 改坏失败：' + String((err as Error).message))
      outcomes.push({ id: drill.id, ok: false, exitCode: -1, named: false, restored: true, note: '改坏变换失败' })
      continue
    }
    writeFileSync(abs(drill.target), broken, 'utf8')

    const { exitCode, output } = runCommand(drill.run)
    const named = drill.expectOutput.some(t => output.includes(t))
    const wentRed = exitCode !== 0

    // ── 并发写入检测：文件已不是我们写进去的那份 → 放弃还原并响亮报错 ──────────
    const current = readFileSync(abs(drill.target), 'utf8')
    if (current !== broken) {
      console.error('[drill] ' + drill.id + ' 检测到并发写入：' + drill.target
        + ' 在演练期间被别的窗口改动——**放弃还原**（宁可不还原，也不覆盖别人的改动）。'
        + '请人工核对该文件后重跑。')
      outcomes.push({ id: drill.id, ok: false, exitCode, named, restored: false, note: '并发写入，放弃还原' })
      continue
    }

    if (!keep) restoreFiles(snapshot)
    const restored = !keep && readFileSync(abs(drill.target), 'utf8') === original
    outcomes.push({
      id: drill.id,
      ok: wentRed && named && (keep || restored),
      exitCode,
      named,
      restored,
      note: (wentRed ? '已红' : '**没红**') + ' · ' + (named ? '有点名证据' : '**没点名**'),
    })
  }

  const ok = outcomes.every(o => o.ok)
  const summary = {
    _note: 'REQ-261006201814-ac4f FR-8 反向演练：每条都「改坏 → 判据必红 → 逐字节还原」。'
      + 'ok=true 表示五条全部如预期变红并点名、且已逐字节还原。',
    generatedAt: new Date().toISOString(),
    outcomes,
    allOk: ok,
  }
  if (wantJson) console.log(JSON.stringify(summary, null, 2))
  else {
    for (const o of outcomes) {
      console.log('[drill] ' + (o.ok ? '✓' : '✗') + ' ' + o.id + ' exit=' + String(o.exitCode)
        + ' restored=' + String(o.restored) + ' —— ' + o.note)
    }
  }
  if (!ok) {
    console.error('[drill] 判据未过：有演练没有如预期变红/点名/还原（退出码 1）')
    process.exit(1)
  }
  console.log('[drill] 判据通过：' + String(outcomes.length) + ' 条演练全部「改坏 → 必红 → 点名 → 逐字节还原」')
}

await main()
