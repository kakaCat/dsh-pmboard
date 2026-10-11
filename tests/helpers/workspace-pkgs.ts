/**
 * workspace 包目录枚举（**位置无关**）——给「包级接线」类门禁测试共用。
 *
 * 口径：按 `pnpm-workspace.yaml` 的 glob 展开，只支持本仓用到的**单层 `*`** 形态
 * （`pm`、`pm-*`、`goal/*`、`category/*`、`tool-pm` …）。刻意不引第三方 glob 库：
 * 依赖越多，门禁自身越脆。
 *
 * @module tests/helpers/workspace-pkgs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { REPO_ROOT } from 'tests/helpers/repo-root.js'

/** 返回 workspace 内各包目录（相对仓库根，如 `pm-core`、`category/pm-category-kit`）。 */
export function workspacePkgDirs(): string[] {
  const yaml = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')
  const globs = yaml.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').replace(/['"]/g, ''))
  const out: string[] = []
  for (const g of globs) {
    if (!g.includes('*')) { out.push(g); continue }
    const parent = dirname(g) // 'pm-*' → '.'；'goal/*' → 'goal'
    const base = parent === '.' ? REPO_ROOT : join(REPO_ROOT, parent)
    if (!existsSync(base)) continue
    const prefix = basename(g).replace('*', '')
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith(prefix)) continue
      out.push(parent === '.' ? e.name : join(parent, e.name))
    }
  }
  return out
}
