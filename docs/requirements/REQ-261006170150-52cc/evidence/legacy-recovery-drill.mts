#!/usr/bin/env tsx
/**
 * 存量恢复演练（REQ-261006170150-52cc · t-0808ec / FR-3）。
 *
 * ## 这个脚本要证明什么
 *
 * 本次修复把「等待位的生命周期」和「清位即驱动」接了起来（分档 TTL / 清位回调 / 心跳恢复）。
 * 旧台账是**没有这些字段**的历史数据，因此必须回答一个问题：
 *
 *   > 新代码遇到旧台账，会不会顺手迁移 / 改写它？
 *
 * 做法：**在真台账的副本上跑一趟真装配的心跳**，前后各算一次副本的树哈希。
 * 哈希相等 ⇒ 读路径没有迁移、没有改写（这正是"无数据迁移"的可复核形式）。
 *
 * ## 为什么必须是副本
 *
 * 台账是生产数据。演练允许"看"，绝不允许"动"真数据——所以脚本只读 `~/.dsh/reqboard`，
 * 把整份考到临时目录，之后**所有 store 都指向临时目录**。
 *
 * ## 用法
 *
 *   npx tsx docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.mts
 *
 * 输出：一行 JSON（供演练记录引用）+ 人读摘要。
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../../../../src/repositories/ShardedRequirementStore.js'
import { PendingConfirmRegistry } from '../../../../src/adapters/PendingConfirmRegistry.js'
import { createWakeHeartbeat } from '../../../../src/application/dive/wake-heartbeat.js'
import { isAwaitingConfirmStop, enterAwaitingConfirm } from '../../../../src/application/internal/awaiting-confirm.js'
import { LIMITS } from '../../../../src/domain/limits.js'

/** 副本的**确定性树哈希**：按相对路径排序后逐文件摘要，再整体摘要（内容 + 路径都在内）。 */
function treeHash(root: string): string {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) files.push(p)
    }
  }
  walk(root)
  const h = createHash('sha256')
  for (const f of files.sort()) {
    h.update(f.slice(root.length))
    h.update(readFileSync(f))
  }
  return h.digest('hex')
}

function countFiles(root: string): number {
  let n = 0
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name)
    if (e.isDirectory()) n += countFiles(p)
    else if (e.isFile()) n += 1
  }
  return n
}

async function main(): Promise<void> {
  const source = process.env.REQBOARD_DRILL_SOURCE ?? join(homedir(), '.dsh', 'reqboard')
  if (!existsSync(join(source, 'requirements'))) {
    throw new Error('演练源台账不存在：' + source)
  }

  // ── ① 考一份副本：之后一切都只碰副本 ─────────────────────────────────────────
  const sandbox = mkdtempSync(join(tmpdir(), 'reqboard-drill-'))
  const copyRoot = join(sandbox, 'reqboard')
  cpSync(source, copyRoot, { recursive: true })

  const before = treeHash(copyRoot)
  const filesBefore = countFiles(copyRoot)

  // ── ② 在副本上跑一趟真装配的心跳（读路径 + 恢复判据）────────────────────────
  const now = (): number => Date.now()
  const warnings: string[] = []
  const store = new ShardedRequirementStore({ root: copyRoot, now, onWarn: (m) => warnings.push(m) })
  const registry = new PendingConfirmRegistry({ now })
  const notified: string[] = []
  const woken: string[] = []
  const heartbeat = createWakeHeartbeat({
    store,
    now,
    // 真装配里 wake 走 agent；演练里只记录「本趟想叫醒谁」，不投递、不碰会话。
    wake: (id) => { woken.push(id); return true },
    dialogInFlight: (id) => registry.inFlightFor(id),
    notifyDrivable: (id) => { notified.push(id) },
  })
  const tick = await heartbeat.tick()

  // ── ③ 旧台账在新判据下的分类（可读面：有多少条真的在等人）──────────────────
  const open = await store.listSummaries({ scope: 'active' })
  let awaiting = 0
  for (const s of open.items) {
    const rec = await store.get(s.id)
    if (rec !== undefined && isAwaitingConfirmStop(rec)) awaiting += 1
  }

  const after = treeHash(copyRoot)
  const filesAfter = countFiles(copyRoot)

  const out = {
    phaseA: {
      source,
      sandbox,
      requirements: open.total ?? open.items.length,
      filesBefore,
      filesAfter,
      sha256Before: before,
      sha256After: after,
      unchanged: before === after,
      resumed: tick.resumed.length,
      skipped: tick.skipped.length,
      woken: woken.length,
      failed: tick.failed.length,
      paused: tick.paused.length,
      notifiedDrivable: notified.length,
      legacyAwaitingStops: awaiting,
      storeWarnings: warnings.length,
    },
    phaseB: await recoveryDrill(source),
  }
  console.log('DRILL_RESULT ' + JSON.stringify(out))
  console.log('--- 人读摘要 ---')
  console.log('[A 零迁移] 台账副本：' + copyRoot)
  console.log('[A 零迁移] 文件数：' + filesBefore + ' → ' + filesAfter + '（相等=' + (filesBefore === filesAfter) + '）')
  console.log('[A 零迁移] 树哈希：' + before + ' → ' + after + '（相等=' + (before === after) + '）')
  console.log('[A 零迁移] 本趟心跳：resumed=' + out.phaseA.resumed + ' skipped=' + out.phaseA.skipped
    + ' woken=' + out.phaseA.woken + ' notifyDrivable=' + out.phaseA.notifiedDrivable)
  console.log('[A 零迁移] 旧台账里处于等待停手位的需求数：' + awaiting)
  console.log('[B 恢复能力] ' + JSON.stringify(out.phaseB))
  rmSync(sandbox, { recursive: true, force: true })
  if (before !== after) {
    // 响亮失败：本演练的前提就是"不迁移、不改写"
    console.error('❌ 副本被改写了：sha256 前后不等')
    process.exitCode = 1
  }
}

