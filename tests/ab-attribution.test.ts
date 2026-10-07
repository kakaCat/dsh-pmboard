/**
 * A/B 归因助手的元测试（REQ-261006201814-ac4f FR-10）。
 *
 * ## 为什么它自己也要被测
 *
 * 「归因助手」是**判据的判据**：它若恒返回 `introduced: []`，所有下游卡都会"通过"。
 * 故把集合运算抽成纯函数 {@link compareAbSets}，在这里用**合成集合**把它的牙验出来：
 *   ① 真的引入一条回归 → `introduced` 必须非空；
 *   ② 无改动 → `introduced` 为空且 `stable` 为真（否则它会把噪声当回归）；
 *   ③ 复跑之间不一致 → `stable` 为假（不许把漂移说成稳定）。
 *
 * ## 为什么真跑 A/B 不在本文件里
 *
 * FR-5⑤-a 的权限模型**禁止测试进程写仓内文件**（本文件实测过：`writeFileSync` 到仓内路径
 * 直接 `ERR_ACCESS_DENIED`）。而 A/B 归因必须临时改坏一个共享夹具再逐字节还原——
 * 那只能发生在**不受权限模型约束的 drill 入口**（`npx tsx tests/drill/ab-attribution.mts`）。
 * 这不是绕开守卫，正是守卫生效的证据：repo 写入只能由显式、留痕的 drill 做。
 *
 * @module dsh-pmboard/tests/ab-attribution.test
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareAbSets, restoreFiles, snapshotFiles } from './helpers/ab-attribution.js'

describe('A/B 归因：集合运算（FR-10）', () => {
  it('反例一：真的引入一条回归 → introduced 非空（判据不是空转）', () => {
    const withSets = [
      ['tests/a.test.ts :: 甲', 'tests/a.test.ts :: 乙'],
      ['tests/a.test.ts :: 甲', 'tests/a.test.ts :: 乙'],
    ]
    const withoutSets = [
      ['tests/a.test.ts :: 甲'],
      ['tests/a.test.ts :: 甲'],
    ]
    const out = compareAbSets(withSets, withoutSets)
    expect(out.introduced).toEqual(['tests/a.test.ts :: 乙'])
    expect(out.fixed).toEqual([])
    expect(out.stable).toBe(true)
  })

  it('反例二：两侧相同 → introduced 为空且 stable 为真', () => {
    const sets = [['tests/a.test.ts :: 甲'], ['tests/a.test.ts :: 甲']]
    const out = compareAbSets(sets, sets)
    expect(out.introduced).toEqual([])
    expect(out.fixed).toEqual([])
    expect(out.stable).toBe(true)
  })

  it('反例三：复跑之间集合不一致 → stable 为假（不许把漂移说成稳定）', () => {
    const withSets = [['tests/a.test.ts :: 甲'], ['tests/a.test.ts :: 甲', 'tests/a.test.ts :: 乙']]
    const withoutSets = [['tests/a.test.ts :: 甲'], ['tests/a.test.ts :: 甲']]
    expect(compareAbSets(withSets, withoutSets).stable).toBe(false)
  })

  it('反例四：某一侧没跑过（空集合）→ 响亮抛错，不得当成「没有失败」', () => {
    expect(() => compareAbSets([], [['x']])).toThrow(/至少跑过一次/)
    expect(() => compareAbSets([['x']], [])).toThrow(/至少跑过一次/)
  })
})

describe('A/B 归因：还原通道（FR-10）', () => {
  it('逐字节（sha256 复核）：写回后内容必须与快照逐字相同', () => {
    // 用系统临时目录：测试进程允许写那里（这正是权限模型的放行范围）
    const dir = mkdtempSync(join(tmpdir(), 'ab-meta-'))
    const file = join(dir, 'fixture.txt')
    const original = '第一行\n第二行\n'
    writeFileSync(file, original, 'utf8')

    const snap = snapshotFiles([file])
    writeFileSync(file, original + '被人为改坏\n', 'utf8')
    expect(readFileSync(file, 'utf8')).not.toBe(original)

    restoreFiles(snap)
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(snap[0]?.sha256).toHaveLength(64)
    rmSync(dir, { recursive: true, force: true })
  })

  it('还原通道确实校验 sha256：快照被篡改后写回必须响亮失败', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ab-meta-'))
    const file = join(dir, 'fixture.txt')
    writeFileSync(file, '原内容\n', 'utf8')
    const snap = snapshotFiles([file])
    const forged = [{ ...snap[0]!, content: '伪造内容\n' }]
    expect(() => restoreFiles(forged)).toThrow(/sha256 不符/)
    rmSync(dir, { recursive: true, force: true })
  })
})
