/**
 * 位置无关的根常量（REQ-261009174713-7bc8 · t20 第三批前置）。
 *
 * 测试搬进 `packages/<pkg>/tests/` 后，`new URL('../..', import.meta.url)` 这类**按层级**算出来的基址会全部错位。
 * 别名只管 `import`，管不了**路径字符串**——所以路径基址必须改成**与文件位置无关的常量**（本模块）。
 *
 * @module tests/helpers/repo-root
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根绝对路径（不随测试文件位置变化）。 */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** `tests/` 根绝对路径（本地夹具与测试基建）。 */
export const TESTS_ROOT = join(REPO_ROOT, 'tests')

/** 仓库根相对路径拼绝对（读 fixtures / docs / packages 等用）。 */
export function repoPath(rel: string): string {
  return join(REPO_ROOT, rel)
}
