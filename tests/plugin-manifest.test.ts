/**
 * 插件装载清单与构建内联门禁（2026-10-10「pm 插件失效」事故的回归锁）。
 *
 * 【事故】`pm/` 拆分后仓库根的 `package.json` 丢了 `main`/`exports`/`dsh.bundle.patch`/`dsh.client`，
 * 而 profile 以 `link:<仓库根>` 安装本插件 ⇒ 装载层读不到 patch 文件，**整个 bundle 被跳过**
 * （现象：全部 `reqboard_*` 工具与看板路由不注册，重启宿主也无效；宿主只在 stderr 打一行 skip）。
 * 同时 `pm/tsdown*.config.mjs` 没内联 workspace 组件包，产物在运行期解析到不存在的 `src/*.js`。
 *
 * 【2026-10-11 装载形态定案】插件主体包 `pm/` 直载：profile 的 link 目标 = `<仓库>/pm`，
 * 装载层读的就是 **`pm/package.json`**（唯一事实源）；仓库根退回纯 workspace 根，**不持插件清单**
 * ——两份清单就是两份事实源，正是这次二次失效的温床。
 *
 * 【为什么两道都要守】清单齐全 ≠ 解得开：入口指向的产物若把组件包留成外部依赖，
 * 加载照样失败。两道都是「插件能不能起来」的必要条件，且都不会被普通单测发现
 * （单测走 vitest 别名，绕过真实解析）。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { repoPath } from 'tests/helpers/repo-root.js'

/** 读包清单（相对仓库根）。 */
function manifest(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(repoPath(rel), 'utf8')) as Record<string, unknown>
}

/** 清单里的相对路径（`./dist/x.mjs`）→ 仓库根相对路径，用于盘上存在性检查。 */
function fromPackage(pkgDir: string, rel: string): string {
  return `${pkgDir}/${rel.replace(/^\.\//, '')}`
}

describe('插件装载清单（pm/package.json 是唯一事实源）', () => {
  const pkg = manifest('pm/package.json')

  it('name = dsh-pmboard（profile 的 link: 目标名与 patch 的 insert 名都是它）', () => {
    expect(pkg.name).toBe('dsh-pmboard')
  })

  it('服务半入口（main / exports["."]）声明且文件在盘上', () => {
    const main = pkg.main as string | undefined
    expect(main, 'main 缺失 = 宿主找不到服务半').toBeTruthy()
    expect(existsSync(repoPath(fromPackage('pm', main!))), 'main 指向的文件不存在：' + main).toBe(true)
    const dot = (pkg.exports as Record<string, { import?: string; default?: string }> | undefined)?.['.']
    expect(dot?.import, 'exports["."].import 缺失 = 宿主找不到服务半').toBeTruthy()
    expect(existsSync(repoPath(fromPackage('pm', dot!.import!)))).toBe(true)
    // resolveBundleDir 用 createRequire（CJS 条件）解析入口：只写 import 条件会 ERR_PACKAGE_PATH_NOT_EXPORTED。
    expect(dot?.default, 'exports["."].default 缺失 = createRequire 解析不到入口').toBeTruthy()
    expect(existsSync(repoPath(fromPackage('pm', dot!.default!)))).toBe(true)
  })

  it('客户端半（exports["./client"]）声明且文件在盘上', () => {
    const client = (pkg.exports as Record<string, string> | undefined)?.['./client']
    expect(client, 'exports["./client"] 缺失 = 看板 UI 不加载').toBeTruthy()
    expect(existsSync(repoPath(fromPackage('pm', client!)))).toBe(true)
  })

  it('dsh.bundle.patch 声明且 patch 文件在盘上（读不到 = 整个 bundle 被跳过）', () => {
    const dsh = pkg.dsh as { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } } | undefined
    const patch = dsh?.bundle?.patch
    expect(patch, 'dsh.bundle.patch 缺失 = 整个 bundle 被静默跳过（工具与路由全不注册）').toBeTruthy()
    expect(existsSync(repoPath(fromPackage('pm', patch!))), 'patch 文件不存在：' + patch).toBe(true)
    expect(dsh?.client?.platform, 'dsh.client.platform 缺失 = 客户端半不被识别').toBe('web')
  })

  it('仓库根只当 workspace 根：不持插件清单（否则又是两份事实源）', () => {
    const root = manifest('package.json')
    expect(root.private, '仓库根必须是 private workspace 根').toBe(true)
    for (const field of ['main', 'types', 'exports', 'files', 'dsh', 'peerDependencies']) {
      expect(root[field], `仓库根不该有 ${field}——插件清单只许在 pm/package.json`).toBeUndefined()
    }
  })
})

describe('构建产物必须自包含（workspace 组件包内联）', () => {
  /** 组件包 exports 指向 TS 源码 ⇒ 无构建产物 ⇒ 只能内联，留成外部依赖必在运行期炸。 */
  function needsInlining(pkgName: string): boolean {
    const dir = repoPath(pkgName)
    if (!existsSync(dir + '/package.json')) return false
    if (existsSync(dir + '/dist')) return false
    const exports = manifest(pkgName + '/package.json').exports as Record<string, string> | null | undefined
    return exports !== null && exports !== undefined && String(exports['.'] ?? '').includes('/src/')
  }

  it.each(['pm/tsdown.config.mjs', 'pm/tsdown.client.config.mjs'])('%s 内联了所有「无产物」的 workspace 包', (configPath) => {
    const noExternal = workspacePatternsOf(configPath)
    const matches = (name: string): boolean =>
      noExternal.some((p) => (typeof p === 'string' ? p === name : p.test(name)))
    const pkg = manifest('pm/package.json')
    const deps = Object.keys((pkg.dependencies as Record<string, string> | undefined) ?? {})
      .filter((d) => !d.startsWith('@deepseek-ai/'))
    const needs = deps.filter(needsInlining)
    expect(needs.length, '自检：确实存在需要内联的组件包').toBeGreaterThan(0)
    const missing = needs.filter((d) => !matches(d))
    expect(missing, '这些组件包没有产物却被留成外部依赖（运行期解析到 src/*.js 必炸）：' + missing.join(', '))
      .toEqual([])
  })

  it('宿主包保持外部（内联 dsh-tools 会复制调度器 Symbol，破坏工具分发）', () => {
    const text = readFileSync(repoPath('pm/tsdown.config.mjs'), 'utf8')
    const external = /external:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? ''
    expect(external).toContain('@deepseek-ai/dsh-tools')
    expect(external).toContain('@deepseek-ai/cordis')
  })
})

/**
 * 从构建配置**文本**里取 `noExternal` 的模式表。
 * 刻意不 `import` 配置：那会把 tsdown/rolldown 的原生绑定拉进单测进程（vitest 环境报 binding 错）。
 */
function workspacePatternsOf(configPath: string): Array<string | RegExp> {
  const text = readFileSync(repoPath(configPath), 'utf8')
  const arrayLiteral = /noExternal:\s*(?:\[[^\]]*\]|WORKSPACE_PACKAGES)/.exec(text)?.[0] ?? ''
  const source = arrayLiteral.includes('WORKSPACE_PACKAGES')
    ? (/const WORKSPACE_PACKAGES = \[([^\]]*)\]/.exec(text)?.[1] ?? '')
    : arrayLiteral
  const patterns: Array<string | RegExp> = []
  for (const m of source.matchAll(/\/\^([^/]+)\//g)) patterns.push(new RegExp('^' + m[1]))
  for (const m of source.matchAll(/'([^']+)'/g)) patterns.push(m[1])
  return patterns
}
