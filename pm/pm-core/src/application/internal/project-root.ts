/**
 * 项目根的**路径纯函数**（REQ-261005141830-7a3b t1）——从 `internal/support.ts` 原样搬出。
 *
 * 为什么单独一个模块：本需求新增的「同一项目判据」`sameProjectOf`（`project-identity.ts`）
 * 要复用这里的路径比较，而 `support.ts` 之后要反向依赖 `project-identity.ts`（取根时按项目 id）——
 * 把这两组纯函数留在同一个文件会形成 import 环。搬出后依赖方向单向：
 *
 * ```
 *   project-root.ts（零依赖，纯路径）
 *        ▲                    ▲
 *        │                    │
 *   support.ts          project-identity.ts（零依赖 project-root）
 *        └────────┬───────────┘
 *                 ▼
 *        support.ts 依赖 project-identity（t3 起）
 * ```
 *
 * 零行为变更：函数体与搬迁前逐字一致；`support.ts` 继续**再导出**这三个名字，
 * 既有调用方（`QueryKnowledge` / `EnsureKnowledgeLayer` / `ArtifactSync` / 测试）的 import 路径不变。
 *
 * @module dsh-pmboard/application/internal/project-root
 */

/**
 * 路径**形状**归一（纯字符串，零 IO）：反斜杠 → 正斜杠、折叠重复斜杠、去尾斜杠。
 * 保留根 `/` 与 Windows 盘符形态；不做 realpath——那是解算器的事（见下）。
 */
export function normalizeProjectRoot(p: string): string {
  const q = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const trimmed = q.length > 1 ? q.replace(/\/+$/, '') : q
  return trimmed
}

/**
 * 同项目判定：先形状归一，若给了 `realpath` 解算器再各自解析后比较（软链等价）。
 *
 * **为什么把 realpath 做成可注入参数、而不在这里直接引文件系统**：
 * 本仓 `tests/layer-boundary.test.ts` 规定 `application/` 不得 import `node:` 内置模块
 * （一切 I/O 走端口）。纯函数里直接引 fs 会新增一条越界；故由调用方（适配器 / 测试）注入解算器，
 * 不注入时退化为形状比较——仍然满足「尾斜杠不得判为错配」这条硬要求。
 *
 * ⚠️ 本注释刻意**不写出** import 语句的字面形状：该门禁扫的是文件原文、不剥注释，
 * 写了「from + 模块名」的示例会被当成真 import 点名（搬迁前 `support.ts` 就是这么被点名的）。
 */
export function sameProjectRoot(a: string, b: string, realpath?: (p: string) => string): boolean {
  const na = normalizeProjectRoot(a)
  const nb = normalizeProjectRoot(b)
  if (na === nb) return true
  if (realpath === undefined) return false
  const ra = safeRealpath(realpath, na)
  const rb = safeRealpath(realpath, nb)
  return ra === rb
}

/** 解算器可能抛（路径不存在等）——解析失败时退回原值，绝不让比较动作抛出。 */
function safeRealpath(realpath: (p: string) => string, p: string): string {
  try {
    return normalizeProjectRoot(realpath(p))
  } catch {
    return p
  }
}
