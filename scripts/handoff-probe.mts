/**
 * 交接探针（REQ-261004150249-731e FR-1 / FR-2 / FR-6 · t-9f1e88 / design/test-cases.md §用例矩阵探针行）。
 *
 * 【为什么需要它】单测里的 `handoffOwner` / `applyRebind` 都跑在**内存对象**上；
 * 「一次交接真的把两个权威（seats / sourceSessionId）一起改对，并且落盘再读回来还是对的」
 * 只能靠**真跑一遍带持久化的台账**来证。本脚本用**真** `ShardedRequirementStore` +
 * **临时目录**跑完整路径：create → 播显式 seats → mutate(handoffOwner) → get() 复核。
 *
 * 【绝不碰真实台账】数据根 = `mkdtempSync(tmpdir())`，并在动手前**显式校验**它落在系统临时目录下、
 * 且不含 `.dsh`；跑完 `rmSync` 清理。脚本本身不读环境里的任何 DSH 台账路径。
 *
 * 【两条路径都要探，因为「假成功」是本需求的病灶】
 *   P1 交接写（`handoffOwner`）：新窗 owner / 旧窗降 observer / `sourceSessionId` 同步 / 留痕，
 *      且幂等（同入参再跑 → false 且评论数不变）；
 *   P2 看板改绑（`applyRebind`）：改造前它**只改 `sourceSessionId`、席位一个字节不动**——
 *      回执 `rebound:true` 而席位权威判新窗「未绑定」。本探针就是那条「假成功防线」：
 *      显式 seats 的记录经改绑后，席位必须**真的**换到新窗口。
 *
 * 用法：`npx tsx scripts/handoff-probe.mts`
 * 退出码：0 = 全通过；1 = 有断言不成立（逐条点名，不静默跳过）。
 *
 * @module dsh-pmboard/scripts/handoff-probe
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyRebind, handoffOwner } from '../src/application/internal/binding-write.ts'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.ts'
import type { RequirementRecord, WindowSeat } from '../src/shared/protocol.ts'

const AT = 1_796_000_000_000
/** 需求 id 形态：`REQ-<12位时间戳>-<4位hex>`（domain 的 REQUIREMENT_ID_RE）。 */
const REQ_HANDOFF = 'REQ-000000000101-abcd'
const REQ_REBIND = 'REQ-000000000102-abcd'

/** 断言收集器：任一不成立 → 退出码 1，并把每一条**点名**打出来（不合并、不吞掉）。 */
const failures: string[] = []
function check(ok: boolean, message: string): boolean {
  if (!ok) failures.push(message)
  return ok
}

const owners = (r: RequirementRecord): WindowSeat[] => (r.seats ?? []).filter((s) => s.role === 'owner')
const seatOf = (r: RequirementRecord, windowKey: string): WindowSeat | undefined =>
  (r.seats ?? []).find((s) => s.windowKey === windowKey)

/** 临时台账根：必须落在系统临时目录，且路径里不得出现 `.dsh`（防手滑写到真实台账）。 */
function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pm-handoff-probe-'))
  if (!root.startsWith(tmpdir()) || root.includes('.dsh')) {
    throw new Error(`临时台账根不在临时目录（拒绝继续，防止写真实台账）：${root}`)
  }
  return root
}

/** 播一条带**显式 seats** 的开放态需求（owner + 一个旁席 worker）。 */
async function seedSeated(
  store: ShardedRequirementStore,
  id: string,
  from: string,
  mate: string,
): Promise<RequirementRecord> {
  await store.create({ id, title: '交接探针标本', description: 'scripts/handoff-probe.mts', status: 'implementing', sourceSessionId: from }, { kind: 'agent', sessionId: from })
  await store.mutate(id, (draft) => {
    draft.seats = [
      { windowKey: from, role: 'owner', joinedAt: 1_000, lastSeenAt: 1_500 },
      { windowKey: mate, role: 'worker', joinedAt: 1_100 },
    ]
    return { changed: true }
  })
  const seeded = await store.get(id)
  if (seeded === undefined) throw new Error(`播种失败：${id} 写完后读不回来`)
  return seeded
}

