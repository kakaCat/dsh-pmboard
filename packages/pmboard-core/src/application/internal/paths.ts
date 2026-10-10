/**
 * 纯路径判定（REQ-261008020617-088f RF-5）。
 *
 * 为什么要有它：`node:path.isAbsolute` 是**纯字符串函数**（零 I/O），但层门按 import 判——
 * application 一旦 import `node:path` 就记一处越界，哪怕只用这一个函数。把口径搬进来，
 * 越界消失而语义不变：取值与 `path.isAbsolute` 的 POSIX + win32 并集一致。
 *
 * 口径**与 node 逐平台一致**（这一点是实测纠出来的：`node:path.isAbsolute` 在 POSIX 下
 * 认为 `\a` **不是**绝对路径，在 win32 下才是绝对路径——写成"两平台并集"会让 POSIX 上的
 * `\a` 被误判为绝对，属行为变化）：
 *   · 两平台共同：前导 `/`；
 *   · 仅 win32：前导 `\\`；或盘符（字母 + `:`）后跟 `/` 或 `\\`（`C:\x`、`C:/x`）。
 *
 * @module dsh-pmboard/application/internal/paths
 */

/** 是否运行在 win32（与 `node:path.isAbsolute` 的分支同源）。 */
const IS_WIN32 = typeof process === 'object' && process !== null && process.platform === 'win32'

/** 绝对路径判定（与 `node:path.isAbsolute` **逐平台同口径**）。 */
export function isAbsolutePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p[0] === '/') return true
  if (!IS_WIN32) return false
  if (p[0] === '\\') return true
  // 盘符形式：`X:` 后必须紧跟分隔符才算绝对（`C:` 单独不算，与 node 一致）
  return /^[A-Za-z]:[\\/]/.test(p)
}
