/**
 * 资产面（templates / skills / eval-suite）的**布局无关**路径口径
 * （REQ-261009174713-7bc8 · t19）。
 *
 * 资产正要各自成包（`pm-templates/templates/` 等）。判据里到处是 `pm-templates/templates/…`
 * 这样的路径；若钉死一种写法，搬迁当刻就会红一片。
 *
 * 两个方向：
 *   · `assetRel(p)`  —— **归一**：包内路径收回 `pm-templates/templates/…` 形态（比较用；今天是无操作）；
 *   · `assetPath(rel)` —— **求解**：给出真实存在的绝对路径（`existsSync` / 读文件用）。
 *
 * @module tests/helpers/asset-root
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const KINDS = ['templates', 'skills', 'eval-suite'] as const

/** 归一：`pm/pm-<kind>/<kind>/…` → `<kind>/…`；其它原样返回。 */
export function assetRel(p: string): string {
  for (const k of KINDS) {
    const pre = 'pm-' + k + '/' + k + '/'
    if (p.startsWith(pre)) return k + '/' + p.slice(pre.length)
  }
  return p
}

/** 求解：该资产相对路径**当前**所在的绝对路径（搬迁前后各一处）。 */
export function assetPath(rel: string): string {
  const kind = KINDS.find((k) => rel === k || rel.startsWith(k + '/'))
  if (kind === undefined) return join(REPO, rel)
  const rest = rel === kind ? '' : rel.slice(kind.length + 1)
  const inPkg = join(REPO, 'pm-' + kind, kind, rest)
  return existsSync(inPkg) ? inPkg : join(REPO, kind, rest)
}

/** 该资产当前所在的**仓库相对**根（给 read(rel)/join(ROOT, …) 类口径用）。 */
export function assetRootRel(kind: (typeof KINDS)[number]): string {
  return existsSync(join(REPO, 'pm-' + kind, kind)) && !existsSync(join(REPO, kind))
    ? 'pm/pm-' + kind + '/' + kind
    : kind
}
