/**
 * 终态收手对账的**副本演练**（REQ-261004065652-5c1c t8 / FR-9）。
 *
 * ## 这个脚本回答什么问题
 *
 * 「启动时的终态收手对账，会不会动到我的真台账？」——用**真台账的副本**跑一遍，
 * 前后逐文件 sha256 对比，把"改没改"变成可复核的字节事实，而不是"应该没改"。
 *
 * ## 为什么不是"对账改写 → 反向脚本还原"
 *
 * 计划里原本写的是「对账改写 3 条 → 反向脚本还原 → sha256 一致」。实施时（t4）实测发现：
 * 存储层把 `done`/`archived` 判为**冷侧只读**（`REQBOARD_COLD_IMMUTABLE`，唯一例外是"归档收口"那一族），
 * 而对账要改的正是终态记录 ⇒ **对账根本写不进去**。既然如此，"反向还原"就没有对象，
 * 写一个没人会走到的回滚脚本只会变成死代码。
 *
 * 于是本脚本把验收口径改成**更强的一种**：不是"改完能还原"，而是"**一个字节都不改**"，
 * 并且把改不动的那几条**逐条点名**（它们仍然挂在 `armed` 上，由人决定要不要放宽豁免 —— 见 decisions.md D-5）。
 *
 * 跑法：
 *   npx tsx scripts/reconcile-terminal-drill.mts                 # 默认真台账 ~/.dsh/reqboard
 *   npx tsx scripts/reconcile-terminal-drill.mts --src /path/to/reqboard
 *   npx tsx scripts/reconcile-terminal-drill.mts --json          # 机器可读
 *
 * 退出码：0 = 零改写（预期）；1 = 台账被改动了（响亮失败，别当没事）。
 *
 * @module dsh-pmboard/scripts/reconcile-terminal-drill
 */
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { reconcileTerminalDive } from '../src/application/internal/reconcile-terminal-dive.js'

interface Row {
  id: string
  status: string
  activation: string
  driverHealth: string
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  return i < 0 ? undefined : process.argv[i + 1]
}

/** 逐文件 sha256（跳过 rmdir 之类；键为相对路径）。 */
function hashTree(root: string, base = '', acc: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(join(root, base))) {
    const rel = base.length === 0 ? name : base + '/' + name
    const abs = join(root, rel)
    if (statSync(abs).isDirectory()) hashTree(root, rel, acc)
    else acc[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex')
  }
  return acc
}

async function main(): Promise<void> {
  const src = arg('src') ?? join(homedir(), '.dsh', 'reqboard')
  const asJson = process.argv.includes('--json')

  const work = mkdtempSync(join(tmpdir(), 'pmboard-reconcile-drill-'))
  const copy = join(work, 'reqboard')
  try {
    cpSync(src, copy, { recursive: true })
    const before = hashTree(copy)

    const store = new ShardedRequirementStore({ root: copy, onWarn: () => { /* 演练不关心告警 */ } })
    const lines: string[] = []
    const result = await reconcileTerminalDive({
      store,
      now: () => Date.now(),
      logger: {
        info: (m) => lines.push('[info] ' + m),
        warn: (m) => lines.push('[warn] ' + m),
      },
    })

    const after = hashTree(copy)
    const changed = Object.keys(before).filter((p) => before[p] !== after[p])
    const added = Object.keys(after).filter((p) => before[p] === undefined)
    const removed = Object.keys(before).filter((p) => after[p] === undefined)

    // 采样：把"终态却 armed"的几条读出来（人要看的就是这几条）
    const rows: Row[] = []
    for (const s of (await store.listSummaries({ scope: 'all', limit: 1000 })).items) {
      const rec = await store.get(s.id)
      if (rec?.dive?.activation !== 'armed') continue
      if (rec.status !== 'done' && rec.status !== 'archived' && rec.status !== 'canceled') continue
      rows.push({
        id: rec.id,
        status: rec.status,
        activation: rec.dive.activation,
        driverHealth: rec.dive.driverHealth?.reason ?? '-',
      })
    }

    if (asJson) {
      console.log(JSON.stringify({ src, scanned: result.scanned, reconciled: result.reconciled, skippedCold: result.skippedCold, rows, changed, added, removed }, null, 2))
    } else {
      console.log('== 终态收手对账 · 副本演练 ==')
      console.log('源台账 : ' + src)
      console.log('工作副本: ' + copy)
      console.log('扫描条数: ' + result.scanned)
      console.log('已归一  : ' + (result.reconciled.length === 0 ? '（无）' : result.reconciled.join('、')))
      console.log('冷侧写不动（逐条点名）: ' + (result.skippedCold.length === 0 ? '（无）' : result.skippedCold.map((x) => x.id + '(' + x.code + ')').join('、')))
      console.log('仍 armed 的终态记录: ' + (rows.length === 0 ? '（无）' : rows.map((r) => r.id + '[' + r.status + ']').join('、')))
      console.log('')
      console.log('== 逐文件 sha256 对比 ==')
      console.log('改动文件: ' + (changed.length === 0 ? '（零改写）' : changed.join('、')))
      console.log('新增文件: ' + (added.length === 0 ? '（无）' : added.join('、')))
      console.log('删除文件: ' + (removed.length === 0 ? '（无）' : removed.join('、')))
      console.log('')
      for (const l of lines) console.log(l)
    }

    const dirty = changed.length > 0 || added.length > 0 || removed.length > 0
    if (dirty) {
      console.error('[失败] 对账改动了台账副本 —— 与本需求的「零改写」判据不符，必须查清。')
      process.exitCode = 1
    } else if (!asJson) {
      console.log('\n[通过] 对账对台账副本零改写（逐文件 sha256 全同）；写不动的那几条已逐条点名。')
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

await main()
