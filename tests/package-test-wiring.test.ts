/**
 * 包级接线门禁（2026-10-11 Phase 3）：**每个包能自己跑测试**，且跑的是同一套隔离。
 *
 * 为什么要有它：包级 `test` 一旦靠人手工记得加，就会漂移成两种形态——有的包能自跑、
 * 有的包只能从根按路径 scoped 跑；更糟的是**各包各抄一份 vitest 配置**时，
 * 沙箱 argv / 别名会静默走样（`hermetic-guard` 只证"拦得住"，证不了"配置同源"）。
 * 故这里钉住两条：脚本在场、配置**引用共享基座**（不是复制粘贴）。
 *
 * 范围：有 `tests/` 目录的包（`pm/` 无测试目录，不在范围内）。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from 'tests/helpers/repo-root.js'
import { workspacePkgDirs } from 'tests/helpers/workspace-pkgs.js'

/** 有真实 `tests/` 目录的包（= 必须有自跑接线的包）。 */
function pkgsWithTests(): string[] {
  return workspacePkgDirs().filter(d => {
    const t = join(REPO_ROOT, d, 'tests')
    return existsSync(t) && statSync(t).isDirectory()
  })
}

describe('包级自跑接线', () => {
  it('每个有 tests/ 的包都能自跑（test 脚本 + 引用共享基座的 vitest 配置）', () => {
    const dirs = pkgsWithTests()
    expect(dirs.length, '未扫到任何带测试的包：判据可能已失效').toBeGreaterThan(10)
    const missingScript: string[] = []
    const missingConfig: string[] = []
    const notShared: string[] = []
    for (const d of dirs) {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, d, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      if (pkg.scripts?.test !== 'vitest run') missingScript.push(d)
      const cfgPath = join(REPO_ROOT, d, 'vitest.config.mts')
      if (!existsSync(cfgPath)) { missingConfig.push(d); continue }
      if (!readFileSync(cfgPath, 'utf8').includes('vitest.base.mts')) notShared.push(d)
    }
    expect(missingScript, '这些包缺 test 脚本：' + missingScript.join('、')).toEqual([])
    expect(missingConfig, '这些包缺 vitest.config.mts：' + missingConfig.join('、')).toEqual([])
    expect(notShared, '这些包的配置没引用共享基座 vitest.base.mts：' + notShared.join('、')).toEqual([])
  })
})