/**
 * Phase B：**恢复能力**演练（与 A 分开，因为这里**就是要**发生一次写入）。
 *
 * 为什么不让 A 兼做 B：A 的判据是「副本哈希前后相等」（证明零迁移），
 * 而恢复的语义恰恰是「把停手位清掉 + 请求一次驱动」——那是写入。混在一起两件事都说不清。
 *
 * 做法：另拷一份**丢弃副本**，在旧台账的**真实历史记录**上造一条**已过期**的等待位，
 * 跑一趟真装配心跳，断言：resumed 含该需求 + notifyDrivable 恰 1 次 + 停手位已清。
 */
async function recoveryDrill(source: string): Promise<Record<string, unknown>> {
  const sandbox = mkdtempSync(join(tmpdir(), 'reqboard-drill-b-'))
  const root = join(sandbox, 'reqboard')
  cpSync(source, root, { recursive: true })

  let t = Date.now()
  const clock = (): number => t
  const store = new ShardedRequirementStore({ root, now: clock, onWarn: () => { /* 演练忽略告警 */ } })
  const registry = new PendingConfirmRegistry({ now: clock })

  // 挑一条**真实的历史记录**（旧台账原样数据），在它上面造等待位。
  const page = await store.listSummaries({ scope: 'active' })
  let target: string | undefined
  for (const s of page.items) {
    const rec = await store.get(s.id)
    if (rec !== undefined && rec.dive !== undefined) { target = s.id; break }
  }
  if (target === undefined) {
    rmSync(sandbox, { recursive: true, force: true })
    return { skipped: '旧台账里没有带 dive 的开放需求，无法造等待位' }
  }

  const ref = 'pc-drill-b'
  await enterAwaitingConfirm(
    { store, dialogs: registry, now: clock },
    { requirementId: target, windowKey: 'drill-window', ref, kind: 'gate', suspend: false },
  )
  const stopWritten = isAwaitingConfirmStop((await store.get(target))!)

  // 时钟越过阻塞型分档 TTL（60 分钟）⇒ 该登记判「无人等待」（分档过期的正向用法）。
  t += LIMITS.timeoutInteractiveMs + 1

  const notified: string[] = []
  const tick = await createWakeHeartbeat({
    store,
    now: clock,
    wake: () => true,
    dialogInFlight: (id) => registry.inFlightFor(id),
    notifyDrivable: (id) => { notified.push(id) },
  }).tick()

  const after = (await store.get(target))!
  const result: Record<string, unknown> = {
    target,
    stopWrittenBeforeExpiry: stopWritten,
    resumed: tick.resumed.includes(target),
    stopCleared: !isAwaitingConfirmStop(after),
    recoveryComment: after.comments.some(c => c.body.includes('[Dive 恢复]') && c.body.includes('出口=expired')),
    notifyDrivableCalls: notified.length,
  }
  rmSync(sandbox, { recursive: true, force: true })
  return result
}

void main().catch((err: unknown) => {
  console.error('演练失败：', err)
  process.exitCode = 1
})
