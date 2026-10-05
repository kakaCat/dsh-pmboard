/**
 * 反向演练矩阵（REQ-261004065652-5c1c t9 / FR-1…FR-11 的机械判据）。
 *
 * ## 为什么要有这个脚本
 *
 * 本需求每条 FR 都配了反向演练（**把修复拿掉 → 用例必须红**），但那是各卡实施时手工做的：
 * 加一次补丁、跑一次、再还原——靠人记。这里把它固化成**一条命令可复跑**的矩阵，
 * 让"护栏真的在拦"成为可复核的字节事实，而不是各卡汇报里的几行转述。
 *
 * ## 恢复安全（血的教训）
 *
 * 2026-10-04 本需求实施期间出过一次事故：还原步骤误用 `git checkout --`，把工作区里
 * **多个窗口的未提交改动**一起回退（见 evidence/AskConfirm.recovery-notes.md）。
 * 故本脚本**只用文件级备份 + sha256 校验恢复**：每次还原后逐字节比对备份，
 * 不一致立即中止（绝不带着半改状态继续跑下一项）。
 *
 * 跑法：
 *   npx tsx scripts/reverse-drill-matrix.mts            # 人读表格
 *   npx tsx scripts/reverse-drill-matrix.mts --json      # 机器可读
 *
 * 退出码：0 = 全部演练如预期变红且源码已逐字节还原；1 = 有演练没变红 / 还原失败。
 *
 * @module dsh-pmboard/scripts/reverse-drill-matrix
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Drill {
  /** 护栏名（人读） */
  name: string
  /** 对应 FR */
  fr: string
  /** 被改造的源文件（工作区相对路径） */
  file: string
  /** 锚点原文 → 替换后的"拿掉修复"版本（必须命中，否则本项失败） */
  from: string
  to: string
  /** 该护栏的判据用例文件 */
  test: string
  /** 预期至少变红几条 */
  minRed: number
}

const DRILLS: readonly Drill[] = [
  {
    name: '投影读己所写（写路径不刷新快照）', fr: 'FR-4',
    file: 'src/repositories/ShardedRequirementStore.ts',
    from: '        if (facts !== undefined && this.factsCache !== undefined) this.factsCache.set(id, facts)',
    to: '        // 反向演练：刷新拿掉',
    test: 'tests/store-projection-ryow.test.ts', minRed: 5,
  },
  {
    name: '上游致命错误不可重试（AUTH 落进 transient）', fr: 'FR-1',
    file: 'src/application/internal/upstream-failure.ts',
    from: "    const fatal = code === 'AUTH' || FATAL_MESSAGE_RE.test(code + ' ' + message)",
    to: '    const fatal = false // 反向演练',
    test: 'tests/dive-loop-breaker.test.ts', minRed: 4,
  },
  {
    name: '内存闭锁 fail-closed（起轮前不看闭锁）', fr: 'FR-3',
    file: 'src/application/dive/round-driver.ts',
    from: '    if (latchBlocks(state)) return false',
    to: '    // 反向演练：闭锁判定拿掉',
    test: 'tests/dive-loop-breaker.test.ts', minRed: 1,
  },
  {
    name: '人工门即停手（起轮前不看台账态的门）', fr: 'FR-5',
    file: 'src/application/dive/round-driver.ts',
    from: '    if (ports.humanGate !== undefined) {',
    to: '    if (false) { // 反向演练',
    test: 'tests/dive-human-gate-stop.test.ts', minRed: 6,
  },
  {
    name: '断点留痕限流（窗口置 0）', fr: 'FR-8',
    file: 'src/application/internal/interruption.ts',
    from: 'export const INTERRUPTION_MIN_INTERVAL_MS = 10 * 60 * 1000',
    to: 'export const INTERRUPTION_MIN_INTERVAL_MS = 0 // 反向演练',
    test: 'tests/interruption-dedupe.test.ts', minRed: 2,
  },
  {
    name: '引擎开工预检（预检关掉）', fr: 'FR-10',
    file: 'src/application/use-cases/AdvanceChain.ts',
    from: '  if (probe !== false) return undefined',
    to: '  if (true) return undefined // 反向演练',
    test: 'tests/advance-engine-precheck.test.ts', minRed: 2,
  },
]

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

function redCountOf(output: string): number {
  const m = /Tests\s+(\d+)\s+failed/.exec(output)
  return m === null ? 0 : Number(m[1])
}

interface Result {
  name: string
  fr: string
  test: string
  red: number
  minRed: number
  ok: boolean
  restored: boolean
  note: string
}

function runDrill(d: Drill, work: string): Result {
  const backup = join(work, d.file.replace(/[\/]/g, '__'))
  copyFileSync(d.file, backup)
  const before = sha(d.file)
  const src = readFileSync(d.file, 'utf8')
  if (!src.includes(d.from)) {
    copyFileSync(backup, d.file)
    return { name: d.name, fr: d.fr, test: d.test, red: -1, minRed: d.minRed, ok: false, restored: sha(d.file) === before, note: '锚点未命中（源码已漂移，演练无效）' }
  }
  writeFileSync(d.file, src.replace(d.from, d.to))

  let out = ''
  try {
    const r = spawnSync('npx', ['vitest', 'run', d.test, '--reporter=dot'], { encoding: 'utf8', timeout: 300_000 })
    out = (r.stdout ?? '') + (r.stderr ?? '')
  } catch (err) {
    out = String(err)
  } finally {
    copyFileSync(backup, d.file)
  }

  const restored = sha(d.file) === before
  const red = redCountOf(out)
  return {
    name: d.name, fr: d.fr, test: d.test, red, minRed: d.minRed,
    ok: restored && red >= d.minRed,
    restored,
    note: restored ? (red >= d.minRed ? '如预期变红并已逐字节还原' : '**没变红**：护栏可能是空的') : '**还原失败**：源码与备份不一致',
  }
}

function main(): void {
  const work = mkdtempSync(join(tmpdir(), 'pmboard-drills-'))
  const asJson = process.argv.includes('--json')
  let allOk = true
  const results: Result[] = []
  try {
    for (const d of DRILLS) {
      const r = runDrill(d, work)
      results.push(r)
      if (!r.ok) allOk = false
      if (!r.restored) {
        // 还原失败：立刻中止并响亮报出（绝不带着半改状态继续）
        console.error('[中止] ' + d.file + ' 还原失败（sha256 不一致），停止后续演练。')
        break
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  if (asJson) {
    console.log(JSON.stringify({ allOk, results }, null, 2))
  } else {
    console.log('== 反向演练矩阵（拿掉修复 → 判据必须变红）==')
    for (const r of results) {
      console.log(
        (r.red >= r.minRed ? '✅' : '❌') + ' ' + r.fr.padEnd(6) + ' ' + r.name
        + '  →  红 ' + (r.red < 0 ? '（未跑）' : r.red) + '/应≥' + r.minRed
        + '  [' + r.test + ']  ' + r.note,
      )
    }
    console.log(allOk ? '\n[通过] 全部演练如预期变红，且源码逐字节还原。' : '\n[失败] 有演练没变红或还原失败——不得宣称护栏有效。')
  }
  if (!allOk) process.exitCode = 1
}

main()
