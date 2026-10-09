/**
 * H2-role 回归测试（REQ-261007193530-3133 t2 / serves: FR-2）。
 *
 * 病灶：`handleTaskMove` 调 `transitionTask` 不传 role → 缺省 legacy → 看板（HTTP 面）
 * 可把子卡推进 integrating/testing/in_review——这三个状态在 SUBTASK_TRANSITIONS 里
 * **无出边**，落进去即卡死。修法：按 `roleOfTask` 派生角色（与工具面 MoveTask 同口径）。
 *
 * 本文件走真实 HTTP 处理器（`createReqboardHandler` + 队列存储），因为病灶就在**路由层**：
 * 只测 `transitionTask` 本身测不出「路由忘了传 role」这个缺口。
 */
import { makeTestStore, req, task } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { createReqboardHandler } from '../src/http/routes.js'
import type { TaskRecord } from '../src/shared/protocol.js'

const REQ = 'REQ-h2role'
let dir: string
let store: ReturnType<typeof makeTestStore>
let taskStore: QueueTaskStore
let handler: ReturnType<typeof createReqboardHandler>

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-h2role-'))
  store = makeTestStore()
  await store.replaceAll('seed', {
    schemaVersion: 9,
    revision: 0,
    requirements: [req({ id: REQ, status: 'implementing', sourceSessionId: 'session-h2role' })],
    triages: [],
  } as never)
  taskStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: dir }), now: () => Date.now() })
  // 三张卡各代表一个角色：父卡（有子卡）/ 子卡（有 parentId）/ 存量卡（两者都没有）。
  // 起点都是 **in_progress**——这正是两种表的分叉点：legacy 的 in_progress 有
  // integrating/testing 出边，子卡/父卡的 in_progress 只有 done/todo/canceled。
  // （若起点用 todo，两张表都拒绝 todo→integrating，测试就抓不住"路由忘了传 role"。）
  await taskStore.createMany(REQ, [
    task({ id: 't-p', requirementId: REQ, status: 'in_progress' }),
    task({ id: 't-s', requirementId: REQ, status: 'in_progress', parentId: 't-p', stageKind: 'dev' as never }),
    task({ id: 't-l', requirementId: REQ, status: 'in_progress' }),
  ])
  handler = createReqboardHandler({ requirementStore: store, taskStore, now: () => Date.now() })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function fakeReq(body: unknown, url: string, method = 'POST'): any {
  const r = new EventEmitter() as any
  r.url = '/dashboard/api/reqboard' + url
  r.method = method
  r[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return r
}
function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}
async function move(id: string, to: string) {
  const res = fakeRes()
  await handler(fakeReq({ id, to, actor: 'human', reason: '看板试推' }, '/task/move'), res)
  return res
}
const statusOf = async (id: string): Promise<TaskRecord | undefined> =>
  (await taskStore.get(id))

describe('H2-role：看板（HTTP 面）按角色校验任务转移（FR-2）', () => {
  it('子卡 in_progress → integrating/testing/in_review 一律被拒（invalid_transition），且字段零改动', async () => {
    for (const to of ['integrating', 'testing', 'in_review']) {
      const res = await move('t-s', to)
      expect(res.statusCode, `子卡 → ${to} 应被拒`).toBe(400)
      expect(res.payload?.code, `子卡 → ${to}`).toBe('invalid_transition')
      const after = await statusOf('t-s')
      expect(after?.status, `子卡 → ${to} 不得落账`).toBe('in_progress')
      expect(after?.version, `子卡 → ${to} 零副作用`).toBe(1)
      expect(after?.statusHistory ?? []).toHaveLength(0)
    }
  })

  it('子卡合法边照常放行：in_progress → done（不是一刀切拒绝子卡）', async () => {
    const res = await move('t-s', 'done')
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
    expect((await statusOf('t-s'))?.status).toBe('done')
  })

  it('父卡同样走收紧表：in_progress → integrating 被拒（角色判定认出父卡）', async () => {
    const res = await move('t-p', 'integrating')
    expect(res.statusCode).toBe(400)
    expect(res.payload?.code).toBe('invalid_transition')
    expect((await statusOf('t-p'))?.status).toBe('in_progress')
  })

  it('存量卡老路径不受影响：in_progress → integrating → testing 两跳均放行（legacy 五段表）', async () => {
    const first = await move('t-l', 'integrating')
    expect(first.statusCode).toBe(200)
    const second = await move('t-l', 'testing')
    expect(second.statusCode).toBe(200)
    expect((await statusOf('t-l'))?.status).toBe('testing')
  })
})
