/**
 * 客户端构建戳（REQ-261001124111-5d36 t4）——把「页面跑的是哪一版前端代码」变成可比较的事实。
 *
 * 事故出处：修好的刷新逻辑写进源码（10:57）但构建产物到 12:42 才产出，用户 12:40 截图看到的
 * 是修复前的旧 bundle，只能靠**手动刷新页面**换代码；面板连"我这一版是旧的"都说不出来。
 *
 * 口径（必须与 `scripts/wrap-client.mjs` 完全一致，否则恒误报）：
 *   stamp = sha256(lib/client.cjs 内容) 的前 12 位十六进制
 * 为什么取 `client.cjs` 而不是 `client.js`：`client.js` 由 wrap 写入、戳就写在它体内，
 * 对自身内容取哈希是自指（写完即变）；`client.cjs` 是它的输入，两端都能拿到同一个值。
 *
 * @module dsh-pmboard/http/client-build
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 戳长度（十六进制字符数）——12 位足够区分开发期迭代，又不至于把帧撑大。 */
export const STAMP_CHARS = 12

/**
 * 定位 `lib/client.cjs`：**从本模块所在目录逐级向上找**，而不是写死相对层数。
 *
 * 为什么要找而不是拼：本模块在两种形态下运行——源码（`src/http/`）与打包产物（`dist/index.mjs`），
 * 相对层数不同（`../../lib` vs `../lib`）；`new URL(..., import.meta.url)` 还会被打包器改写。
 * 逐级向上找对两者都成立，且找不到时老实返回 undefined（不猜路径）。
 */
export function clientCjsPath(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 4; i += 1) {
    const candidate = join(dir, 'lib', 'client.cjs')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * 当前磁盘上客户端构建的戳；读不到文件 → `undefined`（调用方须**不声称**，见 SSE 帧的注释）。
 */
export function clientBuildStamp(): string | undefined {
  const file = clientCjsPath()
  if (file === undefined) return undefined
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, STAMP_CHARS)
  } catch {
    return undefined
  }
}
