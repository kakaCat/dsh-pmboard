/**
 * verify / dialogue 两端点真 HTTP 冒烟（REQ-261006130057-7a43 · t-e2d5ef 联调）。
 *
 * 做法：内存台账 + 真实 RTM YAML 落盘 + 真查询（queryVerify / queryDialogue 不替换）
 * + createReqboardHandler 包 node http 服务器，curl 打两次看字段。
 * 用法：npx tsx docs/requirements/REQ-261006130057-7a43/evidence/verify-dialogue-smoke.mts
 *       （打印 PORT=<port> 后常驻；另开终端 curl，完事 Ctrl-C）
 */
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../../../../src/http/routes.js'
import { queryVerify } from '../../../../src/application/query/QueryVerify.js'
import { queryDialogue, type DialogueSessionEventsPort } from '../../../../src/application/query/QueryDialogue.js'
import type { PanelQueries, PanelQueryDeps } from '../../../../src/application/query/contracts.js'
import type { RequirementRecord, VerificationSheet } from '../../../../src/shared/protocol.js'
import { FakeSession, makeHarness, req } from '../../../../tests/application/harness.js'
import { taskStoreAt } from '../../../../tests/queue/route-deps.js'

const REQ_ID = 'REQ-261006130057-7a43'
const WINDOW_A = 'session-window-a'

function sheetV2(): VerificationSheet {
  return {
    version: 2,
    generatedAt: 200,
    generatedBy: { kind: 'agent' },
    items: [
      { id: 'v2-1', source: { kind: 'task', taskId: 't-aaa' }, criterion: 'npx vitest run tests/x 全绿', evidence: [], status: 'pending' },
      { id: 'v2-2', source: { kind: 'requirement' }, criterion: '需求条款逐条有落点', evidence: [], status: 'unverified' },
      { id: 'v2-3', source: { kind: 'task', taskId: 't-bbb' }, criterion: 'tsc 零错', evidence: ['tsc 输出'], status: 'passed', result: 'exit 0', resultSource: 'agent' },
    ],
  }
}
function sheetV1(): VerificationSheet {
  return {
    version: 1,
    generatedAt: 100,
    generatedBy: { kind: 'agent' },
    items: [
      { id: 'v1-1', source: { kind: 'task', taskId: 't-aaa' }, criterion: '初版标准', evidence: [], status: 'failed', opinion: '缺冒烟输出' },
    ],
  }
}

function verifyReq(): RequirementRecord {
  return req({
    id: REQ_ID,
    status: 'accepting',
    sourceSessionId: WINDOW_A,
    seats: [{ windowKey: WINDOW_A, role: 'owner', joinedAt: 10 }],
    verification: {
      summary: '交付完成：verify 端点 + 对话游标',
      evidence: ['npx vitest run tests/query-verify 全绿', 'pnpm exec tsc --noEmit 零错'],
      submittedAt: 300,
      submittedBy: { kind: 'agent' },
      sheet: sheetV2(),
      sheetHistory: [sheetV1()],
    },
  } as Partial<RequirementRecord>)
}

function seedRtm(root: string): void {
  const dir = join(root, 'docs', 'requirements', REQ_ID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'rtm-design.yml'), 'metadata:\n  stage: design\ntraceability:\n  fr_to_design:\n    FR-1: [§1]\n    FR-2: [§2]\n')
  writeFileSync(join(dir, 'rtm-decomposing.yml'), 'metadata:\n  stage: decomposing\ntraceability:\n  fr_to_tasks:\n    FR-1: [t-aaa]\n    FR-3: [t-bbb]\n')
  writeFileSync(join(dir, 'rtm-accepting.yml'), [
    'metadata:', '  stage: accepting', 'traceability:', '  fr_to_tests:', '    FR-1: [TC-1]',
    'acceptance_tracking:',
    '  - acceptance_id: v2-1', '    fr_id: t-aaa', '    status: pending',
    '  - acceptance_id: v2-2', '    fr_id: REQ-LEVEL', '    status: unverified',
    '  - acceptance_id: v2-3', '    fr_id: t-bbb', '    status: passed', '    judged_at: 400', '',
  ].join('\n'))
}

class FakeDialogueSession extends FakeSession implements DialogueSessionEventsPort {
  constructor(private readonly events: Map<string, readonly unknown[] | undefined>) { super() }
  snapshotEvents(key: string): readonly unknown[] | undefined { return this.events.get(key) }
  async readEvents(key: string): Promise<readonly unknown[] | undefined> { return this.events.get(key) }
}

const events = [
  { type: 'user/message', seq: 1, time: 1000, data: { id: 'u-1', role: 'user', content: [{ type: 'text', text: '先对一下口径' }], source: { kind: 'user' } } },
  { type: 'assistant/message', seq: 2, time: 2000, data: { id: 'a-2', role: 'assistant', content: [{ type: 'text', text: '收到，按设计落' }] } },
  { type: 'user/message', seq: 3, time: 3000, data: { id: 'u-3', role: 'user', content: [{ type: 'text', text: '第二条人类消息' }], source: { kind: 'user' } } },
]

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-smoke-'))
  seedRtm(root)
  const h = makeHarness({ requirements: [verifyReq()] })
  const sessions = new FakeDialogueSession(new Map([[WINDOW_A, events]]))
  const deps: PanelQueryDeps = {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions,
    now: () => h.clock.t,
    workspaceRoot: root,
  } as PanelQueryDeps
  const stub = (payload: unknown) => (async () => payload) as never
  const queries: PanelQueries = {
    report: stub({ verdictLine: '在跑实施' }),
    trunk: stub({ items: [] }),
    docs: stub({ documents: [] }),
    dag: stub({ tasks: [], steps: [] }),
    prompts: stub({ system: {}, injections: [], context: {} }),
    token: stub({ byStage: [], optimizations: [], availability: 'full' }),
    dialogue: (d: PanelQueryDeps, i: unknown) => queryDialogue(d, i as never),
    verify: (d: PanelQueryDeps, i: unknown) => queryVerify(d, i as never),
  }
  const handler = createReqboardHandler({
    requirementStore: h.store as never,
    taskStore: taskStoreAt(root),
    now: () => h.clock.t,
    injectionLog: { readAll: async () => [] } as never,
    sessionProbe: sessions as never,
    panelQueries: { ...queries, dialogue: (dd: unknown, ii: unknown) => queryDialogue(deps, ii as never), verify: (dd: unknown, ii: unknown) => queryVerify(deps, ii as never) } as never,
    workspaceRoot: root,
  } as never)
  const server = createServer((rq, rs) => { void handler(rq, rs) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0
  console.log('PORT=' + String(port))
  console.log('curl -s http://127.0.0.1:' + String(port) + '/dashboard/api/reqboard/requirements/' + REQ_ID + '/verify')
  console.log('curl -s "http://127.0.0.1:' + String(port) + '/dashboard/api/reqboard/requirements/' + REQ_ID + '/dialogue?before=2500&limit=1"')
  setInterval(() => undefined, 60_000)
}

void main()
