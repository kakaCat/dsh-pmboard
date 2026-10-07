#!/usr/bin/env tsx
/**
 * A/B 归因演练（REQ-261006201814-ac4f FR-10）——**产物生成入口**。
 *
 * ## 为什么必须是 drill 而不是普通用例
 *
 * A/B 归因要「临时改坏一个共享夹具，再逐字节还原」。而 FR-5⑤-a 的权限模型**禁止测试进程
 * 写仓内文件**（实测：`writeFileSync` 到仓内路径 `ERR_ACCESS_DENIED`）。故本演练只能跑在
 * 不受权限模型约束的 `npx tsx` 入口——这不是绕开守卫，正是守卫在生效：仓内写只允许
 * 显式、可留痕的 drill 做，且必须逐字节还原（快照 + sha256 复核，禁用按路径检出还原）。
 *
 * ## 归因对象
 *
 * 第一版实施期落地的共享夹具改动：`tests/application/harness.ts` 的 `FakeDocs`
 * ——文档根由 `'.'` 改为**绝对临时根**，并让替身认绝对路径（`keyOf` 归一）。
 * 回退态 = 改前形态（根 `'.'`、`keyOf` identity）。
 *
 * ## 判据
 *
 * `introduced`（带改动 − 回退）必须为空、`stable` 必须为真（两侧各连跑 ≥2 次）。
 * 违反 → 退出码 1（响亮失败，不静默）。
 *
 * 用法：`npx tsx tests/drill/ab-attribution.mts [--json]`
 *
 * @module dsh-pmboard/tests/drill/ab-attribution
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  restoreFiles,
  runAbAttribution,
  snapshotFiles,
  type AbResult,
} from '../helpers/ab-attribution.js'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const HARNESS = 'tests/application/harness.ts'
const ARTIFACT = 'docs/reviews/REQ-261006201814-ac4f-ab.json'

/** 本批测试文件：覆盖「夹具根」这条链的立项 / 捕获 / 根解析 / 契约锚点。 */
const FILES = [
  'tests/capture.test.ts',
  'tests/create-doc-location.test.ts',
  'tests/workspace-root.test.ts',
  'tests/hermetic-guard.test.ts',
]

const REPEAT = 2

function run(cmd: string, args: readonly string[]): string {
  try {
    return execFileSync(cmd, [...args], { cwd: REPO_ROOT, encoding: 'utf8' })
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return String(e.stdout ?? '') + String(e.stderr ?? '')
  }
}

function fingerprint(): { head: string; dirty: number } {
  const head = run('git', ['rev-parse', '--short', 'HEAD']).trim()
  const dirty = run('git', ['status', '--porcelain']).split('\n').filter(l => l.trim().length > 0).length
  return { head: head.length > 0 ? head : '(未知)', dirty }
}

/** 改前形态：根 `'.'`、替身只认相对键（`keyOf` identity）。 */
function toLegacyForm(source: string): string {
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

const abs = (rel: string): string => join(REPO_ROOT, rel)

async function main(): Promise<void> {
  const wantJson = process.argv.includes('--json')
  const snapshot = snapshotFiles([HARNESS])
  const source = readFileSync(abs(HARNESS), 'utf8')
  const legacy = toLegacyForm(source)
  if (legacy === source) {
    console.error('[ab] 回退形态与原文件相同——说明 harness 的 FakeDocs 已经不是「绝对根 + keyOf」形态，'
      + '本演练的归因对象已失效，请先核对 ' + HARNESS)
    process.exit(2)
  }

  console.log('[ab] 归因对象：' + HARNESS + ' 的 FakeDocs（绝对临时根 + keyOf ⇄ 改前 . + identity）')
  console.log('[ab] 本批文件 ' + String(FILES.length) + ' 个 · 两侧各连跑 ' + String(REPEAT) + ' 次')

  const result: AbResult = await runAbAttribution({
    subject: 'FakeDocs.workspaceRoot 由 . 改为绝对临时根，并让替身认绝对路径（keyOf 归一）',
    files: FILES,
    mutate: () => { writeFileSync(abs(HARNESS), legacy, 'utf8') },
    restore: () => restoreFiles(snapshot),
    verifyRestore: () => {
      const back = readFileSync(abs(HARNESS), 'utf8')
      if (back !== source) {
        throw Object.assign(new Error('A/B 还原失败：' + HARNESS + ' 与改前不逐字相同'), { code: 'TEST_AB_RESTORE_MISMATCH' })
      }
    },
    repeat: REPEAT,
  })

  const fp = fingerprint()
  const artifact = {
    _note: 'REQ-261006201814-ac4f FR-10 的 A/B 归因产物：同一批测试文件在「带改动」与「回退改动」'
      + '两侧各连跑 ' + String(REPEAT) + ' 次，逐条比失败集合。introduced 为空才能声称「不是本次引入」；'
      + 'stable 为假说明差异属既有顺序脆弱性（共享工作树下别的窗口仍在改 src）。'
      + '生成命令：npx tsx tests/drill/ab-attribution.mts',
    generatedAt: new Date().toISOString(),
    worktreeFingerprint: fp,
    subject: 'FakeDocs.workspaceRoot 由 . 改为绝对临时根，并让替身认绝对路径（keyOf 归一）',
    files: FILES,
    runs: {
      withChange: result.withChange,
      withoutChange: result.withoutChange,
    },
    repeatStability: {
      withChangeRuns: result.withChangeRuns,
      withoutChangeRuns: result.withoutChangeRuns,
      stable: result.stable,
    },
    introduced: result.introduced,
    fixed: result.fixed,
  }
  writeFileSync(abs(ARTIFACT), JSON.stringify(artifact, null, 2) + '\n', 'utf8')

  console.log('[ab] 带改动失败 ' + String(result.withChange.length)
    + ' 条 · 回退态失败 ' + String(result.withoutChange.length) + ' 条')
  console.log('[ab] introduced=' + String(result.introduced.length)
    + ' · fixed=' + String(result.fixed.length) + ' · stable=' + String(result.stable))
  if (result.introduced.length > 0) {
    console.error('[ab] 本次改动引入的新失败：')
    for (const x of result.introduced) console.error('  - ' + x)
  }
  console.log('[ab] 产物已写入 ' + ARTIFACT)
  if (wantJson) console.log(JSON.stringify(artifact, null, 2))

  if (result.introduced.length > 0) {
    console.error('[ab] 判据未过：introduced 必须为空（退出码 1）')
    process.exit(1)
  }
  if (!result.stable) {
    console.error('[ab] 判据未过：两侧复跑集合不稳定（属既有顺序脆弱性，需在报告里说明并复跑取证）')
    process.exit(1)
  }
  console.log('[ab] 判据通过：introduced 为空且 stable 为真')
}

await main()
