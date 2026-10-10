/**
 * 类型注册表装配点（REQ-261009174713-7bc8 · 卡 t-cfd8ae / RF-25 / RF-26）。
 *
 * 判据三条，对应装配点的三件不可退让的事：
 *   ① **六类齐备**：装配期缺类必须响亮（不是按 feature 兜底）；
 *   ② **装配点是唯一认识六个类型包的地方**：core 与其它子包不得 import 具体类型包
 *      （L1 → L0.5 只到 type-kit）——这条是「走某类型逻辑只落该类型包」的物理保障；
 *   ③ 快照稳定：注册表可当基线用（与 pm-type-kit/tests/type-spec-snapshot.test.ts 同源口径）。
 *
 * @module dsh-pmboard/tests/type-registry-wiring
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from 'tests/helpers/repo-root.js'
import { TYPE_REGISTRY, TYPE_SPECS } from 'src/type-registry.js'

const ROOT = REPO_ROOT

/** 递归收集某目录下的 .ts（不含 node_modules）。 */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) tsFiles(p, out)
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('类型注册表装配点', () => {
  it('六类齐备：requireComplete 已在装配期通过，categories 与六类型集合相等', () => {
    expect(TYPE_SPECS).toHaveLength(6)
    expect([...TYPE_REGISTRY.categories()].sort()).toEqual(['bug', 'chore', 'doc', 'feature', 'refactor', 'spike'])
    expect(TYPE_REGISTRY.missing()).toEqual([])
    // 任一类型都能取回自己的规格（不落到别类）
    for (const spec of TYPE_SPECS) expect(TYPE_REGISTRY.require(spec.category).category).toBe(spec.category)
  })

  it('装配点是唯一认识具体类型包的地方（core 与其它子包不得 import 它们）', () => {
    const offenders: string[] = []
    for (const pkg of ['pm-core', 'pm-common', 'pm-client', 'pm-round-driver', 'pm-workflow', 'tool-pm']) {
      const dir = join(ROOT, 'pm', pkg, 'src')
      let files: string[] = []
      try { files = tsFiles(dir) } catch { continue }
      for (const f of files) {
        // 具体类型包 = pmboard-type-<不含 kit>；type-kit 是契约层，允许被依赖
        const m = /from '(pmboard-type-(?!kit)[a-z]+)/.exec(readFileSync(f, 'utf8'))
        if (m !== null) offenders.push(relative(ROOT, f) + ' → ' + m[1])
      }
    }
    expect(offenders, '具体类型包只允许被根包装配点 import（core 经注册表消费）').toEqual([])
  })

  it('快照稳定且非空（注册表可当基线）', () => {
    const a = TYPE_REGISTRY.snapshot()
    expect(a).toBe(TYPE_REGISTRY.snapshot())
    expect(a.length).toBeGreaterThan(1000)
    for (const c of TYPE_REGISTRY.categories()) expect(a).toContain(`"category": "${c}"`)
  })
})
