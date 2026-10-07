/**
 * 路径抽取口径的边界用例（REQ-261007095750-9f48 FR-1）。
 *
 * 为什么单独立一个文件：`declaredFiles` 是**冲突族判据**的唯一路径抽取器，它同时服务
 * 文件冲突门（硬拒）与零交集依赖边建议（软提示）。口径的边界（哪些写法算坐标、哪些不算）
 * 值得有一份专门的、逐条可读的清单——它错了，两个判据一起瞎。
 * （另有 `src/domain/task/Footprint.ts` 的一套更宽 PAT_RE 服务「体量下限」，用途不同，不在本文件口径内。）
 *
 * 与 `design/interfaces.md` §1.2 的样例表一一对应（TC-1…TC-5）。
 */
import { describe, expect, it } from 'vitest'
import { declaredFiles } from '../src/application/internal/conflict-check.js'

describe('路径抽取口径：扩根后的边界（FR-1）', () => {
  it('TC-1：src 落点抽得出（扩根前返回空数组）', () => {
    expect(declaredFiles('改 src/application/internal/conflict-check.ts')).toEqual([
      'src/application/internal/conflict-check.ts',
    ])
    // 深层目录也要抽得出（目录段任意层）
    expect(declaredFiles('见 src/application/query/stages/detail.ts 的实现')).toEqual([
      'src/application/query/stages/detail.ts',
    ])
  })

  it('TC-2：.mts 扩展名抽得出（扩根前扩展名表不含它）', () => {
    expect(declaredFiles('加 scripts/path-extraction-probe.mts')).toEqual([
      'scripts/path-extraction-probe.mts',
    ])
    expect(declaredFiles('改 src/tools/local.mts')).toEqual(['src/tools/local.mts'])
  })

  it('TC-3：目录名不算坐标（没有文件名与扩展名）', () => {
    expect(declaredFiles('见 src/application/internal/ 这一层')).toEqual([])
    expect(declaredFiles('主要在 src/client/styles/ 下面')).toEqual([])
    expect(declaredFiles('src 这个目录要重构')).toEqual([])
  })

  it('TC-4：空输入与无扩展名不误报', () => {
    expect(declaredFiles('')).toEqual([])
    expect(declaredFiles('顺手改一下 src')).toEqual([])
    expect(declaredFiles('改 src/application/internal/conflict-check（漏了扩展名）')).toEqual([])
    // 未知扩展名不视为路径
    expect(declaredFiles('改 src/notes.txt')).toEqual([])
  })

  it('TC-5：既有四根与 agent-dh/ 前缀不回归（只增不减）', () => {
    expect(declaredFiles('改 packages/pm/src/x.ts')).toEqual(['packages/pm/src/x.ts'])
    expect(declaredFiles('改 scripts/build.mjs')).toEqual(['scripts/build.mjs'])
    expect(declaredFiles('补 tests/a.test.ts')).toEqual(['tests/a.test.ts'])
    expect(declaredFiles('写 docs/architecture/x.md')).toEqual(['docs/architecture/x.md'])
    expect(declaredFiles('改 agent-dh/docs/architecture/x.md')).toEqual([
      'agent-dh/docs/architecture/x.md',
    ])
  })

  it('去重：同一文件写两次只出一条', () => {
    expect(declaredFiles('改 src/a.ts，再改 src/a.ts')).toEqual(['src/a.ts'])
  })

  it('证伪锚：抽取器不查盘——盘上不存在的 src 坐标照样抽出（查盘是设计坐标探针的事）', () => {
    expect(declaredFiles('改 src/this/path/does/not/exist.ts')).toEqual([
      'src/this/path/does/not/exist.ts',
    ])
  })
})
