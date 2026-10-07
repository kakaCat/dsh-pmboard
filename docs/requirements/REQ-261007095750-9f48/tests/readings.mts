/**
 * 真实数据读数（REQ-261007095750-9f48 FR-3）——随本需求证据落盘（原写在 /tmp；为可复跑而随证据保存）。
 *
 * 它**不被 vitest 收集**（vitest include = tests/**\/*.test.ts），也不进 `scripts/` 的按需探针清单。
 * 运行：`npx tsx docs/requirements/REQ-261007095750-9f48/tests/readings.mts`
 *      （换机器时用 `REPO=<仓库绝对路径> npx tsx ...` 覆写）
 *
 * 「改前」= **忠实复算**：用旧口径正则（四根、无 mts）喂进判据的同一谓词（脚本内复算）；
 * 「改后」= 直接调生产函数（declaredFiles / zeroOverlapDependencyWarnings / findWorkSurfaceConflicts）。
 */

const REPO = process.env.REPO ?? '/Users/mac/Documents/ai/dsh/dsh-pmboard'
const { declaredFiles, findWorkSurfaceConflicts } = await import(REPO + '/src/application/internal/conflict-check.js')
const { zeroOverlapDependencyWarnings } = await import(REPO + '/src/application/internal/plan-deps-check.js')

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OLD = /(?:agent-dh\/)?(?:packages|scripts|tests|docs)\/(?:[\w@-]+\/)*[\w@.-]+\.(?:tsx|json|mjs|cjs|ts|js|md|css|html|yaml|yml)/g
const oldFiles = (t: string) => [...new Set([...t.matchAll(OLD)].map(m => m[0]))]
const ROOT = join(process.env.HOME ?? '', '.dsh/reqboard/requirements')
const reqs = readdirSync(ROOT).filter(d => existsSync(join(ROOT, d, 'plan.json')))

let srcRows = 0, oldOk = 0, newOk = 0
let zeroFaithful = 0, zeroApprox = 0, zeroNew = 0
let confFaithful = 0, confApprox = 0, confNew = 0
let edges = 0, unjudged = 0
const faithfulHits = new Set<string>(), newHits = new Set<string>()

for (const r of reqs) {
  const plan = JSON.parse(readFileSync(join(ROOT, r, 'plan.json'), 'utf8')) as { tasks?: any[] }
  const tasks = (plan.tasks ?? []).filter((t: any) => (t.implementation ?? '').trim())
  const byKey = new Map(tasks.map((t: any) => [t.key, t]))
  const fFaithful = new Map(tasks.map((t: any) => [t.key, oldFiles(t.implementation)]))
  const fApprox = new Map(tasks.map((t: any) => [t.key, oldFiles(t.implementation.replace(/(^|[^A-Za-z0-9._-])src\//g, ' '))]))
  const fNew = new Map(tasks.map((t: any) => [t.key, declaredFiles(t.implementation)]))

  for (const t of tasks as any[]) {
    if (/(^|[^A-Za-z0-9._-])src\//.test(t.implementation)) {
      srcRows += 1
      if ((fFaithful.get(t.key) as string[]).length) oldOk += 1
      if ((fNew.get(t.key) as string[]).length) newOk += 1
    }
    const mine = fFaithful.get(t.key) as string[]
    if (mine.length) for (const dep of t.dependsOn ?? []) {
      if (!byKey.has(dep)) continue
      edges += 1
      const theirs = fFaithful.get(dep) as string[]
      if (!theirs.length) { unjudged += 1; continue }
    }
    // 零交集（两口径 + 当前实现）
    for (const [label, map, sink] of [['faithful', fFaithful, 'z0'], ['approx', fApprox, 'z1']] as const) {
      const m = map.get(t.key) as string[]
      if (!m.length) continue
      for (const dep of t.dependsOn ?? []) {
        if (!byKey.has(dep)) continue
        const th = map.get(dep) as string[]
        if (!th.length || (t.dep_reasons ?? {})[dep] !== undefined) continue
        if (m.some((x: string) => th.includes(x))) continue
        if (sink === 'z0') zeroFaithful += 1; else zeroApprox += 1
      }
    }
  }
  zeroNew += zeroOverlapDependencyWarnings(tasks as any).length

  // 冲突门：互无依赖（传递闭包）+ 共享同一文件 —— 三口径
  const anc = new Map<string, Set<string>>()
  const ancOf = (k: string): Set<string> => {
    if (anc.has(k)) return anc.get(k) as Set<string>
    const seen = new Set<string>(); const st = [...((byKey.get(k) as any)?.dependsOn ?? [])]
    while (st.length) { const x = st.pop() as string; if (seen.has(x)) continue; seen.add(x); for (const d of (byKey.get(x) as any)?.dependsOn ?? []) st.push(d) }
    anc.set(k, seen); return seen
  }
  for (const [label, map, add] of [['faithful', fFaithful, (k: string) => { confFaithful += 1; faithfulHits.add(k) }], ['approx', fApprox, () => { confApprox += 1 }]] as const) {
    for (let i = 0; i < tasks.length; i += 1) for (let j = i + 1; j < tasks.length; j += 1) {
      const a = (tasks as any[])[i], b = (tasks as any[])[j]
      if (ancOf(a.key).has(b.key) || ancOf(b.key).has(a.key)) continue
      const fa = map.get(a.key) as string[], fb = map.get(b.key) as string[]
      const shared = fa.find((x: string) => fb.includes(x))
      if (shared) add(`${r}|${[a.key, b.key].sort().join(',')}|${shared}`)
    }
  }
  for (const c of findWorkSurfaceConflicts(tasks as any)) {
    confNew += 1
    const k = `${r}|${[...c.keys].sort().join(',')}|${c.file}`
    if (!faithfulHits.has(k)) newHits.add(k)
  }
}
console.log(JSON.stringify({
  snapshot: new Date().toISOString(),
  requirements: reqs.length,
  srcRows,
  oldExtractable: oldOk, newExtractable: newOk,
  oldRate: +(oldOk / srcRows * 100).toFixed(1), newRate: +(newOk / srcRows * 100).toFixed(1),
  zeroOverlap: { faithfulOld: zeroFaithful, approxOld: zeroApprox, new: zeroNew },
  conflict: { faithfulOld: confFaithful, approxOld: confApprox, new: confNew, newHits: newHits.size },
  dependencyEdges: edges, unjudgedEdges: unjudged,
}, null, 1))
