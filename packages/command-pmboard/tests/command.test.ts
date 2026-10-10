/**
 * `/pm` 命令面用例（REQ-261009174713-7bc8 · 卡 t18 验收：注册 / 重复降级 / 无服务降级 / 文法表 / ≥7 例）。
 *
 * 覆盖面：
 *   · 文法表（parse）——空白 / 名称 / 超长 / 旗标 / 非 ASCII 边界；
 *   · 回执文案（render）——逐字取自设计的七条；
 *   · 注册与降级（index）——无 commands 服务不抛、有服务则注册 `pm`、register 抛错时降级不抛。
 *
 * @module command-pmboard/tests/command
 */
import { describe, expect, it } from 'vitest'
import { PM_TITLE_MAX, parsePmCommand } from '../src/parse.js'
import {
  renderBound,
  renderCreated,
  renderUnknown,
  renderUnbound,
  renderUsage,
  renderWindowBound,
  renderWorkspaceUnavailable,
} from '../src/render.js'
import { applyCommandSurface } from '../src/index.js'

const noopDeps = {} as Parameters<typeof applyCommandSurface>[1]

describe('/pm 文法表（parse 是纯函数）', () => {
  it('空输入 → show', () => {
    expect(parsePmCommand('')).toEqual({ kind: 'show' })
  })
  it('纯空白（含 tab/换行）→ show', () => {
    expect(parsePmCommand('   \t\n ')).toEqual({ kind: 'show' })
  })
  it('名称 → create(title)，两端空白被去掉', () => {
    expect(parsePmCommand('  加一个看板导出  ')).toEqual({ kind: 'create', title: '加一个看板导出' })
  })
  it('名称超长（> 120 码点）→ invalid，不落任何数据', () => {
    expect(parsePmCommand('a'.repeat(PM_TITLE_MAX + 1))).toEqual({ kind: 'invalid' })
  })
  it('恰好 120 码点 → 仍可创建（边界含等号）', () => {
    expect(parsePmCommand('a'.repeat(PM_TITLE_MAX))).toEqual({ kind: 'create', title: 'a'.repeat(PM_TITLE_MAX) })
  })
  it('非 ASCII 按码点计数：120 个 emoji 可创建，121 个才是 invalid', () => {
    expect(parsePmCommand('🚀'.repeat(PM_TITLE_MAX)).kind).toBe('create')
    expect(parsePmCommand('🚀'.repeat(PM_TITLE_MAX + 1)).kind).toBe('invalid')
  })
  it('不认旗标：`--flag` 按名称处理（避免「看似支持其实不生效」）', () => {
    expect(parsePmCommand('--flag')).toEqual({ kind: 'create', title: '--flag' })
  })
})

describe('/pm 回执文案（逐字取自设计）', () => {
  it('创建成功：已创建需求 <REQ-ID> · <board_link>', () => {
    expect(renderCreated('REQ-1', 'https://x/req/1')).toBe('已创建需求 REQ-1 · https://x/req/1')
  })
  it('创建成功但拿不到链接时只省略链接段（不造假链接）', () => {
    expect(renderCreated('REQ-1')).toBe('已创建需求 REQ-1')
  })
  it('show 未绑定：本窗口未绑定需求。用法：/pm <需求名称>', () => {
    expect(renderUnbound()).toBe('本窗口未绑定需求。用法：/pm <需求名称>')
  })
  it('show 已绑定：本窗口需求：<REQ-ID> <title> · 阶段 <status> · <board_link>', () => {
    expect(renderBound('REQ-1', '看板导出', 'design', 'https://x/req/1')).toBe(
      '本窗口需求：REQ-1 看板导出 · 阶段 design · https://x/req/1',
    )
  })
  it('已绑定错误 / 工作区不可用 / 用法 / 未知错误四条逐字', () => {
    expect(renderWindowBound('REQ-1')).toBe('本窗口已绑定进行中需求 REQ-1；先推进或取消它再立项')
    expect(renderWorkspaceUnavailable()).toBe('工作区不可用，需求落不了盘（REQBOARD_INVALID_WORKSPACE）')
    expect(renderUsage()).toBe('用法：/pm [<需求名称>]（名称 ≤ 120 字符）')
    expect(renderUnknown('boom')).toBe('命令执行失败：boom')
  })
})

describe('/pm 注册与降级（RF-16）', () => {
  it('无条件降级：宿主没有 commands 服务 → 返回 undefined 且不抛', () => {
    expect(() => applyCommandSurface({} as never, noopDeps)).not.toThrow()
    expect(applyCommandSurface({} as never, noopDeps)).toBeUndefined()
  })
  it('有 commands 服务 → 注册名为 pm 的命令并返回卸载 disposer', () => {
    const seen: Record<string, unknown>[] = []
    const dispose = (): void => undefined
    const ctx = { commands: { register: (definition: Record<string, unknown>): (() => void) => { seen.push(definition); return dispose } } }
    expect(applyCommandSurface(ctx as never, noopDeps)).toBe(dispose)
    expect(seen).toHaveLength(1)
    expect(seen[0]['name']).toBe('pm')
    expect(seen[0]['definitionId']).toBe('dsh-pmboard')
    expect(seen[0]['input']).toEqual({ hint: '[<需求名称>]', attachments: false })
  })
  it('重复注册（宿主抛错）→ 按降级路径处理：不抛、返回 undefined', () => {
    const ctx = { commands: { register: (): never => { throw new Error('duplicate command: pm') } } }
    expect(() => applyCommandSurface(ctx as never, noopDeps)).not.toThrow()
    expect(applyCommandSurface(ctx as never, noopDeps)).toBeUndefined()
  })
})
