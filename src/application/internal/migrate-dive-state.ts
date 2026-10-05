/**
 * 存量台账迁移（REQ-261001213924-1441 FR-8 / 数据模型迁移矩阵）——**一次性、幂等、可回滚**。
 *
 * 为什么要迁移：新契约把「人的意图」（activation）和「运行时健康」（driverHealth）分开，旧记录只有 phase。
 * 不迁移的话，旧记录在新读侧走 phase 兼容分支——能跑，但看板/诊断看不到"为什么停"，且 roundsInStage
 * 带着旧语义（生命周期累加）继续参与新判据。
 *
 * 矩阵（逐条来自 design/data-model.md）：
 *  ① disarmed + active      → activation=armed、health=healthy（运行时故障改写人的意图，属误停摆）
 *  ② disarmed + idle        → **一个字都不改**（人主动 clear_pause，人的意图优先）
 *  ③ phase=paused           → activation 不变；health={paused, 原 reason}（终态降级为可恢复）
 *  ④ armed + active         → health=healthy（常态）
 *  ⑤ roundsInStage > 0      → 归零（旧计数是生命周期语义，不归零会与阶段上限打架）
 *  ⑥ 无 dive 字段           → 保守补：disarmed/idle + health=paused(legacy-unknown)，**不猜执行意图**
 *
 * 三条纪律：
 *  · **幂等**：每条记录打 migratedAt 章，已迁移的永不再动（不靠"看起来像没迁过"反推）；
 *  · **留痕**：每条真正改动的记录写一条 comment，人可复核；没改动的只盖章不刷屏；
 *  · **不改人的意图**：除①（误停摆，须恢复）外，activation 一律不写。
 *
 * @module dsh-pmboard/application/internal/migrate-dive-state
 */
import type { RequirementStore } from '../ports.js'
import type { RequirementRecord } from '../../shared/protocol.js'

export interface MigrationDeps {
  /** B12 阶段②c：整册对账走新端口的 `sweep()`（与 repo 并存，删桥时 repo 消失）。 */
  store: RequirementStore
  now: () => number
  logger?: { info: (m: string) => void; warn: (m: string, e?: unknown) => void }
}

export interface MigrationResult {
  /** 扫过的需求数。 */
  scanned: number
  /** 真正改过状态的（有 comment 的）。 */
  migrated: number
  /** 逐条动作，人可读（进诊断日志）。 */
  details: string[]
}

/** 迁移一条记录；返回动作描述（无动作返回 undefined）。纯函数：就地改传入的 record。 */
export function migrateOne(r: RequirementRecord, now: number): string | undefined {
  const d = r.dive as (RequirementRecord['dive'] & { migratedAt?: number }) | undefined
  if (d?.migratedAt !== undefined) return undefined
  const actions: string[] = []
  if (d === undefined) {
    // ⑥ 无 dive：保守补全，不猜执行意图
    r.dive = {
      activation: 'disarmed',
      phase: 'idle',
      roundsInStage: 0,
      driverHealth: { state: 'paused', reason: 'legacy-unknown', since: now, attempts: 0 },
      migratedAt: now,
    } as never
    actions.push('无 dive 字段 → 保守补全（disarmed/idle + health=paused，等人显式恢复）')
    return finish(r, actions, now)
  }
  const disarmedActive = d.activation === 'disarmed' && d.phase === 'active'
  const disarmedIdle = d.activation === 'disarmed' && d.phase === 'idle'
  const paused = d.phase === 'paused'
  if (disarmedActive) {
    d.activation = 'armed'
    d.driverHealth = { state: 'healthy', since: now, attempts: 0 }
    actions.push('误停摆（disarmed+active）→ activation=armed、health=healthy')
  } else if (disarmedIdle) {
    // ② 人的意图优先：一个字都不改（只盖章）
    actions.push('人主动暂停（disarmed+idle）→ 不改（保留人的意图）')
  } else if (paused) {
    d.driverHealth = { state: 'paused', reason: String(d.pausedReason ?? 'legacy-paused'), since: now, attempts: 0 }
    actions.push('终态暂停（phase=paused）→ health=paused（可恢复），activation 不变')
  } else if (r.advance?.pausedReason !== undefined) {
    // [实施链已暂停 => 不置 healthy] 自动链因停滞/失败/人工把 autoRun=false 且 pausedReason 写上；
    // 若这里仍置 healthy，Dive 会重新起轮（起轮判据只看 dive.*，不看 advance）=> 实测的死循环。
    d.driverHealth = { state: 'paused', reason: 'advance-' + r.advance.pausedReason, since: now, attempts: 0 }
    actions.push('常态但实施链已暂停（advance.pausedReason=' + r.advance.pausedReason + '）→ health=paused')
  } else {
    d.driverHealth = { state: 'healthy', since: now, attempts: 0 }
    actions.push('常态（armed+active）→ health=healthy')
  }
  if ((d.roundsInStage ?? 0) > 0) {
    d.roundsInStage = 0
    actions.push('回合计数（旧生命周期语义）→ 归零')
  }
  d.migratedAt = now
  return finish(r, actions, now)
}

/** 写 comment 留痕（只在真的改了状态时）。 */
function finish(r: RequirementRecord, actions: string[], now: number): string {
  const changed = actions.some((a) => !a.includes('不改'))
  if (changed) {
    r.comments.push({
      id: 'c-dive-migrate-' + r.id + '-' + now,
      body: '[Dive 迁移] 存量状态按新契约归一（可复核/可回滚，旧代码忽略新增字段）：' + actions.join('；'),
      createdAt: now,
      createdBy: { kind: 'system' },
    })
    r.version += 1
    r.updatedAt = now
  }
  return changed ? actions.join('；') : '（无状态变更，仅盖章）'
}

/** 启动对账调用：一次 mutate 扫全表，逐条按矩阵迁移。 */
export async function migrateDiveState(deps: MigrationDeps): Promise<MigrationResult> {
  const now = deps.now()
  const details: string[] = []
  let scanned = 0
  // B12 阶段②c：这是**启动对账**（扫全册、逐条盖章）⇒ 映射到新端口的 `sweep()`
  // （端口注释写明"仅启动对账可用"），而不是按 id 的 `mutate`。
  const res = await deps.store.sweep('dive-migrate', (drafts) => {
    const touched: string[] = []
    for (const r of drafts) {
      scanned += 1
      const before = String((r.dive as { migratedAt?: number } | undefined)?.migratedAt)
      const action = migrateOne(r, now)
      if (action === undefined) continue
      if (before === 'undefined') details.push(r.id + ': ' + action)
      // 盖章（migratedAt）本身不算版本变更：sweep 逐条提交时由适配器统一处理全局序
      touched.push(r.id)
    }
    return touched
  })
  const migrated = details.filter((d) => !d.includes('不改')).length
  const out: MigrationResult = { scanned, migrated, details }
  if (details.length > 0) deps.logger?.info('dive 迁移：' + migrated + ' 条记录按新契约归一（共扫 ' + scanned + '）')
  void res
  return out;
}