/** P1：交接写（FR-2）——五个读数 + 四条断言（含幂等）。 */
async function probeHandoff(store: ShardedRequirementStore): Promise<void> {
  const FROM = 'w-old'
  const MATE = 'w-mate'
  const TO = 'w-new'
  const before = await seedSeated(store, REQ_HANDOFF, FROM, MATE)

  // 真跑交接：与生产同一处写点（HandoffOwner 用例就是在 mutate 里这么调的）。
  let written: boolean | undefined
  const first = await store.mutate(REQ_HANDOFF, (draft) => {
    written = handoffOwner(draft, {
      toWindow: TO,
      actor: { kind: 'agent', sessionId: TO },
      at: AT,
      commentId: () => 'c-handoff-probe-1',
      reason: '探针：上下文水位顶墙，交给新窗口续作',
    })
    return written ? { changed: true } : undefined
  })
  const after = (await store.get(REQ_HANDOFF))!
  const fromSeat = seatOf(before, FROM)

  const from = fromSeat?.windowKey ?? '（无）'
  const oldRole = seatOf(after, FROM)?.role ?? '（退席/缺失）'
  const newRole = seatOf(after, TO)?.role ?? '（无席位）'
  const sourceSession = after.sourceSessionId ?? '（无）'

  console.log('DIAG P1 交接写  from=' + from + ' to=' + TO + ' old_role=' + oldRole
    + ' new_role=' + newRole + ' source_session=' + sourceSession)
  console.log('DIAG P1 台账    changed=' + String(written) + ' store_changed=' + String(first.changed)
    + ' owner_count=' + String(owners(after).length) + ' seat_count=' + String((after.seats ?? []).length)
    + ' comments=' + String(after.comments.length) + ' version=' + String(after.version))

  const only = owners(after)
  check(written === true, 'P1① 交接未生效：handoffOwner 返回 ' + String(written) + '（应为 true）')
  check(only.length === 1, 'P1① owner 不恰好一个：实际 ' + String(only.length) + ' 个（' + only.map((s) => s.windowKey).join(',') + '）')
  check(only[0]?.windowKey === TO, 'P1① 新窗口不是 owner：owner=' + (only[0]?.windowKey ?? '（无）') + '，期望 ' + TO)
  check(newRole === 'owner', 'P1① 新窗口席位角色 ' + newRole + ' != owner')
  // 降级而不是退席：原窗口仍在席位表里，只是变 observer（可见性保留）。
  check(oldRole === 'observer', 'P1② 原窗口未降 observer：实际 ' + oldRole + '（降级不是退席，席位必须还在）')
  check(seatOf(after, FROM) !== undefined, 'P1② 原窗口退席了：seats 里找不到 ' + FROM)
  // 旁席不得被交接牵连。
  check(seatOf(after, MATE)?.role === 'worker', 'P1② 旁席被改动：' + MATE + ' → ' + String(seatOf(after, MATE)?.role))
  // INV-2：席位权威与 sourceSessionId 同指一窗。
  check(only[0] !== undefined && sourceSession === only[0].windowKey,
    'P1③ INV-2 违例：sourceSessionId=' + sourceSession + ' 而 owner=' + (only[0]?.windowKey ?? '（无）'))
  check(sourceSession === TO, 'P1③ sourceSessionId 未同步到新窗口：实际 ' + sourceSession)
  check(after.comments.length === 1, 'P1③ 留痕评论数 ' + String(after.comments.length) + ' != 1')

  // 幂等：**同样入参**再跑一次 → false 且评论数 / 版本一个字节都不动。
  const commentsBefore = after.comments.length
  const versionBefore = after.version
  let second: boolean | undefined
  const secondResult = await store.mutate(REQ_HANDOFF, (draft) => {
    second = handoffOwner(draft, {
      toWindow: TO,
      actor: { kind: 'agent', sessionId: TO },
      at: AT + 1,
      commentId: () => 'c-handoff-probe-2',
      reason: '探针：幂等复跑',
    })
    return second ? { changed: true } : undefined
  })
  const idem = (await store.get(REQ_HANDOFF))!
  console.log('DIAG P1 幂等    second=' + String(second) + ' store_changed=' + String(secondResult.changed)
    + ' comments=' + String(commentsBefore) + '→' + String(idem.comments.length)
    + ' version=' + String(versionBefore) + '→' + String(idem.version))
  check(second === false, 'P1④ 幂等失效：同入参再跑返回 ' + String(second) + '（应为 false）')
  check(secondResult.changed === false, 'P1④ 幂等失效：store 报告仍有变更（changed=true）')
  check(idem.comments.length === commentsBefore, 'P1④ 幂等失效：评论数 ' + String(commentsBefore) + ' → ' + String(idem.comments.length))
  check(idem.version === versionBefore, 'P1④ 幂等失效：版本 ' + String(versionBefore) + ' → ' + String(idem.version))
}

