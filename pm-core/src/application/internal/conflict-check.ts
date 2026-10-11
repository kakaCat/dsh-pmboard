/**
 * 拆分期改动面冲突拦截（REQ-4842fe t9 / FR-10 主防线）。
 *
 * 两张**互无依赖**的父卡若在 implementation 里声明同一文件，并行跑会互相覆盖——
 * 拆分阶段就拒绝（比运行期靠 mtime 事后发现便宜得多）。
 *
 * 诚实边界：本检查基于 implementation 文本里的文件路径 token，声明不全则查不出；
 * 运行期 mtime 兜底（cross-card.ts）是第二道防线，人工 review 仍不可替代。
 *
 * @module dsh-pmboard/application/internal/conflict-check
 */
export interface WorkSurfaceTask {
  key: string
  implementation: string
  dependsOn: readonly string[]
}

export interface WorkSurfaceConflict {
  file: string
  keys: [string, string]
}

import { fmt } from '../../domain/text/fmt.js'

// REQ-261007095750-9f48 FR-1：口径扩根——根补 `src`（本仓绝大多数落点在 src，原四根看不见它），
// 扩展名补 `mts`。**只改这一处**：declaredFiles 是**冲突族判据**的唯一抽取器（文件冲突门与零交集依赖建议共用它）；
// 给其中一处另配口径必然分叉（本仓反复踩过「门禁读 A、下游读 B」）。
// 口径澄清：`src/domain/task/Footprint.ts` 另有一套更宽的 PATH_RE 服务「体量下限」这一第三类消费者
// （已含 src、不含 packages、不要求扩展名），两者用途不同，不是分叉。
//
// 2026-10-11 平铺布局：包目录变成 `pm-*` / `category/*` / `goal/*` / `tool-pm` 等。若只列
// `src|packages|pm|scripts|tests|docs` 这些根，`pm-core/src/x.ts` 会被**从路径中段截断**成 `src/x.ts`
// （实测：`plan-depends-e2e` 的零交集警告里丢了包名 ⇒ 两端身份判错，冲突门与依赖建议一起瞎）。
// 故：① 前缀段把现行包目录吃进匹配；② 加左边界，禁止从路径中段起匹配。
// 规格与边界逐条见 `pm-core/tests/path-extraction-scope.test.ts`（TC-1…TC-5）。
const PKG_PREFIX = '(?:pm-[a-z-]+|tool-pm|command-pm|reqboard-rtm|category\\/[a-z-]+|goal\\/[a-z-]+)\\/'
const PATH_RE = new RegExp(
  '(?<![\\w./@-])(?:agent-dh\\/)?(?:' + PKG_PREFIX + ')?'
  + '(?:src|packages|pm|scripts|tests|docs)\\/(?:[\\w@-]+\\/)*[\\w@.-]+\\.(?:tsx|mts|json|mjs|cjs|ts|js|md|css|html|yaml|yml)',
  'g',
)

/** 抽取 implementation 声明的工作区文件路径（去重）。 */
export function declaredFiles(implementation: string): string[] {
  const out = new Set<string>()
  for (const m of implementation.matchAll(PATH_RE)) out.add(m[0])
  return [...out]
}

/** 冲突清单人读文本（错误消息与报告共用）。 */
export function describeConflicts(conflicts: readonly WorkSurfaceConflict[]): string {
  return conflicts.map((c) => fmt('{file}（{a} / {b}）', { file: c.file, a: c.keys[0], b: c.keys[1] })).join('；')
}

/** 传递闭包：某 key 的全部（间接）前置依赖。 */
function ancestorsOf(tasks: readonly WorkSurfaceTask[], key: string): Set<string> {
  const byKey = new Map(tasks.map((t) => [t.key, t]))
  const seen = new Set<string>()
  const stack = [...(byKey.get(key)?.dependsOn ?? [])]
  while (stack.length > 0) {
    const k = stack.pop() as string
    if (seen.has(k)) continue
    seen.add(k)
    for (const d of byKey.get(k)?.dependsOn ?? []) stack.push(d)
  }
  return seen
}

/**
 * 找出"互无依赖的卡声明了同一文件"的冲突对。
 * 同一条依赖链上的卡（前后依赖）不算冲突——它们天然串行。
 */
export function findWorkSurfaceConflicts(tasks: readonly WorkSurfaceTask[]): WorkSurfaceConflict[] {
  const files = new Map(tasks.map((t) => [t.key, new Set(declaredFiles(t.implementation))]))
  const ancestors = new Map(tasks.map((t) => [t.key, ancestorsOf(tasks, t.key)]))
  const conflicts: WorkSurfaceConflict[] = []
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const a = tasks[i] as WorkSurfaceTask
      const b = tasks[j] as WorkSurfaceTask
      const serial = (ancestors.get(b.key) as Set<string>).has(a.key) || (ancestors.get(a.key) as Set<string>).has(b.key)
      if (serial) continue
      const fa = files.get(a.key) as Set<string>
      for (const f of fa) {
        if ((files.get(b.key) as Set<string>).has(f)) conflicts.push({ file: f, keys: [a.key, b.key] })
      }
    }
  }
  return conflicts
}
