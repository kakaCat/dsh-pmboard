/**
 * 尺寸门禁（REQ-47939a t9 / A2）——把 requirement.md §7 A2（"宿主单文件 ≤400 行"）变成
 * **可失败的机械检查**，并锁死"src/host/ 整目录已删除"这一收口结果。
 *
 * 为什么白名单必须在测试内显式列出并逐条注明理由：尺寸门禁最容易被"为了让测试过"而软化——
 * 随手加一行白名单就能让超标文件永远合法，门禁从此静默失效（本仓已多次踩"门禁失效而假绿"）。
 * 故此处三层防滥用：
 *   ① 白名单**内容**硬编码在测试里，且 key 必须落在后续任务负责的范围（client/）；
 *   ② 每条白名单**必须**带非空理由，否则红；
 *   ③ 白名单条目**必须仍然超限**（t11/t12 拆完后条目自动变红 → 强制清理，白名单不会只增不减）。
 * 白名单**只**包含属于后续任务（t11/t12/t13）的文件——t9 不得为了过测试去拆它们（那是后续卡的范围）。
 */
import { describe, it, expect } from 'vitest'
import { repoPath } from 'tests/helpers/repo-root.js'
import { readdirSync, readFileSync, existsSync } from 'node:fs'

import {  join, relative } from 'node:path'

const SRC = repoPath('src')
const MAX_LINES = 400

/** 递归列出 src 下的 .ts 文件（绝对路径）。 */
function listTs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 行数（与 wc -l 同口径：不计结尾换行产生的空尾行）。 */
function lineCount(file: string): number {
  const text = readFileSync(file, 'utf8')
  if (text.length === 0) return 0
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

const rel = (p: string): string => p.slice(SRC.length + 1).replace(/\\/g, '/')

/**
 * 白名单（仅限后续任务负责的文件；t9 不拆它们）：
 *  key = src 相对路径；reason 必须说明"谁负责拆"。
 */
const WHITELIST: Readonly<Record<string, string>> = {
  // t11 已完成：client/view.ts 拆到 client/views/* + render/dom-utils.ts（≤400），条目按门禁要求删除。
  // t12 已完成：client/styles.ts 拆到 client/styles/*（拼接后 CSS 逐字节不变，styles.ts 降为汇总），条目按门禁要求删除。
  'client/stage-panel.ts': '663 行 → t11 卡面只拆 view.ts（分片目的地是 views/* 与 render/dom-utils.ts）；本文件是会话节点详情渲染器（另一模块），留待后续 P2/独立卡',
  'client/board-mount.ts': '627 行 → t11 卡面只拆 view.ts；本文件承担看板生命周期/事件委派/SSE 编排，留待后续 P2/独立卡',
  // REQ-261009174713-7bc8 t5 已完成：shared/protocol.ts 拆半（纯帧半 → pm-common、
  // 域关联半 → pm-core），旧路径降为 13 行 barrel，条目按门禁要求删除。
  // 注意：两半落在 pm/*/src 下，不在本门禁当前扫描面内——扫描面是否要跟着拆包走，
  // 由十九包重构的收口卡（t22/t12）定，别在这里悄悄放宽。
}

/** 白名单只允许出现在这些前缀下（防止把 domain/application/adapters/tools/http 的超标文件塞进来）。 */
const WHITELIST_SCOPE = [/^client\//]

/** client 面根（布局无关：搬迁前后各一处）。 */
const CLIENT_SRC = existsSync(join(SRC, 'client'))
  ? join(SRC, 'client')
  : repoPath('pm-client/src')
/** 扫描双根；包内路径**归一回** `client/...`，于是白名单与 WHITELIST_SCOPE 一字不用改。 */
const allTs = [
  ...listTs(SRC).filter((f) => !f.startsWith(join(SRC, 'client'))),
  ...listTs(CLIENT_SRC),
]
const relOf = (f: string): string =>
  f.startsWith(CLIENT_SRC) ? 'client/' + relative(CLIENT_SRC, f).replace(/\\/g, '/') : rel(f)

describe('尺寸门禁（REQ-47939a A2：宿主单文件 ≤400 行）', () => {
  it('扫描器自检：至少扫到 20 个 .ts 文件（防目录写错而静默通过）', () => {
    expect(allTs.length).toBeGreaterThanOrEqual(20)
  })

  it('src 下所有 .ts 单文件 ≤ ' + MAX_LINES + ' 行（白名单见 WHITELIST，逐条带理由）', () => {
    const offenders = allTs
      .map(f => ({ path: relOf(f), lines: lineCount(f) }))
      .filter(x => x.lines > MAX_LINES && WHITELIST[x.path] === undefined)
    expect(offenders, '超标文件（未在白名单内）：\n' + offenders.map(o => o.path + ' = ' + o.lines + ' 行').join('\n')).toEqual([])
  })

  it('白名单防滥用：条目在后续任务范围内、逐条有理由、且当前确实超限（拆完即须删条目）', () => {
    const problems: string[] = []
    for (const [path, reason] of Object.entries(WHITELIST)) {
      const abs = path.startsWith('client/') ? join(CLIENT_SRC, path.slice('client/'.length)) : join(SRC, path)
      if (!existsSync(abs)) { problems.push(path + '：文件不存在（白名单失效，应删除条目）'); continue }
      if (!WHITELIST_SCOPE.some(re => re.test(path))) problems.push(path + '：不在允许范围（client/ 或 shared/protocol.ts）内')
      if (typeof reason !== 'string' || reason.trim().length < 10) problems.push(path + '：缺少说明"谁负责拆"的理由')
      const n = lineCount(abs)
      if (n <= MAX_LINES) problems.push(path + '：当前 ' + n + ' 行已不超限，白名单条目应删除（否则白名单只增不减）')
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('src/host/agent-tools.ts 不存在（A2 后半：旧工具入口已收口）', () => {
    expect(existsSync(join(SRC, 'host/agent-tools.ts'))).toBe(false)
  })

  it('src/host/ 整目录已删除（t9 收口：不得留下任何旧路径）', () => {
    expect(existsSync(join(SRC, 'host'))).toBe(false)
  })
})
