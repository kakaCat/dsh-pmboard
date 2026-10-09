/**
 * 零参绑定守护测试（**已退休**）：`@deepseek-ai/dsh-ptc-runtime-node` 的零参绑定补丁。
 *
 * ## 依据与时点
 *
 * 本站点：REQ-261008004324-81df「reqboard 红测试收口」BUG-7（环境依赖与探针锚点）。
 * 实测时点：2026-10-07，工作树 HEAD `c49fd5e`。本仓 57 个 commit 的历史里，
 * 根 `package.json` **从未**出现 `pnpm.patchedDependencies`、`patches/` 目录**从未**进过树
 * （`git log --all -S 'patchedDependencies' -- package.json` 与 `git log --all -- patches` 均无输出）。
 *
 * 【历史：这条守护当时在守什么】
 * PTC 运行时把宿主声明的绑定暴露成程序里的全局函数（如 `tools.foo()`）。
 * Node 版实现在 `lib/process.js` 的 makeNamespaces 里把每个绑定写成：
 *     value: (args) => { ... snapshotPtcJsonValue(args) ... }
 * 程序**零参调用**（`tools.foo()`，DSH 里绝大多数工具调用都走零参/全默认）时 `args === undefined`，
 * 快照判非法 JSON → 在发出控制帧之前就 reject，宿主根本收不到这一帧：工具调用表现为
 * 「什么都没发生」的静默失败。当时的修复是
 * `patches/@deepseek-ai__dsh-ptc-runtime-node@0.1.6-alpha.2.patch`（只改一行：
 * `value: (args) => {` → `value: (args = {}) => {`），由根 package.json 的
 * `pnpm.patchedDependencies` 登记。原文件有四层守护：① 登记仍在；② patch 文件内容；
 * ③ 已安装产物 `lib/process.js` 带默认参数；④ 跨进程零参调用 call 帧 args 编码为 `{}`。
 *
 * 【为什么四条守护整体退休：守护对象已整体消失，不是「补丁被回退」】
 *   1. `patches/` 目录不存在（`existsSync('<repo>/patches') === false`）；
 *   2. 根 `package.json` 连 `pnpm` 字段都没有 ⇒ 没有任何 patchedDependencies 登记；
 *   3. `@deepseek-ai/dsh-ptc-runtime-node` 已不在安装树里（`node_modules/.pnpm` 无该条目）；
 *   4. 现行依赖 `@deepseek-ai/dsh-ptc-runtime@0.2.0-rc.1`（`@deepseek-ai/dsh-tools@0.2.0-rc.1`
 *      的 peer/传递依赖）的 `lib/` 只有 `index.js` 与 `types/`，**没有被守护的 `lib/process.js`**。
 * 对象消失后，原来的四条断言只会红在「找不到补丁登记」的探针锚点上（报的是环境漂移，
 * 不是真实回退，本仓长期如此）⇒ 按「守护对象已消失」退休，改为**一条显式声明式断言**，
 * 把「该补丁已随上游升级移除」这件事本身钉住（同时把③的现状作为依据核对）。
 *
 * 【若要恢复补丁】不要在断言里放宽：恢复 `pnpm.patchedDependencies` + `patches/`
 * 属**生产依赖配置改动**（设计文档「BUG-7」备选 B，需人批准）。批准后按新版 patch
 * 与新版包的 `lib/` 形态重写本文件的守护，而不是把本断言改宽。
 *
 * @module dsh-pmboard/tests/zero-arg-binding
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本仓根 package.json 的 name（用于向上定位仓库根；替代已消失的 patchedDependencies 锚点）。 */
const ROOT_PACKAGE_NAME = 'dsh-pmboard'
/** 已退休的被守护包（历史补丁目标）。 */
const RETIRED_PACKAGE = '@deepseek-ai/dsh-ptc-runtime-node'
/** 已退休包在 pnpm 虚拟店里的条目前缀。 */
const RETIRED_STORE_PREFIX = '@deepseek-ai+dsh-ptc-runtime-node@'
/** 现行依赖包（`@deepseek-ai/dsh-tools` 的 peer/传递依赖）。 */
const CURRENT_PACKAGE = '@deepseek-ai/dsh-ptc-runtime'
/** 现行依赖版本读数（上游升级后若本条红，请先核对新包是否仍无被守护文件，再更新该读数）。 */
const CURRENT_VERSION = '0.2.0-rc.1'
/** 被守护文件（历史）：包内 `lib/process.js`。 */
const GUARDED_SOURCE = join('lib', 'process.js')

