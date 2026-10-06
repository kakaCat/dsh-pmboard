/**
 * 现场复演：REQ-261005105032-3b02「回退后重新落库」缺陷的复位剧本（REQ-261005122915-9f90 t7 / FR-1, FR-5）。
 *
 * ## 它回答什么
 *
 * 现场是：需求 `implementing`、已批准 **23 卡**计划、队列里却只有 **13 张回退占位卡**（0 张新卡）。
 * 本脚本读**真实台账与队列**，把三件事摊开：
 *   ① 现状读数（状态 / 回退序号 / 已批准卡数 / 活卡里真卡与占位卡各几张）；
 *   ② 清场边界（`rollback.lastMaterialized`）与清场后会剩什么；
 *   ③ 复演后的**预期活卡集**（逐 key 对齐已批准的计划）。
 *
 * ## 为什么不直接替人执行
 *
 * 清场是设计上的**仅人**动作（服务端刻意不注册 agent 工具，见 REQ-261004121649-bfa7 设计）；
 * 落库需要**在线的绑定窗口**。故本脚本默认 **dry-run**：只读、只打印，附上可直接复制执行的
 * 两条看板请求。要真执行请显式加 `--apply` **并由人决定**。
 *
 * 用法：
 *   node --import tsx/esm scripts/rollback-landing-replay.mts                    # dry-run（默认）
 *   node --import tsx/esm scripts/rollback-landing-replay.mts --apply            # 真执行（人决定）
 *   node --import tsx/esm scripts/rollback-landing-replay.mts --req=REQ-xxxxxx   # 换需求
 *
 * @module dsh-pmboard/scripts/rollback-landing-replay
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const reqId = (argv.find((a) => a.startsWith('--req='))?.slice('--req='.length)) ?? 'REQ-261005105032-3b02'
const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:19387'

interface QueueTask { id: string; title: string; status: string; reworkOf?: string; parentId?: string }
interface RollbackMark { from?: string; to?: string; seq?: number; lastMaterialized?: string[] }

const isPlaceholder = (t: QueueTask): boolean => (t.reworkOf ?? '') !== ''
const liveReal = (tasks: QueueTask[]): QueueTask[] => tasks.filter((t) => t.status !== 'canceled' && !isPlaceholder(t))

const queuePath = join(root, 'docs/requirements', reqId, 'queue.json')
const recordPath = join(homedir(), '.dsh/reqboard/requirements', reqId, 'record.json')
const planPath = join(homedir(), '.dsh/reqboard/requirements', reqId, 'plan.json')

const queueRaw = JSON.parse(readFileSync(queuePath, 'utf8')) as { tasks?: QueueTask[] }
const tasks: QueueTask[] = queueRaw.tasks ?? []
const record = JSON.parse(readFileSync(recordPath, 'utf8')) as { status?: string; rollback?: RollbackMark }
const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { tasks?: { key: string; title: string }[]; approvedAt?: number }
const planTasks = plan.tasks ?? []
const mark = record.rollback
const seq = typeof mark?.seq === 'number' && mark.seq > 0 ? mark.seq : 1

const placeholders = tasks.filter((t) => t.status !== 'canceled' && isPlaceholder(t))
const real = liveReal(tasks)
const materialized = mark?.lastMaterialized ?? []

console.log(`# 现场读数 ${reqId}`)
console.log(`  需求状态        : ${record.status ?? '(未知)'}`)
console.log(`  回退记录        : ${mark === undefined ? '（无）' : `第 ${seq} 次 ${mark.from} → ${mark.to}`}`)
console.log(`  已批准计划      : ${planTasks.length} 张（approvedAt=${plan.approvedAt === undefined ? '无' : '有'}）`)
console.log(`  队列卡总数      : ${tasks.length}（canceled ${tasks.filter((t) => t.status === 'canceled').length}）`)
console.log(`  活卡·真卡       : ${real.length}`)
console.log(`  活卡·占位重做卡 : ${placeholders.length}`)
console.log(`  清场边界        : lastMaterialized ${materialized.length} 条`)
console.log('')
console.log(`# 清场后预期`)
console.log(`  占位卡 ${placeholders.length} 张 → canceled；真卡不动（${real.length} 张）`)
console.log('')
console.log(`# 复演后预期活卡集（= 已批准计划的 ${planTasks.length} 个 key）`)
console.log('  ' + planTasks.map((t) => t.key).join(', '))
const missing = planTasks.length - real.length
console.log(`  与现状真卡的差：${missing > 0 ? `缺 ${missing} 张（正是本缺陷：新计划未落库）` : '已对齐'}`)
console.log('')

if (!apply) {
  console.log('# 下一步（默认 dry-run，未改动任何数据）')
  console.log('  ① 人点清场（或让脚本带 --apply；清场是设计上的「仅人」动作）：')
  console.log(`     curl -s -X POST ${base}/dashboard/api/reqboard/req/rollback-cleanup \\`)
  console.log(`       -H 'content-type: application/json' \\`)
  console.log(`       -d '{"id":"${reqId}","rollbackSeq":${seq},"reason":"现场复位：清理误物化重做卡"}'`)
  console.log('  ② 由**在线的绑定窗口**落库（看板拆分入口 / reqboard_decompose）：')
  console.log(`     curl -s -X POST ${base}/dashboard/api/reqboard/req/decompose \\`)
  console.log(`       -H 'content-type: application/json' -d '{"id":"${reqId}"}'`)
  console.log('  ③ 重跑本脚本核对：活卡·真卡应等于已批准计划张数、占位卡为 0。')
  process.exit(0)
}

const post = async (path: string, body: unknown): Promise<unknown> => {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return await res.json()
}

const cleanup = await post('/dashboard/api/reqboard/req/rollback-cleanup', {
  id: reqId, rollbackSeq: seq, reason: '现场复位：清理误物化重做卡',
})
console.log('# 清场回执')
console.log(JSON.stringify(cleanup, null, 2))
const landing = await post('/dashboard/api/reqboard/req/decompose', { id: reqId })
console.log('# 落库回执')
console.log(JSON.stringify(landing, null, 2))
