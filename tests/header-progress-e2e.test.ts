/**
 * 端到端场景用例（REQ-260930230225-71be）：会话头部流程图「模型 → 样式 → 真实浏览器布局」整链跑一遍。
 *
 * 为什么要有它：本需求的交付跨了模型层 / 视图层 / 样式层三个文件，单测与静态断言只能证明
 * 「规则写在文件里」，证明不了「真实浏览器里标题行没被撑破、档位按宽度降级、详情面板与会话框左边对齐」。
 * 这条用例把 »scripts/header-progress-probe.mts« 当成被测系统整体驱动，断言的是**可观察终态**：
 *   - 探针退出码 0（全档通过）
 *   - 六行 DIAG 每行 problems=NONE，且 rowRightOverflow=-12（行内）、docOverflow=0（文档不横向溢出）
 *   - 末行 PROBE PASS
 * 降级模式同理（无容器语义 → 全量渲染 + 行不溢出）。
 *
 * 环境依赖：需要本机 Chrome。找不到浏览器时探针按设计退出码 2，本用例**响亮失败**并给出修复指引
 * （与探针同一哲学：不静默跳过）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((p): p is string => typeof p === 'string' && p.length > 0)

/** 跑一次探针，返回退出码与合并输出（非零退出不抛，交给断言判）。 */
function runProbe(extraArgs: readonly string[]): { code: number; out: string } {
  try {
    const out = execFileSync('./node_modules/.bin/tsx', ['scripts/header-progress-probe.mts', ...extraArgs], {
      encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: typeof err.status === 'number' ? err.status : -1, out: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}

function requireChrome(): void {
  const hit = CHROME_CANDIDATES.find(p => existsSync(p))
  if (hit === undefined) {
    throw new Error('端到端用例需要本机 Chrome：请设置 CHROME_BIN 或安装 Google Chrome 后重跑'
      + '（探针找不到浏览器按设计退出码 2，本用例不静默跳过）')
  }
}

describe('TC-E2E 会话头部流程图端到端（真实浏览器渲染）', () => {
  it('六档视口：标题行不溢出 / 档位可见集正确 / 面板与会话框左边对齐', () => {
    requireChrome()
    const { code, out } = runProbe([])
    expect(code, '探针应全档通过（退出码 0）\n' + out).toBe(0)
    const diagLines = out.split('\n').filter(l => l.startsWith('DIAG '))
    expect(diagLines).toHaveLength(6)
    for (const line of diagLines) {
      expect(line).toContain('problems=NONE')
      expect(line).toMatch(/rowRightOverflow=-12(\.0)?\b/)
      expect(line).toContain('docOverflow=0')
    }
    expect(out).toContain('PROBE PASS')
  }, 600_000)

  it('降级路径：无容器语义时全量渲染（token/连线/节点名全显）且行不溢出', () => {
    requireChrome()
    const { code, out } = runProbe(['--fallback'])
    expect(code, '降级模式应通过（退出码 0）\n' + out).toBe(0)
    const diagLines = out.split('\n').filter(l => l.startsWith('DIAG fallback'))
    expect(diagLines).toHaveLength(5)
    for (const line of diagLines) {
      expect(line).toContain('problems=NONE')
      expect(line).toContain('labels=7')
      expect(line).toContain('links=6')
    }
    expect(out).toContain('PROBE PASS')
  }, 600_000)
})
