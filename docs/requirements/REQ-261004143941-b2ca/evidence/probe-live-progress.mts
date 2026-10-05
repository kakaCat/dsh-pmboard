/**
 * t1 真机数据取证（REQ-261004143941-b2ca FR-1）——**不依赖宿主重载**。
 *
 * 为什么不用 curl：宿主把插件 dist 常驻在内存里，改完 dist 不会自动换掉已加载的模块
 * （实测：重新构建后 curl 仍返回旧形状）。于是本探针在**进程内**用**真实数据根**
 * （~/.dsh/reqboard）+ 真实队列装配路由，直接证明新代码在真数据上的输出。
 *
 * 用法：./node_modules/.bin/tsx docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts <sessionId> [workspaceRoot]
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { ShardedRequirementStore } from '../../../../src/repositories/ShardedRequirementStore.js'
import { taskStoreAt } from '../../../../tests/queue/route-deps.js'
import { createReqboardHandler } from '../../../../src/http/routes.js'

const sid = process.argv[2] ?? 'session-97bd3bf9-d995-4f61-81fa-9d72c58d40f8'
const workspaceRoot = process.argv[3] ?? '/Users/mac/Documents/ai/dsh/dsh-pmboard'
const dataRoot = join(homedir(), '.dsh', 'reqboard')

const requirementStore = new ShardedRequirementStore({ root: dataRoot, now: () => Date.now() })
const handler = createReqboardHandler({
  requirementStore,
  taskStore: taskStoreAt(workspaceRoot),
  now: () => Date.now(),
})

const req = new EventEmitter() as never as Record<string, unknown>
req['url'] = '/dashboard/api/reqboard/session/' + sid + '/progress'
req['method'] = 'GET'
req[Symbol.asyncIterator] = async function* () { /* GET 无 body */ }
const res = new EventEmitter() as never as Record<string, unknown>
let body = ''
res['writeHead'] = () => res
res['end'] = (text?: string) => { body = text ?? ''; return res }

await handler(req as never, res as never)
const data = (JSON.parse(body) as { data: { requirement?: Record<string, unknown>; nodes?: Array<{ key?: string; tokens?: { total?: number } }> } }).data
const requirement = data.requirement ?? {}
const sumNodes = (data.nodes ?? []).reduce((n, x) => n + (x.tokens?.total ?? 0), 0)
const tokenTotal = requirement['tokenTotal']

console.log('session            =', sid)
console.log('requirement        =', requirement['id'], String(requirement['status'] ?? ''))
console.log('requirement.tokenTotal =', tokenTotal, '（键存在:', 'tokenTotal' in requirement, '）')
console.log('Σ nodes[].tokens.total =', sumNodes)
console.log('nodes              =', JSON.stringify(data.nodes))
if (tokenTotal !== sumNodes || typeof tokenTotal !== 'number' || tokenTotal <= 0) {
  console.error('FAIL：tokenTotal 必须存在、> 0、且等于 Σ nodes')
  process.exit(1)
}
console.log('PASS：tokenTotal === Σ nodes（真数据、真路由、真队列）')
