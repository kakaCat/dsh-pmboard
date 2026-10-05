/**
 * 全工具渲染覆盖（REQ-261002173819-69c7 t4 / serves: FR-4）——性质测试，不是逐工具点名单。
 *
 * 病根：`defineTool` 的 `output.render` 缺失时，宿主渲染该工具输出会抛
 * `output.render failed: userRender is not a function`，把**已经生效**的副作用报成
 * `INVALID_TOOL_OUTPUT`——2026-10-02 实测 `reqboard_clear_pause` 就这样：台账确实从 armed 变
 * disarmed，调用方却只拿到一个渲染错误，无法判断锁开没开。
 *
 * 为什么写成扫描而不是逐个断言：全仓 20+ 工具、20+ 次新增/改名，逐个列举必然漏。这里只回答
 * 一个问题——"凡是用 defineTool 定义的工具，都声明了 render 吗"，并给白名单一个显式理由。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TOOLS_DIR = 'src/tools'

/**
 * 委托别名的白名单：这些文件**不自己**调 defineTool 输出定义，而是 `Object.assign` 复用另一个
 * 工具的工厂对象 —— `render` 在运行时被一并继承，源码里自然搜不到 `render:`。
 * 加白名单必须同时写清"继承自谁"，否则就是在掩盖真实缺口。
 */
const DELEGATING_ALIASES: Readonly<Record<string, string>> = {
  'src/tools/TaskExecuteTool/TaskExecuteTool.ts': 'obj.assign 复用 defineAdvanceTool（含其 output.render）',
}

interface ToolSource { path: string; source: string }

function collectToolSources(): ToolSource[] {
  const out: ToolSource[] = []
  for (const entry of readdirSync(TOOLS_DIR)) {
    const dir = join(TOOLS_DIR, entry)
    if (!statSync(dir).isDirectory()) continue
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('Tool.ts')) continue
      const p = join(dir, file)
      out.push({ path: p, source: readFileSync(p, 'utf8') })
    }
  }
  return out
}

/** 纯函数版扫描（T-2 自测直接喂假源码，证明它真的会红）。 */
export function findToolsMissingRender(sources: readonly ToolSource[], aliases: Readonly<Record<string, string>> = {}): string[] {
  const missing: string[] = []
  for (const { path, source } of sources) {
    if (!source.includes('defineTool(')) continue // 不是工具定义文件（如纯 prompt/index 模块）
    if (aliases[path] !== undefined) continue
    if (!/render\s*:/.test(source)) missing.push(path)
  }
  return missing
}

describe('FR-4 · 全工具都必须声明 output.render', () => {
  it('T-1：src/tools 下每个 defineTool 定义都带 render（白名单只有委托别名）', () => {
    const sources = collectToolSources()
    // 前置断言：扫描面不能为空，否则"全绿"毫无意义
    expect(sources.length).toBeGreaterThan(15)
    const missing = findToolsMissingRender(sources, DELEGATING_ALIASES)
    expect(missing, '缺 render 的工具（宿主渲染会报 userRender is not a function）：' + missing.join('、')).toEqual([])
  })

  it('T-2：扫描函数本身会红（喂一份缺 render 的样例源码）', () => {
    const bad: ToolSource[] = [{ path: 'src/tools/__probe/ProbeTool.ts', source: 'export const t = defineTool({ name: "x", description: "d" })' }]
    expect(findToolsMissingRender(bad)).toEqual(['src/tools/__probe/ProbeTool.ts'])
    // 反向：带 render 的同形源码不得被判红
    const good: ToolSource[] = [{ path: 'src/tools/__probe/ProbeTool.ts', source: 'export const t = defineTool({ name: "x", output: { render: f } })' }]
    expect(findToolsMissingRender(good)).toEqual([])
    // 白名单只免"委托别名"，不免"没写 render 的普通工具"
    expect(findToolsMissingRender(bad, { 'src/tools/__probe/ProbeTool.ts': '继承自别处' })).toEqual([])
  })

  it('T-2b：clear_pause 工具确实声明了 render（本卡修的就是它）', () => {
    const p = join('src/tools', 'ClearPauseTool', 'ClearPauseTool.ts')
    const source = readFileSync(p, 'utf8')
    expect(source).toMatch(/render\s*:/)
    expect(source).toContain('clearPauseSummary')
    expect(relative(process.cwd(), p).length).toBeGreaterThan(0)
  })
})