/**
 * P2：看板改绑路径（`applyRebind`）——「假成功防线」。
 *
 * 改造前这条路径只写 `sourceSessionId`：席位表还是 owner=w-old，于是席位权威（seatOf / canWrite）
 * 判新窗口「未绑定」，而 HTTP 回执却是 `rebound:true`。本探针断言**席位真的换过去**：
 * 若实现回退成只改绑定，P2 必红。
 */
async function probeRebind(store: ShardedRequirementStore): Promise<void> {
  const FROM = 'w-old-2'
  const MATE = 'w-mate-2'
  const TO = 'w-new-2'
  await seedSeated(store, REQ_REBIND, FROM, MATE)

  let rebound: boolean | undefined
  const result = await store.mutate(REQ_REBIND, (draft) => {
    rebound = applyRebind(draft, {
      toWindow: TO,
      actor: { kind: 'human' },
      at: AT,
      commentId: () => 'c-rebind-probe-1',
      reason: '探针：看板改绑到本窗口',
    })
    return rebound ? { changed: true } : undefined
  })
  const after = (await store.get(REQ_REBIND))!
  const only = owners(after)

  console.log('DIAG P2 看板改绑 from=' + FROM + ' to=' + TO
    + ' old_role=' + String(seatOf(after, FROM)?.role ?? '（退席/缺失）')
    + ' new_role=' + String(seatOf(after, TO)?.role ?? '（无席位）')
    + ' source_session=' + String(after.sourceSessionId ?? '（无）'))

  check(rebound === true, 'P2 改绑未生效：applyRebind 返回 ' + String(rebound) + '（应为 true）')
  check(result.changed === true, 'P2 改绑未落盘：store 报告 changed=' + String(result.changed))
  check(seatOf(after, TO)?.role === 'owner', 'P2 假成功防线破：改绑后席位里 ' + TO + ' 不是 owner（实际 ' + String(seatOf(after, TO)?.role ?? '（无席位）') + '）——只改了 sourceSessionId、席位没动')
  check(only.length === 1 && only[0]?.windowKey === TO,
    'P2 假成功防线破：owner 集合 = ' + (only.map((s) => s.windowKey).join(',') || '（空）') + '，期望恰好 [' + TO + ']')
  check(seatOf(after, FROM)?.role === 'observer', 'P2 原窗口未降 observer：实际 ' + String(seatOf(after, FROM)?.role ?? '（退席/缺失）'))
  check(after.sourceSessionId === TO, 'P2 sourceSessionId 未同步：实际 ' + String(after.sourceSessionId ?? '（无）'))
  check(after.sourceSessionId === only[0]?.windowKey, 'P2 INV-2 违例：sourceSessionId=' + String(after.sourceSessionId) + ' 而 owner=' + String(only[0]?.windowKey ?? '（无）'))
  check(after.comments.length === 1, 'P2 留痕评论数 ' + String(after.comments.length) + ' != 1')
}

async function main(): Promise<void> {
  const root = makeTempRoot()
  console.log('LEDGER（临时台账，非真实 ~/.dsh/reqboard）：' + root)
  const store = new ShardedRequirementStore({ root, now: () => AT, onWarn: (m) => console.warn('[store] ' + m) })
  try {
    await probeHandoff(store)
    await probeRebind(store)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('\nPROBE FAIL（' + String(failures.length) + ' 条）')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\n✅ 交接探针通过')
}

await main()
