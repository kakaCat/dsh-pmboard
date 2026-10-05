/**
 * 终态需求收手对账（REQ-261004065652-5c1c FR-9 · t4）。
 *
 * ## 病
 *
 * 2026-10-03 实测：三条需求已 `archived`，台账上却仍是 `armed + active + paused` ——
 * "自动意图"与"需求状态"自相矛盾。根因是那批需求被启动迁移成 armed 之后归档，
 * 而**没有任何一条路径**在需求走到终态时把自动意图收回来。
 *
 * ## 药
 *
 * 启动时扫一遍：命中「终态 ∧ armed」→ 应用领域事件 `disarm-terminal`（只改 activation，
 * 不碰 phase / 健康位）+ 一条带 `armed → disarmed` 的迁移留痕。
 *
 * 三条纪律：
 *   ① **只碰终态**——在跑的需求一个字都不动（判据在领域层 `disarm-terminal` 里，本模块不另判一套）；
 *   ② **幂等**——第二次运行零写入（非 armed 直接跳过，不 bump version、不刷评论）；
 *   ③ **可回滚**——留痕里写明 from → to，`scripts/rollback-terminal-reconcile.ts` 据此还原。
 *
 * 这是本需求**唯一**会改写存量数据的一步，故它对证据的要求最高（见 t8 的副本演练）。
 *
 * @module dsh-pmboard/application/internal/reconcile-terminal-dive
 */
import type { RequirementStore } from '../ports.js'
import { transitionDive } from '../../domain/dive/transition.js'
import { isOpenRequirement } from '../../domain/status/Predicates.js'

export interface TerminalReconcileDeps {
  store: RequirementStore
  now: () => number
  logger?: { info: (message: string) => void; warn: (message: string, err?: unknown) => void }
}

export interface TerminalReconcileResult {
  /** 扫过的需求数（含冷侧）。 */
  scanned: number
  /** 实际归一的 requirement id（幂等：第二次运行为空数组）。 */
  reconciled: string[]
  /**
   * **改不动**的（冷侧只读拒写）：`{ id, code }`。
   *
   * 为什么会有这一类（2026-10-04 实测发现，与既有裁定冲突）：归档/完成的需求在存储层是
   * **冷侧只读**——除「归档收口」那一族写之外一律拒（`REQBOARD_COLD_IMMUTABLE`，人工裁定
   * 2026-10-02，`domain/requirement/ColdWrite.ts`）。而"终态却 armed"恰恰**主要**出现在归档侧。
   * 本次**不**推翻那条裁定（改它等于放宽"归档需求不可再写"这条防线），改为：
   *   · 新需求由 `MoveRequirement` 的**预防半边**保证不再产生（走进终态即收手）；
   *   · 存量冷侧这条**如实报出来**（响亮，不静默跳过），由人裁定是否放宽豁免。
   */
  skippedCold: Array<{ id: string; code: string }>
}

/**
 * 扫全册（热 + 冷）找"终态却 armed"的需求并归一。
 *
 * 为什么扫全册而不只扫热侧：归档需求会被搬到冷侧，而"终态却 armed"恰恰**主要**出现在归档侧
 * （实测 three 条都在归档状态）。对账是启动时一次性动作，多读几十条冷记录的代价可接受。
 */
export async function reconcileTerminalDive(deps: TerminalReconcileDeps): Promise<TerminalReconcileResult> {
  const page = await deps.store.listSummaries({ scope: 'all', limit: 1000 })
  const reconciled: string[] = []
  const skippedCold: Array<{ id: string; code: string }> = []
  let scanned = 0

  for (const summary of page.items) {
    scanned += 1
    const record = await deps.store.get(summary.id)
    if (record === undefined) continue
    // 快筛：只对"终态 ∧ armed"继续（其余连 mutate 都不进，保证幂等零写入）。
    if (record.dive?.activation !== 'armed') continue
    if (isOpenRequirement(record)) continue

    const at = deps.now()
    let res: Awaited<ReturnType<typeof deps.store.mutate>> | undefined
    try {
      res = await deps.store.mutate(summary.id, (r) => {
        const changed = transitionDive(r.dive, {
          event: 'disarm-terminal',
          now: at,
          actor: { kind: 'system' },
          status: r.status,
        })
        if (!changed.changed || changed.next === undefined) return undefined
        r.dive = changed.next
        if (changed.comment !== undefined) {
          r.comments.push({
            id: 'c-dive-terminal-' + r.id + '-' + at,
            body: changed.comment.body,
            createdAt: at,
            createdBy: changed.comment.createdBy,
          })
        }
        r.updatedAt = at
        return { changed: true }
      })
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code ?? 'UNKNOWN'
      if (code !== 'REQBOARD_COLD_IMMUTABLE') throw err
      // 冷侧只读：**响亮**记下（不是静默跳过），由人裁定要不要放宽豁免。
      skippedCold.push({ id: summary.id, code })
      deps.logger?.warn('终态收手对账：' + summary.id + ' 在冷侧只读，未能归一（' + code + '）——需人裁定是否放宽 dive 的冷侧写豁免')
      continue
    }

    if (res?.requirement !== undefined) reconciled.push(summary.id)
  }

  if (reconciled.length > 0) {
    deps.logger?.info('终态收手对账：' + reconciled.length + ' 条（' + reconciled.join('、') + '）已 armed → disarmed')
  } else {
    deps.logger?.info('终态收手对账：无需归一（扫描 ' + scanned + ' 条）')
  }
  return { scanned, reconciled, skippedCold }
}
