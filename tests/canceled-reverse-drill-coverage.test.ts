/**
 * `canceled` 组逆验证矩阵的**结构判据**（REQ-261005193546-1b1a · t-848a93）。
 *
 * 逆验证矩阵（`scripts/reverse-drill-matrix.mts`）本身是"判据的判据"：它真改坏 `src/**`、真跑
 * 判据、真还原。正因为它跑起来很慢（14 条 × 一条 vitest），它的**元信息**最容易悄悄腐坏而没人发现：
 * 条目被删掉一条、`target` 被改成不存在的路径（范围自检没兜住时就是"没跑也全绿"）、
 * 判据命令指到一个早已改名的用例文件、有人为了图省事把还原写回 `git checkout --`。
 *
 * 本用例只读不跑（不 spawn、不改任何文件）：它 import 矩阵模块读 `CANCELED_DRILLS`，并读脚本文本。
 * 为什么可以安全 import：脚本末尾的 `main()` 由 `process.env.VITEST === undefined` 把守——
 * 在 vitest 里 import 它**不会**去动工作区源码。
 *
 * 契源：`docs/requirements/REQ-261005193546-1b1a/tasks/t-848a93.md` §得到什么结果
 * （条目数 === 14、每条有 target 与判据命令、`git checkout` 命中 === 0）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CANCELED_DRILLS } from '../scripts/reverse-drill-matrix.mts'

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/reverse-drill-matrix.mts', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT_SRC = readFileSync(SCRIPT_PATH, 'utf8')

/** t-848a93 实施说明点名的 14 条落点（顺序 = 说明里的编号；`ref` 与之一一对应）。 */
const EXPECTED_REFS: readonly string[] = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
  'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14',
]

/**
 * 14 条应当触达的 `target` 文件集合（不多不少）。
 * 钉死集合的用处：把某条 `target` 改成不存在的路径 / 改成别的文件，这里立刻红——
 * 即使范围自检没跑到（例如脚本被改坏）。
 */
const EXPECTED_TARGETS: readonly string[] = [
  'src/application/query/QueryStageDetail.ts',
  'src/application/query/QueryDag.ts',
  'src/http/routers/stages.ts',
  'src/shared/protocol.ts',
  'src/domain/queue/topology.ts',
  'src/domain/queue/validateQueue.ts',
  'src/repositories/QueueRepository.ts',
  'src/client/stage-panel.ts',
  'src/application/internal/rtm-yaml.ts',
]

/** 判据命令里"看起来像仓库内路径"的 token（含 `/`）。 */
const pathTokensOf = (cmd: readonly string[]): string[] => cmd.filter(t => t.includes('/'))

