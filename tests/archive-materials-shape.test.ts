/**
 * 归档材料**形态判定**单测（REQ-261006201841-944d t1 / FR-2）。
 *
 * 本文件只测 `assertArchiveMaterials` 的**形态**判据（零 IO）：`manual_updates[].path` 必须是
 * `路径#锚点`，且路径部分命中该需求类型的 `mergeTargets` 白名单。
 *
 * 为什么单独一个文件：形态（写得对不对）与事实（磁盘上有没有）是两处判定，
 * 事实判定在 `tests/archive-targets-gate.test.ts`（t2）。混在一起会让「谁拒的」不可分辨——
 * 而拒绝原因可分辨正是 FR-2 验收标准 2 的要求。
 */
import { describe, it, expect } from 'vitest'
import { assertArchiveMaterials } from '../src/shared/protocol.js'

const DIR = 'docs/requirements/REQ-261006201841-944d'

/** feature 的最小合法材料（必填文档齐、合并去向在白名单内）。 */
const featureBase = (manualUpdates: unknown[]): Record<string, unknown> => ({
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  mergedInto: ['docs/architecture/project-manual.md'],
  indexEntry: '把归档声明的落地变成可证伪',
  manualUpdates,
})

describe('归档材料形态判定：manual_updates 的 path#anchor（FR-2）', () => {
  it('① 合法形态 路径#锚点 → 通过', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/architecture/project-manual.md#机制备忘-收尾门的三条硬约束', summary: '新增收尾门三条硬约束' },
    ]) as never)).not.toThrow()
  })

  it('② 缺 # （旧自由文本形态）→ 拒，且消息点明「路径#锚点」形态', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/architecture/project-manual.md', summary: '新增一节' },
    ]) as never)).toThrow(/路径#锚点/)
  })

  it('② 反向：旧形态即使带了 section 也拒（section 已废弃，不构成形态）', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/architecture/project-manual.md', section: '收尾门', summary: '新增一节' },
    ]) as never)).toThrow(/路径#锚点/)
  })

  it('③ 多个 # → 拒（形态只能是恰好一个分隔符）', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/architecture/a.md#x#y', summary: '新增一节' },
    ]) as never)).toThrow(/路径#锚点/)
  })

  it('③ 反向：锚点为空（尾部只有 #）→ 拒', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/architecture/a.md#', summary: '新增一节' },
    ]) as never)).toThrow(/路径#锚点/)
  })

  it('④ 路径不在白名单（CLAUDE.md）→ 拒，且消息列出该类型的白名单前缀', () => {
    let message = ''
    try {
      assertArchiveMaterials('feature', featureBase([
        { path: 'CLAUDE.md#3-运行测试', summary: '补一条测试纪律' },
      ]) as never)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('docs/architecture/')
    expect(message).toContain('docs/guides/')
    expect(message).toContain('CLAUDE.md')
  })

  it('④ 反向：白名单判定用的是 # 前的路径段（锚点里出现别的目录名不算越界）', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([
      { path: 'docs/guides/operations.md#排查顺序', summary: '新增排查顺序一节' },
    ]) as never)).not.toThrow()
  })

  it('⑤ 回归钉：既有必填文档缺项仍被拒（本次只加形态判据，不放宽既有判据）', () => {
    const base = featureBase([{ path: 'docs/architecture/a.md#b', summary: 'x' }])
    base['docs'] = [{ kind: 'verification', path: DIR + '/verification.md' }]
    expect(() => assertArchiveMaterials('feature', base as never)).toThrow(/缺少必填文档/)
  })

  it('⑤ 回归钉：feature 仍必须申报 manualUpdates（requireManual 未被削弱）', () => {
    expect(() => assertArchiveMaterials('feature', featureBase([]) as never)).toThrow(/缺少项目说明书更新点/)
  })

  it('⑤ 回归钉：mergedInto 的既有前缀判定未变（越界仍拒）', () => {
    const base = featureBase([{ path: 'docs/architecture/a.md#b', summary: 'x' }])
    base['mergedInto'] = ['docs/random/elsewhere.md']
    expect(() => assertArchiveMaterials('feature', base as never)).toThrow(/不在本类型允许的位置/)
  })
})
