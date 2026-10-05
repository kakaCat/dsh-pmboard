/**
 * 看板链接（board_link）的工具契约回归（REQ-261004111917-f473 · serves: FR-4 · TC-10）。
 *
 * 两件事必须同时成立，缺一即红：
 *   ① **描述要如实**：三处 schema 文案从「可在会话中点击跳转」（旧 SPA 时代口径）改成
 *      「点击后在应用内打开看板并定位该需求」（现状口径：宿主兼容入口 + 客户端消费端）；
 *   ② **产出值一字不改**：`board_link` 的字符串仍是 `/dashboard#pmboard?req=<REQ>`
 *      ——PM 引导段与外部消费者依赖它（需求边界第 2 条），改值属于破坏性变更。
 *
 * 手法与仓内既有 tests/tools-schema.test.ts 同款：构造工具读 schema（行为面）+
 * 源码级逐字锁定（防「文档说一套、代码写另一套」）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as toolModules from '../src/tools/index.js'

const deps = {} as never

/** 造一个工具实例（defineTool 编译 schema 不触碰 deps 执行路径）。 */
function build(factory: string): Record<string, unknown> {
  const fn = (toolModules as unknown as Record<string, (d: unknown) => Record<string, unknown>>)[factory]
  expect(typeof fn, factory + ' 未导出').toBe('function')
  return fn(deps)
}

function boardLinkProp(tool: Record<string, unknown>): { type?: string; description?: string } | undefined {
  const propsOf = (bag: unknown): Record<string, { type?: string; description?: string }> | undefined => {
    const b = bag as { properties?: Record<string, { type?: string; description?: string }>; schema?: unknown } | undefined
    // 输出侧是 { schema: { properties } }（实测），入参侧是 { properties }
    const fromSchema = (b?.schema as { properties?: Record<string, { type?: string; description?: string }> } | undefined)?.properties
    return fromSchema ?? b?.properties
  }
  return propsOf(tool.output)?.['board_link'] ?? propsOf(tool.parameters)?.['board_link']
}

const WITH_LINK = ['defineStatusTool', 'defineCaptureTool', 'defineCreateTool'] as const

describe('board_link schema 文案（REQ-261004111917-f473 FR-4 · TC-10）', () => {
  for (const factory of WITH_LINK) {
    it(factory + '：描述说清「点击后在应用内打开并定位」，不再写「可在会话中点击跳转」', () => {
      const prop = boardLinkProp(build(factory))
      const desc = prop?.description ?? ''
      expect(desc.length).toBeGreaterThan(0)
      expect(desc).toContain('并定位')
      expect(desc).not.toContain('可在会话中点击跳转')
      // 契约护栏（复核补强）：字段名与类型也不许动——改名会让 desc 落空变红，但改类型不会
      expect(prop?.type).toBe('string')
    })
  }

  it('源码级清扫：src/tools 下不再有任何「可在会话中点击跳转」的旧口径', () => {
    const dir = fileURLToPath(new URL('../src/tools', import.meta.url))
    const files: string[] = []
    const walk = (root: string): void => {
      const fs = require('node:fs') as typeof import('node:fs')
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        const p = root + '/' + e.name
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts')) files.push(p)
      }
    }
    walk(dir)
    expect(files.length).toBeGreaterThanOrEqual(15)
    const stale = files.filter(f => readFileSync(f, 'utf8').includes('可在会话中点击跳转'))
    expect(stale, '仍写着旧口径的文件：' + stale.join('、')).toEqual([])
  })
})

/**
 * 产出值逐字锁定：三处生产者必须继续给出 `/dashboard#pmboard?req=<REQ>`。
 * 为什么用源码级断言：这三处的上下文（QueryState 的 open 列表、CreateRequirement/CaptureRequirement
 * 的台账写入）都要重型依赖才能跑到，而这里要钉死的是**字符串形状**本身。
 */
describe('board_link 产出值逐字锁定（REQ-261004111917-f473 FR-4）', () => {
  const CASES: Array<{ file: string; pattern: RegExp; label: string }> = [
    {
      file: 'src/application/query/QueryState.ts',
      pattern: /board_link:\s*open\.length > 0 \? `\/dashboard#pmboard\?req=\$\{open\[0\]\.id\}` : '\/dashboard#pmboard'/,
      label: 'QueryState（有进行中需求给深链，否则只给看板）',
    },
    {
      file: 'src/application/use-cases/CreateRequirement.ts',
      pattern: /board_link:\s*`\/dashboard#pmboard\?req=\$\{req\.id\}`/,
      label: 'CreateRequirement（新建即给该需求深链）',
    },
    {
      file: 'src/application/use-cases/CaptureRequirement.ts',
      pattern: /board_link:\s*'\/dashboard#pmboard\?req=' \+ req\.id/,
      label: 'CaptureRequirement（立项即给该需求深链）',
    },
  ]

  for (const c of CASES) {
    it(c.label + ' 的 board_link 仍是 /dashboard#pmboard?req=… 形态', () => {
      const src = readFileSync(fileURLToPath(new URL('../' + c.file, import.meta.url)), 'utf8')
      expect(src).toMatch(c.pattern)
      // 反向：该文件里每个 board_link 赋值都必须以 /dashboard#pmboard 开头
      // （换协议、换路径、换成相对路径都算破坏外部契约）
      const assignments = src.match(/board_link:\s*[^,\n]+/g) ?? []
      expect(assignments.length).toBeGreaterThan(0)
      for (const a of assignments) {
        expect(a, '可疑的 board_link 赋值：' + a).toMatch(/\/dashboard#pmboard/)
      }
    })
  }

  it('三处都指向同一个路径前缀 /dashboard#pmboard（不出现第二个真相）', () => {
    const prefixes = new Set<string>()
    for (const c of CASES) {
      const src = readFileSync(fileURLToPath(new URL('../' + c.file, import.meta.url)), 'utf8')
      const m = /\/dashboard#pmboard/.exec(src)
      prefixes.add(m?.[0] ?? '(缺失)')
    }
    expect([...prefixes]).toEqual(['/dashboard#pmboard'])
  })
})
