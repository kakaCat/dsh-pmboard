/**
 * 测试根的**唯一事实源**（REQ-261006201814-ac4f FR-5 / t2）。
 *
 * ## 为什么要有这个模块
 *
 * 改前本仓有**两套**测试根策略：`tests/helpers/tool-deps.ts` 里有一套安全兜底（cwd 在仓库内
 * 就落到临时根），而 `tests/application/harness.ts` 的 `FakeDocs.workspaceRoot()` **恒返回 `.`**。
 * 于是同一批用例里，「走 tool-deps 的」写 /tmp、「走 harness 的」写真实工作树——
 * 而 harness 的合成需求默认 id 恰好是 `REQ-000001`，撞上仓里**真实存在且被 git 跟踪**的同名目录。
 *
 * 一条写链（静态逐行验证过）：
 * ```
 *   harness.ts:586  FakeDocs.workspaceRoot() → '.'
 *        │
 *        ▼
 *   rtm-yaml.ts:176-177  syncRTMYamlWithSnapshot(deps.docs.workspaceRoot())
 *        │
 *        ▼
 *   vendor/reqboard/src/rtm/file-io.ts:42-43   join(root,'docs','requirements',reqId)
 *        │
 *        ▼
 *   <cwd>/docs/requirements/REQ-000001/rtm-*.yml   ← 真实工作树被改写
 * ```
 * `makeHarness` 被 108 个文件 / 278 处调用，这条链是 Tier A 全部泄漏的唯一出口。
 *
 * ## 两套策略合并成一套
 *
 * 本模块是那两套策略的合并点：`tool-deps` 与 `harness` 都从这里取根，**不再各写一份**。
 * 语义与改前 `tool-deps.ts` 内的实现**逐字一致**（含 macOS `/var` ↔ `/private/var` 软链比较），
 * 故既有用例的行为零变更（FR-9① 存量兼容）。
 *
 * @module dsh-pmboard/tests/helpers/workspace-root
 */
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（`tests/helpers/` → 上溯两级）。绝对路径，未做 realpath（调用方按需）。 */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 进程级临时根缓存（一个 worker 进程一份）。 */
let wsRootCache: string | undefined

/**
 * 测试用的默认文档根（惰性创建，一个 worker 进程一份）。
 *
 * 存在的唯一目的：让「忘了传 workspaceRoot」的用例写到 /tmp，而不是写进仓库。
 * 实测代价（改前）：跑一次全量测试多出 44 个文件；历史上有 8717 个这样的产物被提交进仓库。
 */
export function testWorkspaceRoot(): string {
  if (wsRootCache === undefined) wsRootCache = mkdtempSync(join(tmpdir(), 'pmboard-ws-'))
  return wsRootCache
}

/** 每文件一份的临时根缓存（键 = 调用方文件 URL）。 */
const perFileCache = new Map<string, string>()

/**
 * **每文件一份**的临时根（惰性，按调用文件的 `import.meta.url` 记忆化）。
 *
 * 为什么需要它（进程级根不够）：同一文件内多个用例共享一个根，同 id 的需求会**互相串档**
 * ——`tests/helpers/tool-deps.ts` 的注释已记过这笔账（file 底座若共用 workspaceRoot，
 * 同 id 需求会互相污染）。需要隔离的用例改调本函数即可。
 */
export function perFileWorkspaceRoot(importerUrl: string): string {
  const existing = perFileCache.get(importerUrl)
  if (existing !== undefined) return existing
  const created = mkdtempSync(join(tmpdir(), 'pmboard-file-'))
  perFileCache.set(importerUrl, created)
  return created
}

/**
 * 解析本次测试的文档根（安全兜底）：
 *   - 显式传了 workspaceRoot → 用它；
 *   - cwd 是**系统临时目录**（测试自己 chdir 过去了）→ 沿用它，保持既有语义；
 *   - 其余 cwd（**仓库内任何目录**，含包目录）→ 用进程级临时目录兜底，绝不写进仓库。
 *
 * 必须用 realpath 比较：macOS 上 `tmpdir()` 给 `/var/...`，而 chdir 后 `process.cwd()` 是
 * `/private/var/...`（`/var` 是软链）——直接字符串比较会判成「不在临时目录」而误兜底。
 */
export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit !== undefined) return explicit
  const real = (p: string): string => {
    try { return realpathSync(p).replace(/\\/g, '/') } catch { return p.replace(/\\/g, '/') }
  }
  const cwd = real(process.cwd())
  const tmp = real(tmpdir()).replace(/\/+$/, '')
  // 只有「测试自己 chdir 到的临时目录」才沿用 cwd；**仓库内任何目录一律兜底到临时根**。
  // 只判「是不是包目录」不够：从 agent-dh 目录跑测试时，产物会写进真实的 agent-dh/docs/requirements/
  // （实测：一次误从仓库根跑，污染了 120+ 个文件）。
  return cwd === tmp || cwd.startsWith(tmp + '/') ? process.cwd() : testWorkspaceRoot()
}

/** 某路径是否落在系统临时目录下（守卫与自检共用；realpath 后比较，避开软链误判）。 */
export function isUnderTempDir(p: string): boolean {
  const real = (x: string): string => {
    try { return realpathSync(x).replace(/\\/g, '/') } catch { return x.replace(/\\/g, '/') }
  }
  const tmp = real(tmpdir()).replace(/\/+$/, '')
  const target = real(p)
  return target === tmp || target.startsWith(tmp + '/')
}
