/**
 * 工具面根的**布局无关**解析（REQ-261009174713-7bc8 · t15）。
 *
 * 为什么要有它：工具面正要搬进 `pm/tool-pm/src/`（19 工具按 intake/decompose/verify/collab
 * 四目录重组）。若判据写死 `pm/tool-pm/src`，搬迁当刻就会红一片「判据没跟包」，而逐个去补又要再冒一次错。
 * 本模块让**判据先就位**：工具根在哪边存在就用哪边，遍历一律**递归**——两种布局都跑得通。
 *
 * 搬迁完成后本模块可以退化成一行常量；但它作为「判据不依赖具体布局」的写法本身是值得保留的。
 *
 * @module tests/helpers/tools-root
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = fileURLToPath(new URL('../..', import.meta.url))

/** 工具面根的**仓库相对**路径：搬迁前 `pm/tool-pm/src`，搬迁后 `pm/tool-pm/src`。 */
export function toolsRootRel(): string {
  return existsSync(join(REPO, 'src', 'tools')) ? 'pm/tool-pm/src' : 'pm/tool-pm/src'
}

/** 工具面根的绝对路径。 */
export function toolsRoot(): string {
  return join(REPO, toolsRootRel())
}

/** 递归收集工具根下的全部 `.ts`（两布局通用；目录层级不参与判据）。 */
export function toolsFiles(root: string = toolsRoot()): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) walk(abs)
      else if (name.endsWith('.ts')) out.push(abs)
    }
  }
  walk(root)
  return out.sort()
}

/**
 * 工具**目录名**集合——按内容识别（含同名 `.ts` 的目录才算工具目录），
 * 所以扁平布局（`pm/tool-pm/src/CreateTool/`）与两级布局（`…/intake/CreateTool/`）给出同一集合。
 */
export function toolDirNames(root: string = toolsRoot()): string[] {
  const names: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (!existsSync(dir) || depth > 3) return
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (!statSync(abs).isDirectory()) continue
      if (existsSync(join(abs, name + '.ts'))) names.push(name)
      else walk(abs, depth + 1)
    }
  }
  walk(root, 0)
  return names.sort()
}

/**
 * 按**工具名**解析其所在目录（布局无关：扁平 `…/CreateTool/` 与两级 `…/intake/CreateTool/` 都能找到）。
 * 判据点请一律用它，**不要**手拼 `join(root, 'CreateTool')` 或 `'pm/tool-pm/src/CreateTool/…'`——
 * 那正是 t15 前三次尝试里「代码搬对了、判据没跟包」的红源。
 */
export function toolDir(tool: string, root: string = toolsRoot()): string {
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (!existsSync(dir) || depth > 3) return
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (!statSync(abs).isDirectory()) continue
      if (name === tool && existsSync(join(abs, tool + '.ts'))) found.push(abs)
      else walk(abs, depth + 1)
    }
  }
  walk(root, 0)
  if (found.length === 0) throw new Error('工具目录未找到：' + tool + '（根 ' + root + '）')
  return found[0]!
}

/** 按工具名 + 文件名解析绝对路径（布局无关）。 */
export function toolFile(tool: string, file: string, root: string = toolsRoot()): string {
  return join(toolDir(tool, root), file)
}

/** 同上，但给"仓库根相对"口径的读取器用（如 `read(rel)`）。 */
export function toolFileRel(tool: string, file: string, rootRel: string = toolsRootRel()): string {
  const dir = toolDir(tool)
  return rootRel + '/' + dir.slice(toolsRoot().length + 1) + '/' + file
}
