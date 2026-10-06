/**
 * t5 真机对账脚本（REQ-261005143615-5ab1）——**真实台账 + 真实磁盘**。
 *
 * 与 https 路由同一条代码路径：`ShardedRequirementStore`（真库）+ `FileDocRepository`（真盘）
 * + `queryDocs`（被测的判定），候选根按 panels.ts 的同一口径构造（需求声明根 → 附加根 → cwd，
 * 去空去重 + 只留存在的根）。唯一没有的是 HTTP 外壳（`?session=` 解析那一步），
 * 因此本脚本比"打桩单测"更接近现场，比"curl 运行中的 GUI"更可控（GUI 里的插件是启动时载入的旧模块）。
 *
 * 用法：npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { ShardedRequirementStore } from '../../../../src/repositories/ShardedRequirementStore.js'
import { FileDocRepository } from '../../../../src/adapters/FileDocRepository.js'
import { JsonQueueRepository } from '../../../../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../../../../src/repositories/QueueTaskStore.js'
import { queryDocs } from '../../../../src/application/query/QueryDocs.js'

const ROOT = homedir() + '/.dsh/reqboard'
const CWD = process.cwd()
const store = new ShardedRequirementStore({ root: ROOT })

/** 与 panels.ts `depsForSession` 同口径：需求声明根 → 附加根 → cwd，去空去重，只留存在的根。 */
function rootsOf(workspaceRoot: string | undefined, extra: readonly string[]): string[] {
  const out: string[] = []
  for (const c of [workspaceRoot, ...extra, CWD]) {
    if (typeof c !== 'string' || c.length === 0 || out.includes(c)) continue
    if (existsSync(c)) out.push(c)
  }
  return out
}

async function docsOf(reqId: string, extra: readonly string[], forceNoRoot = false) {
  const req = await store.get(reqId)
  if (req === undefined) throw new Error('台账里没有 ' + reqId)
  const roots = forceNoRoot ? [] : rootsOf(req.workspaceRoot, extra)
  const mk = (root: string): FileDocRepository => new FileDocRepository({ workspaceRoot: root })
  const shown = roots.length > 0 ? roots[0]! : CWD
  const res = await queryDocs(
    {
      store,
      tasks: new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: shown }), now: () => Date.now() }),
      injections: { readAll: async () => [] },
      sessions: {},
      docs: mk(shown),
      docRootsOf: () => roots,
      docsAt: mk,
    } as never,
    { requirementId: reqId },
  )
  return { req, roots, res }
}

function tally(rows: readonly { state: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1
  return out
}

/* ① 不带任何会话：归档需求 REQ-261005123641-3982 */
const A = await docsOf('REQ-261005123641-3982', [])
console.log('① REQ-261005123641-3982（不带会话）')
console.log('   候选根：', JSON.stringify(A.roots))
console.log('   台账形态：', (A.res as { documents: unknown[] }).documents.length, '份文档')
console.log('   state 分布：', JSON.stringify(tally((A.res as { documents: { state: string }[] }).documents)))
console.log('   file-missing 计数 =', (A.res as { documents: { state: string }[] }).documents.filter(d => d.state === 'file-missing').length)

/* ② 带一个"会话根"（本项目根）：逐条比对 state 与磁盘 */
const B = await docsOf('REQ-261005123641-3982', ['/Users/mac/Documents/ai/dsh/dsh-pmboard'])
const rows = (B.res as { documents: { path: string; state: string; absPath?: string }[] }).documents
let divergence = 0
let withAbs = 0
for (const r of rows) {
  if (r.absPath !== undefined) withAbs += 1
  const onDisk = r.absPath !== undefined && existsSync(r.absPath)
  const claimsInDisk = r.state === 'confirmed' || r.state === 'pending' || r.state === 'unregistered'
  if (onDisk !== claimsInDisk) {
    divergence += 1
    console.log('   ✗ 分歧：', r.path, r.state, r.absPath)
  }
}
console.log('② 同一需求（候选根含会话根）')
console.log('   带 absPath 的行 =', withAbs, '/', rows.length, '· state 与磁盘比对分歧 =', divergence)

/* ③ 文件真没了的回归：REQ-260930094139-2d65 */
const C = await docsOf('REQ-260930094139-2d65', [])
console.log('③ REQ-260930094139-2d65（文件真丢了）')
console.log('   候选根：', JSON.stringify(C.roots))
console.log('   state 分布：', JSON.stringify(tally((C.res as { documents: { state: string }[] }).documents)))

/* ④ 一个可用根都没有：全部未判定 */
const D = await docsOf('REQ-261005123641-3982', [], true)
console.log('④ 同一需求，强制候选根为空')
console.log('   state 分布：', JSON.stringify(tally((D.res as { documents: { state: string }[] }).documents)))
console.log('   带 absPath 的行 =', (D.res as { documents: { absPath?: string }[] }).documents.filter(d => d.absPath !== undefined).length)
