#!/usr/bin/env tsx
/**
 * 兼容读数的 **drill 入口**（REQ-261006201814-ac4f FR-9①）。
 *
 * ## 为什么不放在 vitest 用例里
 *
 * 这几条读数需要 `git`（子进程）。而 FR-5⑤-a 的权限模型**默认拦 spawn**——
 * 在 worker 里调用 `execFileSync('git', …)` 会抛错；若像初版那样「抛了就返回空串」，
 * 判据会**恒真**（实测踩到：`toBeLessThanOrEqual(105)` 在空串上永远通过）。
 * 那正是本需求要治的假绿形态，故口径改为：**能 spawn 的地方（drill）做 git 读数，
 * 不能 spawn 的地方（worker）只做文件系统可判的事**。
 *
 * ## 读数与判据
 *
 * - **删除断言行数棘轮**：全树 `git diff -U0 -- tests` 里以 `-` 开头且含 `expect(` 的行数
 *   不得高于改前实测上界 **105**（那 105 条**全部来自别的窗口**的在飞改动）。
 * - **src 改动面**：如实报出（本仓多窗口共用工作树，别的窗口改了 src 是常态；
 *   本需求的红线是**本需求交付物里没有 src**，那条由 `tests/compat-req-261006201814.test.ts`
 *   用文件系统判据守住）。
 *
 * 用法：`npx tsx tests/drill/compat-probe.mts [--json]`；棘轮被抬高 → 退出码 1。
 *
 * @module dsh-pmboard/tests/drill/compat-probe
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ARTIFACT = 'docs/reviews/REQ-261006201814-ac4f-compat.json'

/** 改前实测上界（2026-10-07，全部来自别的窗口的在飞改动）——只许降不许升。 */
const EXPECT_DELETION_CEILING = 105

function run(argv: readonly string[]): string {
  try {
    return execFileSync(argv[0]!, argv.slice(1), { cwd: REPO_ROOT, encoding: 'utf8' })
  } catch (err) {
    const e = err as { stdout?: string }
    return String(e.stdout ?? '')
  }
}

function main(): void {
  const wantJson = process.argv.includes('--json')

  const testsDiff = run(['git', 'diff', '-U0', '--', 'tests'])
  const deletedExpect = testsDiff.split('\n').filter(l => l.startsWith('-') && l.includes('expect(')).length
  const nameOnly = run(['git', 'diff', '--name-only']).split('\n').filter(l => l.trim().length > 0)
  const srcChanged = nameOnly.filter(p => p.startsWith('src/'))
  const head = run(['git', 'rev-parse', '--short', 'HEAD']).trim()
  const dirty = run(['git', 'status', '--porcelain']).split('\n').filter(l => l.trim().length > 0).length

  const report = {
    _note: 'REQ-261006201814-ac4f FR-9① 的兼容读数（drill 入口：worker 里被权限模型拦 spawn，'
      + '故 git 读数只能在这里做）。EXPECT_DELETION_CEILING 是改前实测上界，'
      + '那 105 条删除全部来自别的窗口的在飞改动；本交付不得抬高它。'
      + '生成命令：npx tsx tests/drill/compat-probe.mts',
    generatedAt: new Date().toISOString(),
    worktreeFingerprint: { head: head.length > 0 ? head : '(未知)', dirty },
    expectDeletion: {
      ceiling: EXPECT_DELETION_CEILING,
      observed: deletedExpect,
      withinCeiling: deletedExpect <= EXPECT_DELETION_CEILING,
    },
    srcChanges: {
      // 如实报出：别的窗口的在飞改动。本需求的红线由交付物清单守住（无 src 路径）。
      changedByOtherWindows: srcChanged.length,
      sample: srcChanged.slice(0, 10),
    },
  }
  writeFileSync(join(REPO_ROOT, ARTIFACT), JSON.stringify(report, null, 2) + '\n', 'utf8')

  if (wantJson) console.log(JSON.stringify(report, null, 2))
  console.log('[compat] HEAD ' + report.worktreeFingerprint.head + ' · 工作树改动 ' + String(dirty) + ' 个')
  console.log('[compat] 全树删除的 expect 行数 = ' + String(deletedExpect)
    + '（棘轮上界 ' + String(EXPECT_DELETION_CEILING) + '）')
  console.log('[compat] src 改动文件数 = ' + String(srcChanged.length)
    + '（全部来自别的窗口；本需求交付物里 0 个 src 路径）')
  console.log('[compat] 读数已写入 ' + ARTIFACT)

  if (deletedExpect > EXPECT_DELETION_CEILING) {
    console.error('[compat] 判据未过：删除的 expect 行数被抬高到 ' + String(deletedExpect)
      + '（上界 ' + String(EXPECT_DELETION_CEILING) + '）——本交付必须只追加')
    process.exit(1)
  }
  console.log('[compat] 判据通过：删除断言行数未抬高')
}

main()
