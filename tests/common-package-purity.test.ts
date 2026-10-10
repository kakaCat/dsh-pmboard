/**
 * 公共包纯度自检（REQ-261009174713-7bc8 t4 / RF-19）。
 *
 * 判据来自设计（design/architecture.md 的公共包边界）：
 *   · `pm-common` 的 package.json **零 workspace 依赖**——它是依赖图底部；
 *   · 其 src 内**不得出现任何**指向兄弟包的 import（含 type-only：类型层的环同样会让
 *     「公共」名不副实，且会把环藏在编译期）。
 *
 * 为什么单列成测试而不并进门禁脚本：门禁脚本管「19 包的分层白名单」，本用例管
 * 「common 作为 L0 的纯度」这条**更硬的断言**（它对任何兄弟包都为 0，而不只是白名单外的）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO = process.cwd()
const PKG = join(REPO, 'pm', 'pm-common')

function tsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) tsFiles(abs, out)
    else if (name.endsWith('.ts')) out.push(abs)
  }
  return out
}

describe('公共包 pm-common 纯度（t4）', () => {
  it('package.json 零 workspace 依赖（依赖图底部）', () => {
    const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
  })

  it('src 内不 import 任何兄弟包（含 type-only）', () => {
    const offenders: string[] = []
    for (const file of tsFiles(join(PKG, 'src'))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g)) {
        const spec = m[1]
        if (spec.startsWith('pm-') || spec === 'reqboard-rtm' || spec.startsWith('reqboard-rtm/')) {
          offenders.push(relative(REPO, file) + ' → ' + spec)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('公共抽象在场：既有 shared 纯件，也有下移的 domain 叶子', () => {
    const src = join(PKG, 'src')
    for (const rel of ['index.ts', 'error-code-registry.ts', 'dual-field.ts', 'limits.ts', 'text/labels.ts', 'knowledge/slug.ts']) {
      expect(existsSync(join(src, rel)), rel + ' 缺失').toBe(true)
    }
    expect(tsFiles(src).length).toBeGreaterThanOrEqual(30)
  })
})
