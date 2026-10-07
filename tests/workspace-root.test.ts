/**
 * 测试根单一事实源（REQ-261006201814-ac4f t2 / FR-5）。
 *
 * ## 这个用例在防什么
 *
 * 改前本仓有**两套**测试根策略，而它们给出的答案不同：
 *   · `tests/helpers/tool-deps.ts` → 仓库内 cwd 一律兜底到临时根（安全）；
 *   · `tests/application/harness.ts` 的 `FakeDocs.workspaceRoot()` → 恒返回 `'.'`（危险）。
 * 差异就是泄漏本身：走 harness 的用例把 RTM 写进了**真实工作树**。
 *
 * 故本用例的判据不是「某个函数返回了 /tmp」，而是**两条路径必须给出同一类答案**——
 * 谁再写第三套策略、或谁把 harness 改回 `'.'`，这里先亮。
 *
 * @module dsh-pmboard/tests/workspace-root
 */
import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import {
  REPO_ROOT, isUnderTempDir, perFileWorkspaceRoot, resolveWorkspaceRoot, testWorkspaceRoot,
} from './helpers/workspace-root.js'
import { testWorkspaceRoot as fromToolDeps, resolveWorkspaceRoot as resolveFromToolDeps } from './helpers/tool-deps.js'
import { FakeDocs } from './application/harness.js'

describe('① 两条策略不再分叉', () => {
  it('tool-deps 与 harness 取到的是同一类根（都在系统临时目录下）', () => {
    const viaToolDeps = fromToolDeps()
    const viaHarness = new FakeDocs(() => 0).workspaceRoot()

    expect(isUnderTempDir(viaToolDeps), 'tool-deps 的根不在临时目录：' + viaToolDeps).toBe(true)
    expect(
      isUnderTempDir(viaHarness),
      'harness 的 FakeDocs 根不在临时目录（改前是 \u0027.\u0027 = 真实工作树）：' + viaHarness,
    ).toBe(true)
  })

  it('harness 的根不是相对路径、也不指向仓库内（泄漏的两个特征）', () => {
    const root = new FakeDocs(() => 0).workspaceRoot()
    expect(isAbsolute(root), '根必须是绝对路径（\u0027.\u0027 这类相对路径会落到 cwd）：' + root).toBe(true)
    expect(
      relative(REPO_ROOT, root).startsWith('..'),
      '根不得落在仓库内：' + root + '（仓库根 ' + REPO_ROOT + '）',
    ).toBe(true)
  })

  it('tool-deps 只是再导出，与单一事实源逐字同源', () => {
    expect(fromToolDeps).toBe(testWorkspaceRoot)
    expect(resolveFromToolDeps).toBe(resolveWorkspaceRoot)
  })
})

describe('② 既有的解析语义零变更（FR-9① 存量兼容）', () => {
  it('显式传入优先', () => {
    expect(resolveWorkspaceRoot('/tmp/explicit-root')).toBe('/tmp/explicit-root')
  })

  it('cwd 在仓库内 → 兜底到临时根（不写仓库）', () => {
    // 测试进程的 cwd 就是仓库根，故这里天然覆盖「仓库内任何目录」这条分支
    const r = resolveWorkspaceRoot(undefined)
    expect(isUnderTempDir(r), 'cwd 在仓库内时必须兜底到临时根：' + r).toBe(true)
  })

  it('临时根惰性创建、进程内稳定（同一个值）', () => {
    const a = testWorkspaceRoot()
    const b = testWorkspaceRoot()
    expect(a).toBe(b)
    expect(existsSync(a), '临时根必须真实存在：' + a).toBe(true)
    expect(statSync(a).isDirectory()).toBe(true)
  })

  it('每文件根彼此不同、且都在临时目录下', () => {
    const x = perFileWorkspaceRoot('file:///probe/a.test.ts')
    const y = perFileWorkspaceRoot('file:///probe/b.test.ts')
    expect(x).not.toBe(y)
    expect(perFileWorkspaceRoot('file:///probe/a.test.ts'), '同 URL 必须记忆化').toBe(x)
    expect(isUnderTempDir(x)).toBe(true)
  })
})

describe('③ 目录判据自检（守卫自身的守卫）', () => {
  it('isUnderTempDir 对仓库内路径判 false、对临时路径判 true', () => {
    expect(isUnderTempDir(join(REPO_ROOT, 'docs')), '仓库内路径不得被判成临时目录').toBe(false)
    expect(isUnderTempDir(testWorkspaceRoot())).toBe(true)
  })
})
