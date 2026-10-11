/**
 * 类型门禁：workspace 形态下 `tsc --noEmit` 零错误（2026-10-11 改判）。
 *
 * 为什么要有这道门（返工根因，别删）：REQ-47939a 重构后 `src/http/routers/stages.ts` 引用了两个
 * **不存在的符号**（`OPEN_STATUSES` / `TASK_ORDER`）→ 运行时 ReferenceError → HTTP 500 → 会话框
 * 流程节点不显示。它之所以能一路到线上，是因为当时**没有 tsconfig、也没有类型检查门禁**：
 * tsx 直接剥类型运行、vitest 不跑 tsc，任何"引用了不存在的名字 / 参数类型不匹配"都零成本通关。
 *
 * 判据改判（原判据随 19 包平铺重构失效，不是放宽）：
 *  - 原判据断言「根 tsconfig 的 include 含单包形态的 src 全量模式、且根 src/ 目录存在」——那是单包布局；
 *    10-10 重构把源码平铺进 19 个包后该判据恒假（根既无 src/，include 也改列 pm/src 等）。
 *  - 现判据按**workspace 实际形态**校验：根 tsconfig 覆盖各包；每个有 src/ 的包都持自己的
 *    tsconfig 且 extends 根、把 include 收窄到本包 src；再真跑 tsc 要求各包 src 与 tests 下 0 错误。
 */
import { describe, it, expect } from 'vitest'
import { repoPath } from 'tests/helpers/repo-root.js'
import { workspacePkgDirs } from 'tests/helpers/workspace-pkgs.js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

const pkgRoot = resolve(repoPath('tests'), '..')
const tsconfigPath = join(pkgRoot, 'tsconfig.json')
const require = createRequire(import.meta.url)

/** tsc 入口：走本包 devDependency 的 typescript（不依赖 npx 联网/全局安装）。 */
const tscJs = join(dirname(require.resolve('typescript')), 'tsc.js')

interface TypeError { file: string; line: number; col: number; code: string; message: string }

/** 跑一次真实 tsc，返回 src/ 与 tests/ 目录下的类型错误（含包内 src/tests）。 */
function runTypecheck(): { errors: TypeError[]; timedOut: boolean; raw: string } {
  const res = spawnSync(
    process.execPath,
    [tscJs, '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
    { cwd: pkgRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
  )
  const raw = ((res.stdout ?? '') + (res.stderr ?? '')).trim()
  const errors: TypeError[] = []
  for (const line of raw.split('\n')) {
    const m = line.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/)
    if (m === null) continue
    const file = relative(pkgRoot, resolve(pkgRoot, m[1]))
    // 只统计源码与测试面：pm/src、pm-core/src、tests/ 等；scripts/ 的历史错误不归本门（见 vitest.config.ts 说明）
    if (/(^|\/)(src|tests)\//.test(file)) {
      errors.push({ file, line: Number(m[2]), col: Number(m[3]), code: m[4], message: m[5] })
    }
  }
  const timedOut = res.error !== undefined || res.signal === 'SIGTERM'
  return { errors, timedOut, raw }
}

describe('类型门禁：tsc --noEmit 零错误（各包 src 与 tests）', () => {
  it('根 tsconfig 覆盖各包与仓库级 tests', () => {
    expect(existsSync(tsconfigPath)).toBe(true)
    const cfg = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as { include?: string[] }
    const include = cfg.include ?? []
    expect(include).toContain('pm/src/**/*.ts')
    expect(include).toContain('pm-*/src/**/*.ts')
    expect(include).toContain('tests/**/*.ts')
  })

  it('每个有 src/ 的 workspace 包都持 tsconfig（extends 根 + 收窄到 src）', () => {
    const dirs = workspacePkgDirs().filter(d => existsSync(join(pkgRoot, d, 'src')))
    expect(dirs.length, '未扫到任何 workspace 包：判据可能已失效').toBeGreaterThan(10)
    const missing: string[] = []
    const wrong: string[] = []
    for (const d of dirs) {
      const cfgPath = join(pkgRoot, d, 'tsconfig.json')
      if (!existsSync(cfgPath)) { missing.push(d); continue }
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { extends?: string; include?: string[] }
      // extends 写法随层级不同（顶层包 ../，分组包 ../../）——按解析后的落点判定，不比对字面量
      const extendsRoot = cfg.extends !== undefined && resolve(join(pkgRoot, d), cfg.extends) === tsconfigPath
      if (!extendsRoot || !(cfg.include ?? []).includes('src/**/*.ts')) wrong.push(d)
    }
    expect(missing, '这些包缺 tsconfig.json：' + missing.join('、')).toEqual([])
    expect(wrong, '这些包的 tsconfig 未 extends 根或未收窄到 src：' + wrong.join('、')).toEqual([])
  })

  it('每个有 src/ 的包都提供 typecheck 脚本（包内可自检）', () => {
    const dirs = workspacePkgDirs().filter(d => existsSync(join(pkgRoot, d, 'src')))
    const missing = dirs.filter(d => {
      const cfg = JSON.parse(readFileSync(join(pkgRoot, d, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      return cfg.scripts?.typecheck !== 'tsc --noEmit -p tsconfig.json'
    })
    expect(missing, '这些包缺 typecheck 脚本：' + missing.join('、')).toEqual([])
  })

  it('src 与 tests 下 0 个类型错误', () => {
    const { errors, timedOut, raw } = runTypecheck()
    const head = errors.slice(0, 15)
      .map(e => `${e.file}(${e.line},${e.col}): ${e.code}: ${e.message}`)
      .join('\n')
    expect(timedOut, 'tsc 未在 120s 内完成（超时/被杀）：\n' + raw.slice(0, 2000)).toBe(false)
    expect(errors.length, `tsc 报告 ${errors.length} 个类型错误（前 15 条）：\n${head}`).toBe(0)
  }, 180_000)
})
