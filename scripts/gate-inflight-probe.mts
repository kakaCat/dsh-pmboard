#!/usr/bin/env node
/**
 * 「同门唯一在途」探针（REQ-261006164732-6503 t10 · serves: FR-1, FR-2）。
 *
 * ## 为什么是**模型级**探针（而不是读活宿主）
 *
 * 门（挂起确认）是**进程内**结构（`PendingConfirmRegistry`：内存 Map）。跨进程脚本**不可能**读到
 * 另一个进程里正在等的门——这不是偷懒，是构造事实。所以本探针的做法是：用真注册表 + 真
 * `requestGate`（建门唯一入口，不另写一份判定）跑一遍开门的真实时序，把「当前在等的门」列出来
 * 并逐条断言不变量。谁要看**活宿主**的门，走 `reqboard_status` / 看板「待确认」（同一份投影）。
 *
 * ## 断言
 *
 *   A1 同门第二次请求 ⇒ `mode='reused'` 且返回**同一张票**（不新开框、不新增记录）
 *   A2 同一道门「未作答」计数 ≤ 1（不变量 I1）
 *   A3 同一窗口「未作答」门总数 ≤ 1（异门陈旧票在开新门时被清理）
 *
 * 用法：`npx tsx scripts/gate-inflight-probe.mts`
 * 退出码：0 = 三条断言全过；1 = 有断言不过（打印每条的实测值）。
 */
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { requestGate, type GateRequestInput } from '../src/application/internal/gate-request.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-gate-probe'
const REQ = 'REQ-gateprobe'

/** 本探针只触达 requestGate 用到的那几个读点：`get` + `listSummaries`（其余不装配）。 */
function makeDeps(): UseCaseDeps {
  const rec = {
    id: REQ, title: '探针需求', description: '', status: 'decomposing', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: [{ stage: 'design', kind: 'design', path: 'docs/requirements/' + REQ + '/design/architecture.md', registeredAt: 1 }],
    plan: { path: 'docs/requirements/' + REQ + '/decomposition.md', summary: 'x', tasks: [], submittedAt: 1 },
  } as unknown as RequirementRecord
  const summary = { id: REQ, status: 'decomposing', sourceSessionId: W, seats: [{ windowKey: W, role: 'owner', joinedAt: 0 }] }
  const store = {
    get: async (id: string) => (id === REQ ? JSON.parse(JSON.stringify(rec)) : undefined),
    listSummaries: async () => ({ items: [summary], total: 1 }),
  } as unknown as UseCaseDeps['store']
  let now = 1_000_000
  return {
    store,
    clock: { now: () => now++ },
    session: { windowKey: () => W, requireLiveDriver: () => { /* 探针无活窗口概念 */ } },
    pendingConfirms: new PendingConfirmRegistry({ now: () => 1_000_000, newTicket: (() => { let n = 0; return () => 'pc-' + String(++n).padStart(6, '0') })() }),
  } as unknown as UseCaseDeps
}

const PLAN: GateRequestInput = { requirementId: REQ, target: 'plan', kind: 'decomposition', question: '拆分计划已提交，请批准' }
const DESIGN: GateRequestInput = { requirementId: REQ, target: 'artifact', kind: 'design', question: '设计文档已提交，请确认' }

async function main(): Promise<number> {
  const deps = makeDeps()
  const exec = { agent: { id: W } }
  const port = deps.pendingConfirms!

  const first = await requestGate(deps, PLAN, exec)
  const second = await requestGate(deps, PLAN, exec)
  const openAfterReuse = port.findOpen({ requirementId: REQ, target: 'plan' })
  const designOpened = await requestGate(deps, DESIGN, exec)
  const planAfterOtherGate = port.findOpen({ requirementId: REQ, target: 'plan' })
  const designOpen = port.findOpen({ requirementId: REQ, target: 'artifact', kind: 'design' })

  const doors = [
    { 门: 'plan(第一次请求)', 结果: first.mode, ref: 'ticket' in first ? first.ticket : '—', createdAt: 'ticket' in first ? port.get(first.ticket, W)?.createdAt : undefined },
    { 门: 'plan(第二次请求)', 结果: second.mode, ref: 'ticket' in second ? second.ticket : '—', createdAt: 'ticket' in second ? port.get(second.ticket, W)?.createdAt : undefined },
    { 门: 'design(异门)', 结果: designOpened.mode, ref: 'ticket' in designOpened ? designOpened.ticket : '—', createdAt: 'ticket' in designOpened ? port.get(designOpened.ticket, W)?.createdAt : undefined },
  ]

  console.log('=== 当前在等的门（模型级：真 registry + 真 requestGate）===')
  for (const d of doors) {
    console.log(`  ${d.门.padEnd(18)} 结果=${d.结果.padEnd(14)} ref=${d.ref}  createdAt=${String(d.createdAt)}  谁能答=会话弹框 / 看板（有门且在册）`)
  }
  // 注意：这里打印的是**最终**状态——开 design 门时，plan 门作为「异门陈旧票」被清理
  console.log('  最终未作答门清单：' + ([
    planAfterOtherGate !== undefined ? `plan:${planAfterOtherGate.ticket}` : null,
    designOpen !== undefined ? `design:${designOpen.ticket}` : null,
  ].filter(Boolean).join(' , ') || '（无）')
    + (planAfterOtherGate === undefined ? '  ← plan 门已被异门清理（settle，防窗口被钉死）' : ''))

  const problems: string[] = []
  const sameTicket = first.mode === 'opened' && second.mode === 'reused' && second.ticket === first.ticket
  if (!sameTicket) problems.push(`A1 同门第二次请求应为 reused 且同一张票，实测 first=${first.mode} second=${second.mode}`)
  // A2 要证的是"复用后等在门外的那道门**还是原来那道**，没有被顶掉，也没有多出一道
  if (openAfterReuse?.ticket !== (first.mode === 'opened' ? first.ticket : undefined)) {
    problems.push(`A2 复用后 findOpen 应命中第一次那张票，实测 ${String(openAfterReuse?.ticket)}`)
  }
  const openTotal = [planAfterOtherGate, designOpen].filter(x => x !== undefined).length
  if (openTotal > 1) problems.push(`A3 同窗口未作答门总数应为 ≤1，实测 ${openTotal}（异门清理未生效？）`)

  if (problems.length === 0) {
    console.log('PROBE PASS：A1 复用同一张票 / A2 同门唯一在途 / A3 异门清理后窗口只留一道门')
    return 0
  }
  console.log('PROBE FAIL：')
  for (const p of problems) console.log('  - ' + p)
  return 1
}

main().then(code => process.exit(code)).catch(err => {
  console.error('探针异常（响亮失败，不静默跳过）：', err)
  process.exit(2)
})
