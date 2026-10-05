/**
 * reqboard_bind 工具壳（REQ-261003215944-9e04 FR-2 · t-845a64）——**输出契约**那一道门。
 *
 * 为什么要单测这个壳：DSH 的 output.schema 是 `additionalProperties:false`——回执里多一个
 * 未声明字段，绑定层会**整体拒收**：副作用发生了、调用方只看到一条 invalid output 错误。
 * 本仓为此踩过三次（accept_sheet / archive_submit / ask_confirm）。所以这里做两件事：
 *   ① 成功路径直调 execute，断言**返回键 ⊆ 声明键**；
 *   ② 断言入参 schema 里 role 的枚举只有 worker / observer（owner 不该能从这里被派出来）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { defineBindTool } from '../src/tools/BindTool/index.js'
import type { UseCaseDeps } from '../src/application/ports.js'

const OWNER = 'session-owner-tool'
const PEER = 'session-peer-tool'
const ID = 'REQ-261003215944-9e04'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pmboard-bind-tool-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/** 工具壳的形状（`defineTool` 的返回值）——只取本用例要用的两处。 */
type Shell = {
  name?: string
  parameters?: { properties?: Record<string, { enum?: string[] }> }
  output?: { schema?: { properties?: Record<string, unknown>; additionalProperties?: boolean } }
  execute: (args: unknown, ctx: unknown) => Promise<Record<string, unknown>>
}

async function makeShell(seatsMax?: number): Promise<{ shell: Shell; store: ShardedRequirementStore }> {
  const store = new ShardedRequirementStore({ root, onWarn: () => { /* 本用例不关心告警 */ } })
  await store.create({
    id: ID, title: '工具壳夹具', description: '', status: 'implementing', sourceSessionId: OWNER,
  } as never, { kind: 'agent' })
  let n = 0
  const deps = {
    store,
    clock: { now: () => 1_700_000_000_000 },
    ids: { comment: () => `c-${++n}` },
    session: { windowKey: (ctx: unknown) => (ctx as { agent?: { id?: string } })?.agent?.id ?? '' },
  } as unknown as UseCaseDeps
  return { shell: defineBindTool(deps, seatsMax !== undefined ? { seatsMax } : undefined) as unknown as Shell, store }
}

describe('reqboard_bind 工具壳', () => {
  it('名字与入参：role 是必填枚举，只允许 worker / observer（owner 不经这里产生）', async () => {
    const { shell } = await makeShell()
    expect(shell.name).toBe('reqboard_bind')
    expect(shell.parameters?.properties?.role?.enum).toEqual(['worker', 'observer'])
  })

  it('成功路径：返回键全部已声明（additionalProperties:false 下多一个就整条拒收）', async () => {
    const { shell } = await makeShell()
    const out = await shell.execute({ role: 'worker', window_key: PEER }, { agent: { id: OWNER } })
    const declared = Object.keys(shell.output?.schema?.properties ?? {})
    expect(shell.output?.schema?.additionalProperties).toBe(false) // 前提：声明是封闭的
    expect(Object.keys(out).filter((k) => !declared.includes(k))).toEqual([])
    expect(out.success).toBe(true)
    expect(out.requirement_id).toBe(ID)
  })

  it('席位项的形状也受同一道门：windowKey / role / joinedAt 三个键已声明', async () => {
    const { shell } = await makeShell()
    const out = await shell.execute({ role: 'observer', window_key: PEER }, { agent: { id: OWNER } })
    const seatProps = (shell.output?.schema?.properties?.seats as { items?: { properties?: Record<string, unknown> } })?.items?.properties ?? {}
    for (const s of out.seats as Record<string, unknown>[]) {
      expect(Object.keys(s).filter((k) => !(k in seatProps))).toEqual([])
    }
  })

  it('失败路径：上限从工具壳传下去（seatsMax=2 时第 3 个席位被拒）', async () => {
    const { shell } = await makeShell(2)
    await shell.execute({ role: 'worker', window_key: PEER }, { agent: { id: OWNER } })
    await expect(shell.execute({ role: 'worker', window_key: 'session-third' }, { agent: { id: OWNER } }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_LIMIT' })
  })
})

// 联调段：用**宿主同一个校验器**过一遍这个工具的两张 schema。
// 为什么这不是"再测一遍单测"：上面断言的是"我自己声明的键"，这里断言的是"宿主收不收"——
// 两者的实现是两套代码，历史上正是这一层把已落库的回执整条拒收（value.auto_confirm must be a boolean）。
describe('联调：宿主校验器收得下 reqboard_bind 的入参与回执', () => {
  it('参数 schema 在 DSL 子集内，且接受 worker / 拒绝 owner', async () => {
    const { shell } = await makeShell()
    const params = shell.parameters as unknown as Parameters<typeof validateJsonSchemaValue>[0]
    assertSupportedJsonSchema(params)
    expect(validateJsonSchemaValue(params, { role: 'worker' })).toEqual([])
    expect(validateJsonSchemaValue(params, { role: 'worker', window_key: PEER, remove: true })).toEqual([])
    expect(validateJsonSchemaValue(params, { role: 'owner' }).length).toBeGreaterThan(0) // 枚举挡住
    expect(validateJsonSchemaValue(params, {}).length).toBeGreaterThan(0)               // role 必填
  })

  it('成功回执在宿主校验器下零违规（含 seats 数组每一项）', async () => {
    const { shell } = await makeShell()
    const out = await shell.execute({ role: 'worker', window_key: PEER }, { agent: { id: OWNER } })
    const schema = shell.output?.schema as unknown as Parameters<typeof validateJsonSchemaValue>[0]
    assertSupportedJsonSchema(schema)
    expect(validateJsonSchemaValue(schema, out)).toEqual([])
  })
})