interface RootManifest {
  name?: string
  pnpm?: { patchedDependencies?: Record<string, string> }
}

/** 从本测试文件向上找到仓库根（锚 = package.json 的 name === dsh-pmboard）。 */
function findRepoRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    const manifestPath = join(dir, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RootManifest
        if (manifest.name === ROOT_PACKAGE_NAME) return dir
      } catch {
        // 不是我们要找的清单，继续向上
      }
    }
    const parent = dirname(dir)
    if (parent === dir) throw new Error('向上未找到 name === ' + ROOT_PACKAGE_NAME + ' 的仓库根 package.json')
    dir = parent
  }
}

/** pnpm 虚拟店条目名（缺 node_modules 时返回空表，交由断言给出可读失败）。 */
function pnpmStoreEntries(root: string): string[] {
  const store = join(root, 'node_modules', '.pnpm')
  return existsSync(store) ? readdirSync(store) : []
}

/** 现行依赖在 pnpm 虚拟店里的安装目录 + 版本（找不到则抛，并点名期望的候选前缀）。 */
function findInstalledRuntime(root: string): { dir: string; version: string } {
  const prefix = '@deepseek-ai+dsh-ptc-runtime@'
  const entries = pnpmStoreEntries(root).filter((entry) => entry.startsWith(prefix)).sort()
  for (const entry of entries) {
    const dir = join(root, 'node_modules', '.pnpm', entry, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime')
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string }
    return { dir, version: manifest.version ?? '(清单无 version)' }
  }
  throw new Error(
    '未在 pnpm 虚拟店找到 ' + CURRENT_PACKAGE + '（候选前缀 ' + prefix + '，先执行 pnpm install）；'
    + '实际条目：' + entries.join(' | '),
  )
}

describe('零参绑定守护（已退休：守护对象随上游升级消失）', () => {
  it('声明式断言：根 package.json 无 pnpm.patchedDependencies 且 patches/ 不存在，现依赖 dsh-ptc-runtime@0.2.0-rc.1 已无被守护的 lib/process.js', () => {
    const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as RootManifest

    // ① 没有补丁登记（连 pnpm 字段都没有）
    expect(
      manifest.pnpm?.patchedDependencies,
      '根 package.json 重新出现 pnpm.patchedDependencies：若确要恢复零参绑定补丁'
      + '（设计「BUG-7」备选 B，需人批准），请按新版 patch 与新版包的 lib/ 形态重写本文件的守护，'
      + '而不是放宽本条断言',
    ).toBeUndefined()
    // ② 没有 patches 目录
    expect(
      existsSync(join(root, 'patches')),
      'patches/ 目录重新出现：与①同判——要么是补丁真的回来了（重写守护），要么是本仓多出一份无登记的补丁',
    ).toBe(false)
    // ③ 被守护包已不在安装树（守护对象整体消失）
    expect(
      pnpmStoreEntries(root).filter((entry) => entry.startsWith(RETIRED_STORE_PREFIX)),
      RETIRED_PACKAGE + ' 重新出现在安装树里：该补丁的对象回来了，请按新版锚点重建守护',
    ).toEqual([])
    // ④ 现状依据：现行依赖已无被守护的 lib/process.js
    const current = findInstalledRuntime(root)
    expect(current.version, CURRENT_PACKAGE + ' 版本读数变化：先核对新包 lib/ 形态再更新读数').toBe(CURRENT_VERSION)
    expect(
      existsSync(join(current.dir, GUARDED_SOURCE)),
      CURRENT_PACKAGE + '@' + current.version + ' 已无被守护的 ' + GUARDED_SOURCE
      + '（零参绑定补丁随上游升级移除的依据）',
    ).toBe(false)
  })
})
