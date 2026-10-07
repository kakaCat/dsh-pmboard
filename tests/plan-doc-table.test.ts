/**
 * 计划文档**任务表**门禁（2026-10-06 缺口 4 之四）：批准所见 = 文档所见。
 *
 * 修前形态：批准人点「批准计划」时读的是**这份文档**，落库读的却是 `tasks[]` 数组，两者零一致性判据。
 * 实测有需求 `decomposition.md` 只有 41 行、**没有任务表**，而 `plan.json` 有 10 张完整卡：
 * 门禁全绿、人批的是一份空文档、落的是另一批卡。
 *
 * 本文件锁三件事：
 *  ① 硬判①：文档里找不到任务表 → 拒（`plan_doc_task_table_incomplete`），且**零副作用**；
 *  ② 硬判②：表里的 key 覆盖不了 `tasks[].key` → 拒并**点名**那几张卡；
 *  ③ 软判：表头缺「验收标准」/「工作量」/「依赖」列 → **不拒**，只进 `plan_doc_warnings`（非空才出键）。
 */
import { describe, it, expect } from 'vitest'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import {
  planDocColumnWarnings,
  planDocTaskTableMissing,
  planDocUncoveredKeys,
  readPlanDocTaskTable,
} from '../src/application/internal/plan-doc-table.js'
import { makeHarness, req } from './application/harness.js'

const REQ_ID = 'REQ-0000d1'
const W = 'session-pd-001'
const planPathOf = (id: string): string => 'docs/requirements/' + id + '/plan.md'

/** 完整任务表（列齐全：验收 + 工作量 + 依赖）。 */
function fullTable(keys: readonly string[]): string {
  return [
    '# 拆分计划（夹具）',
    '',
    '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
    '|---|---|---|---|---|',
    ...keys.map(k => `| ${k} | 卡 ${k} | — | M | 跑 npx vitest run tests/x.test.ts 全绿 |`),
    '',
  ].join('\n')
}

/** 只有 key/标题两列的任务表（用来触发软判的缺列点名）。 */
function bareTable(keys: readonly string[]): string {
  return [
    '# 拆分计划（夹具）',
    '',
    '| 计划 key | 标题 |',
    '|---|---|',
    ...keys.map(k => `| ${k} | 卡 ${k} |`),
    '',
  ].join('\n')
}

function task(key: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key,
    title: '卡 ' + key,
    phase: 'implement',
    side: 'backend',
    acceptance: 'npx vitest run tests/x.test.ts 全绿',
    implementation: '改 src/x.ts',
    ...over,
  }
}

/** 造好「绑定本窗口、decomposing 阶段」的需求，并把计划文档写进 FakeDocs。 */
async function harness(planDoc: string | undefined, id = REQ_ID) {
  const h = makeHarness()
  h.seedRequirementSync(req({ id, status: 'decomposing', category: 'feature', sourceSessionId: W }))
  // 两源写入后必须等排空：绑定读走新端口（store.listSummaries），不等就查不到（NO_BOUND_REQ）
  await h.seedSettled()
  if (planDoc !== undefined) h.docs.put(planPathOf(id), planDoc)
  return h
}

const submit = (h: Awaited<ReturnType<typeof harness>>, tasks: unknown, id = REQ_ID) =>
  submitPlanArtifact(
    h.deps,
    { path: planPathOf(id), summary: '目标：任务表门禁；做法：真提交', tasks },
    { agent: { id: W } },
  )

describe('读取口径（与 scripts/template-gate-probe.mts 的 decomposition 判据同源）', () => {
  it('表头含「计划 key」的那张表被认成任务表，key 抽得出来', () => {
    const r = readPlanDocTaskTable(fullTable(['t1', 't2']))
    expect(r.found).toBe(true)
    expect(r.keys).toEqual(['t1', 't2'])
    expect(planDocTaskTableMissing(r)).toBe(false)
    expect(planDocColumnWarnings(r)).toEqual([])
  })

  it('没有任务表（或无「计划 key」表头）→ found=false（不猜别的表是任务表）', () => {
    expect(readPlanDocTaskTable('# 拆分计划\n\n（只有散文，没有表）\n').found).toBe(false)
    // 「编号口径」表也不该被误认成任务表
    expect(readPlanDocTaskTable('| 编号 | 出自 |\n|---|---|\n| FR-1 | requirement.md |\n').found).toBe(false)
  })

  it('软判逐列点名：缺验收 / 缺工作量 / 缺依赖', () => {
    const w = planDocColumnWarnings(readPlanDocTaskTable(bareTable(['t1'])))
    expect(w).toHaveLength(3)
    expect(w.join('\n')).toContain('验收标准')
    expect(w.join('\n')).toContain('工作量')
    expect(w.join('\n')).toContain('依赖')
  })
})

describe('硬判①：文档里没有任务表 → 拒，且零副作用', () => {
  it('投到「无任务表」的路径 → plan_doc_task_table_incomplete，台账不留计划', async () => {
    const h = await harness('# 拆分计划\n\n（这份文档没有任务表）\n')
    await expect(submit(h, [task('t1')])).rejects.toThrow(/plan_doc_task_table_incomplete/)
    // 拒绝零副作用：计划没进台账（否则人会在看板上看到一条"待批的坏计划"）
    expect((await h.store.get(REQ_ID))!.plan).toBeUndefined()
  })

  it('修复锚点必须指向模板（照 templates/decomposing/decomposition.md 补行）', async () => {
    const h = await harness('# 拆分计划\n')
    const err = await submit(h, [task('t1')]).catch((e: Error) => e)
    expect((err as Error).message).toContain('templates/decomposing/decomposition.md')
    expect((err as Error).message).toContain('计划 key')
  })
})

describe('硬判②：表里的 key 覆盖不了 tasks[].key → 拒并点名', () => {
  it('文档只收录 t1，tasks 有 t1/t2 → 点名 t2（批准人没看见它）', async () => {
    const h = await harness(fullTable(['t1']))
    const err = await submit(h, [task('t1'), task('t2')]).catch((e: Error) => e)
    expect((err as Error).message).toContain('t2')
    expect((err as Error).message).toContain('plan_doc_task_table_incomplete')
    expect((await h.store.get(REQ_ID))!.plan).toBeUndefined()
  })

  it('文档收录齐全 → 放行（key 集合相等即可，不逐字比对内容）', async () => {
    const h = await harness(fullTable(['t1', 't2']))
    const out = (await submit(h, [task('t1'), task('t2')])) as { success?: boolean; task_count?: number }
    expect(out.success).toBe(true)
    expect(out.task_count).toBe(2)
  })

  it('key 抽取器与覆盖判据同源（planDocUncoveredKeys 直接可测）', () => {
    const r = readPlanDocTaskTable(fullTable(['t1']))
    expect(planDocUncoveredKeys(r, ['t1', 't2'])).toEqual(['t2'])
  })
})

describe('软判：缺列只点名不拒（plan_doc_warnings，非空才出键）', () => {
  it('表只有 key/标题两列 → 提交成功且回执带三条缺列点名', async () => {
    const h = await harness(bareTable(['t1']))
    const out = (await submit(h, [task('t1')])) as { success?: boolean; plan_doc_warnings?: string[] }
    expect(out.success).toBe(true)
    expect(out.plan_doc_warnings).toHaveLength(3)
  })

  it('列齐全 → 键整体省略（调用方只有一种判空写法）', async () => {
    const h = await harness(fullTable(['t1']))
    const out = (await submit(h, [task('t1')])) as Record<string, unknown>
    expect('plan_doc_warnings' in out).toBe(false)
  })
})
