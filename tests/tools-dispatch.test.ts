/**
 * t8 工具收敛门禁（REQ-47939a）：9 个工具目录 + reqboard_submit 表驱动分派（禁止大 if）。
 *
 * 静态检查（grep 可证）：分派表 SUBMIT_DISPATCH 存在、execute 分支体**仅一行**用例调用、
 * 没有 `if (kind === ...)` 之类的分支膨胀；9 个工具目录各含三段式三件套。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
// REQ-261006123819-3af3 FR-1：目录清单从登记面派生（手工清单与磁盘漂移过多次，不再手写）。
import { TOOL_REGISTRY } from '../src/tools/registry.js'

const TOOLS = fileURLToPath(new URL('../src/tools', import.meta.url))

describe('t8 · 工具面 13→9 收敛', () => {
  it('src/tools/ 下的工具目录集合与登记面一致，各含 XxxTool.ts + prompt.ts + index.ts（缺件须显式登记留债）', () => {
    const dirs = readdirSync(TOOLS, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
    // 左 = 磁盘机器事实，右 = 唯一手写登记面；两边相等才说明"登记表与磁盘没漂移"。
    // 此前这里是手写数组（停在 18），新增工具目录后门禁红了两天没人管——
    // 手写清单本身也是要维护的产物，故改为派生（REQ-261006123819-3af3 FR-1）。
    expect(dirs).toEqual(TOOL_REGISTRY.map(e => e.dir).sort())
    // 三段式留债（显式登记，不是"从门禁里悄悄漏掉"）：dir → **缺的件**。只列缺的，
    // 没列到的件仍然逐个断言存在（口径比"整目录跳过"严）。收口属工具面清理，不在本需求范围。
    // 2026-09-27（REQ-260927144541-0481）教训：此前只列了 2 个名字，其余 3 个不是"没有债"，
    // 而是被「目录清单少了三个目录」那条红**遮蔽**了——红要逐个解释，不能停在第一条。
    // 2026-10-06（REQ-261006123819-3af3 FR-1）同一现场第二次：目录清单改为派生后，又有 5 个目录
    // 的缺件被暴露出来（此前停在 18 的手写清单把它们整块遮住了）。
    const THREE_PIECE_DEBT: Record<string, readonly string[]> = {
      DecomposeTool: ['prompt.ts'],
      MoveTool: ['prompt.ts'],
      TaskMoveTool: ['prompt.ts'],
      ArchiveAmendTool: ['prompt.ts'], // 描述内联在 ArchiveAmendTool.ts，未拆 prompt.ts
      TaskRefsTool: ['prompt.ts'],
      HandoffTool: ['index.ts'], // 导出面直接指向 HandoffTool.ts
      TaskExecuteTool: ['prompt.ts', 'index.ts'],
      TaskStatusTool: ['prompt.ts', 'index.ts'],
      AdoptTaskTool: ['AdoptTaskTool.ts', 'prompt.ts'], // 工厂在 TaskAdoptTool.ts（文件名不带目录前缀）
      RegenerateTool: ['RegenerateTool.ts', 'prompt.ts'], // 工厂在 index.ts
    }
    for (const d of dirs) {
      for (const piece of [d + '.ts', 'prompt.ts', 'index.ts']) {
        if ((THREE_PIECE_DEBT[d] ?? []).includes(piece)) continue
        expect(existsSync(join(TOOLS, d, piece)), d + '/' + piece + ' 缺失').toBe(true)
      }
    }
    // 留债表不许过期：目录消失、或缺件已补齐 → 这里变红，逼摘牌。
    for (const [d, pieces] of Object.entries(THREE_PIECE_DEBT)) {
      expect(dirs, '留债登记 ' + d + ' 已不在磁盘上——请从 THREE_PIECE_DEBT 摘牌').toContain(d)
      for (const p of pieces) {
        expect(existsSync(join(TOOLS, d, p)), d + ' 的 ' + p + ' 已补齐——请从 THREE_PIECE_DEBT 摘牌').toBe(false)
      }
    }
  })

  it('reqboard_submit：kind → 用例的分派表驱动；execute 分支体仅一行用例调用（无大 if）', () => {
    const src = readFileSync(join(TOOLS, 'SubmitTool', 'SubmitTool.ts'), 'utf8')
    // 分派表存在且四类 kind 各有独立用例
    expect(src).toMatch(/const SUBMIT_DISPATCH:\s*Readonly<Record<string,/)
    for (const kind of ['requirement', 'plan', 'verification', 'archive']) {
      expect(src, 'SUBMIT_DISPATCH 缺少 ' + kind).toContain(kind + ':')
    }
    // execute 分支体：只有取表 + 一行调用
    const execStart = src.indexOf('execute: async (args: unknown, exec: ToolRunContext) => {')
    expect(execStart).toBeGreaterThan(-1)
    const execBody = src.slice(execStart, src.indexOf('},', execStart))
    const callLines = execBody.split('\n').map(l => l.trim()).filter(l => /^return run\(deps, args, exec\)$/.test(l))
    expect(callLines, 'execute 应恰好一行 `return run(deps, args, exec)`').toHaveLength(1)
    // 禁止把 4 个分支写成一串 if
    expect(execBody).not.toMatch(/if\s*\(\s*kind\s*===/)
  })

  it('reqboard_ask_confirm：evidence 路径与弹框路径自动分派（confirm_artifact 并入）', () => {
    const src = readFileSync(join(TOOLS, 'AskConfirmTool', 'AskConfirmTool.ts'), 'utf8')
    expect(src).toContain('confirmArtifact')
    expect(src).toContain('askConfirm')
    expect(src).toMatch(/evidence\.length > 0 \? confirmArtifact\(deps, args, exec\) : askConfirm\(deps, args, exec\)/)
  })

  it('工具壳不含状态字面量比较（状态判断只在 domain——与 layer-boundary 同源）', () => {
    const bad: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (!e.name.endsWith('.ts')) continue
        const text = readFileSync(p, 'utf8')
        if (/status\s*===/.test(text) || /===\s*'(draft|brainstorming|design|decomposing|implementing|accepting|archived|done|canceled)'/.test(text)) bad.push(p)
      }
    }
    walk(TOOLS)
    expect(bad).toEqual([])
  })
})