describe('canceled 组逆验证矩阵：结构判据（条目数 / target / 判据命令 / 还原纪律）', () => {
  it('① 条目数 === 14，且 ref 逐条 = C1…C14（删一条 / 加一条都红）', () => {
    expect(CANCELED_DRILLS).toHaveLength(14)
    expect(CANCELED_DRILLS.map(d => d.ref)).toEqual([...EXPECTED_REFS])
    // 名字与改坏点不得重复（复制粘贴出来的"两条一样的演练"会把 14 条灌水成 13 条有效覆盖）
    expect(new Set(CANCELED_DRILLS.map(d => d.name)).size).toBe(14)
    expect(new Set(CANCELED_DRILLS.map(d => d.breakPoint)).size).toBe(14)
  })

  it('② 每条的 target 都在盘上，且 target 集合 === 实施说明点名的 9 个文件（不多不少）', () => {
    for (const d of CANCELED_DRILLS) {
      expect(d.target.length, '[' + d.ref + '] target 为空').toBeGreaterThan(0)
      expect(existsSync(REPO_ROOT + '/' + d.target), '[' + d.ref + '] target 不在盘上：' + d.target).toBe(true)
    }
    expect([...new Set(CANCELED_DRILLS.map(d => d.target))].sort()).toEqual([...EXPECTED_TARGETS].sort())
  })

  it('③ 每条都有判据命令，且命令里的判据文件真的存在（指到改名/删掉的用例即红）', () => {
    for (const d of CANCELED_DRILLS) {
      expect(d.cmd.length, '[' + d.ref + '] 判据命令为空').toBeGreaterThan(0)
      const paths = pathTokensOf(d.cmd)
      expect(paths.length, '[' + d.ref + '] 判据命令里没有仓库内路径：' + d.cmd.join(' ')).toBeGreaterThan(0)
      for (const p of paths) {
        expect(existsSync(REPO_ROOT + '/' + p), '[' + d.ref + '] 判据文件不存在：' + p).toBe(true)
      }
      // 期望退出码必须是"判据红"，且必须点名改坏点（否则可能出现"别处红也算过"）
      expect(d.expectExit, '[' + d.ref + '] expectExit 必须是 1（判据红）').toBe(1)
      expect(d.expectNamed.length, '[' + d.ref + '] 没有点名片段（未点名则"红得不明所以"）')
        .toBeGreaterThan(0)
    }
  })

  it('④ 每条都标了判据类型；标为「源码锚点」的必须写明它考的是源码锚点而不是行为', () => {
    for (const d of CANCELED_DRILLS) {
      expect(['behavior', 'source-anchor'], '[' + d.ref + '] 判据类型未标或非法').toContain(d.criterion)
    }
    // 行为等价的只有这两条：C2（基类收敛改回等价手写 filter，t6 实测行为全绿）、
    // C3（两个 body 各自再写一遍，基类仍收敛 ⇒ 读数不变）。把它们算进行为覆盖就是夸大覆盖力。
    const anchors = CANCELED_DRILLS.filter(d => d.criterion === 'source-anchor').map(d => d.ref)
    expect(anchors).toEqual(['C2', 'C3'])
    for (const d of CANCELED_DRILLS.filter(x => x.criterion === 'source-anchor')) {
      expect(d.note, '[' + d.ref + '] 源码锚点条目必须写明限定语（它考的是源码锚点而不是行为）')
        .toContain('源码锚点')
      expect(d.note).toContain('行为')
    }
  })

  it('⑤ 每条都有非空改坏点：from / to 非空、from !== to、breakPoint 非空、mode = file', () => {
    for (const d of CANCELED_DRILLS) {
      expect(d.from.length, '[' + d.ref + '] from 为空').toBeGreaterThan(0)
      expect(d.to.length, '[' + d.ref + '] to 为空').toBeGreaterThan(0)
      expect(d.from, '[' + d.ref + '] from === to（改坏点等于没改）').not.toBe(d.to)
      expect(d.breakPoint.length, '[' + d.ref + '] breakPoint 为空').toBeGreaterThan(0)
      // 判据是 vitest 真跑工作区源码 ⇒ 只能 file 模式（copy 模式改的是临时副本，vitest 看不见）
      expect(d.mode, '[' + d.ref + '] canceled 组只能用 file 模式').toBe('file')
      // 附加改坏点（若有）也必须是非空替换
      for (const e of d.extraEdits ?? []) {
        expect(e.from.length).toBeGreaterThan(0)
        expect(e.from).not.toBe(e.to)
      }
    }
  })

  it('⑥ 脚本内 `git checkout` 命中 === 0（禁用 git checkout -- 还原：2026-10-04 事故教训）', () => {
    expect(SCRIPT_SRC.match(/git checkout/g) ?? []).toHaveLength(0)
    expect(SCRIPT_SRC).not.toContain('git checkout')
    // 与之配对：还原必须是"备份 + sha256"，且并发写入要检测（不回写覆盖别人的改动）
    expect(SCRIPT_SRC).toContain('已逐字节还原，sha256 复核一致')
    expect(SCRIPT_SRC).toContain('检测到并发写入')
    expect(SCRIPT_SRC).toContain('sha(abs) === beforeHash')
  })

  it('⑦ 脚本带范围自检与 vitest 守卫（target 不存在即退出 1；被 import 时不跑 main）', () => {
    expect(SCRIPT_SRC).toContain('function missingTargets(')
    expect(SCRIPT_SRC).toContain('[范围自检失败]')
    expect(SCRIPT_SRC).toContain('if (process.env.VITEST === undefined) main()')
    // 组名注册（--group canceled 必须被接受，否则验收命令直接 exit 2）
    expect(SCRIPT_SRC).toContain("'canceled', 'all'")
    // 三种组都从取数表进（避免 filter 串联把别的组的条目混进来）
    expect(SCRIPT_SRC).toContain('const DRILL_GROUPS')
  })
})
