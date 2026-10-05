/**
 * 「DAG」Tab 面板渲染断言（REQ-261004222448-292a · FR-8）· serves: FR-8
 *
 * 本包的客户端渲染是**纯函数返回 HTML 字符串**（没有 jsdom），所以这里对字符串断言。
 * 钉住的性质（缺一条缺陷就会回来）：
 *  ① 八列表头恒在（含空态）——列名是断言契约，缺一列即失败；
 *  ② `failed` 行的**错误原文在行内**、且有 `data-step-error="1"` 与「第 N 次尝试」；
 *  ③ `manual` 触发显示成 `manual`（与 `auto` 行可分辨）；
 *  ④ `outputCount === 0` 的零产出执行有显式标记，正常行**不得**带上它；
 *  ⑤ 产物**无内层滚动**（`overflow: auto|scroll` 命中 0），且执行行数 == steps 条数；
 *  ⑥ 空态两处（无任务 / 无执行记录）都有说辞；载荷形状不符时如实说明、不编造；
 *  ⑦ 画布**只给挂载点**（本面板不画图）：`data-dag-canvas` + 面板专用 canvas id + `[data-dag-wrap]`，
 *     并给出层级 / 卡片数 / 依赖边 / 最大并行度摘要。
 *
 * 为什么画布只断言"挂载点存在"而不断言像素：画布是 `client/dag/*` 的实现（`tests/dag-view*.test.ts`
 * 已守着），本卡不改图形算法——这里只钉"本面板把它接上了"。
 */
import { describe, it, expect } from 'vitest'
import { dagPanel, DAG_PANEL_CANVAS_ID } from '../src/client/views/panels/dag.js'
import type { DagGraphNode, DagResponse, DagStep } from '../src/shared/protocol.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'

const REQ = 'REQ-261004222448-292a'

/** 渲染上下文：渲染是纯函数，取数与开正文在这里都不该被用到。 */
const ctx: ReportTabCtx = {
  requirementId: REQ,
  load: () => Promise.reject(new Error('渲染路径不该取数（取数归壳）')),
  openDoc: () => { /* 渲染不开正文 */ },
}

let seq = 0

function node(over: Partial<DagGraphNode> = {}): DagGraphNode {
  return {
    id: 't-' + String(++seq).padStart(6, '0'),
    title: '任务卡',
    status: 'todo',
    dependsOn: [],
    ...over,
  }
}

function step(over: Partial<DagStep> = {}): DagStep {
  return {
    taskId: 't-000001',
    stage: 'implement',
    sessionId: 'sess-abcd1234',
    trigger: 'auto',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_180_000,
    outcome: 'succeeded',
    evidence: ['npx vitest run tests/dag-panel.test.ts → 全绿'],
    attempt: 1,
    ...over,
  }
}

/** 只渲染面板本体（壳的 `panelWrapper` 会给它套上 `[data-panel="dag"]` 的容器）。 */
function render(data: unknown): string {
  return dagPanel.render(data, ctx)
}

/** 拆出执行行（`<tr` 切分，只保留带 `data-step-row` 的）。 */
function rowsOf(html: string): string[] {
  return html.split('<tr').filter(r => r.includes('data-step-row='))
}

describe('FR-8 DAG Tab：画布挂载点与图数据摘要', () => {
  it('只给挂载点（命令式挂载）：data-dag-canvas + 面板专用 canvas id + data-dag-wrap', () => {
    const html = render({ tasks: [node({ id: 't-1', title: '画布' })], steps: [] })
    expect(html).toContain('data-dag-canvas="1"')
    expect(html).toContain('id="' + DAG_PANEL_CANVAS_ID + '"')
    expect(html).toContain('data-dag-wrap')
    // 壳挂载要的 stateKey 已拼好，且键含需求 id（dag/view-state 的约定）
    expect(html).toContain('data-dag-state-key="' + DAG_PANEL_CANVAS_ID + '::' + REQ + '"')
    // 面板专用 id：与旧详情页的 #dag-canvas 不重名（重名会互抢画布实例）
    expect(DAG_PANEL_CANVAS_ID).not.toBe('dag-canvas')
    expect(html).not.toContain('id="dag-canvas"')
    // 工具条沿用既有挂载入口认的标记（纵向/横向 · 关键路径/只看主线）
    expect(html).toContain('data-dag-dir="vertical"')
    expect(html).toContain('data-dag-toggle="crit"')
    // 本面板不画图：产物里不该有 <canvas> 之外的图形产物（画布只有一块）
    expect((html.match(/<canvas\b/g) ?? []).length).toBe(1)
  })

  it('图数据摘要：层级 / 卡片数 / 依赖边 / 最大并行度 / 分层明细 / 状态分布', () => {
    const tasks: DagGraphNode[] = [
      node({ id: 't-a', title: 'A', status: 'done' }),
      node({ id: 't-b', title: 'B', dependsOn: ['t-a'], status: 'in_progress' }),
      node({ id: 't-c', title: 'C', dependsOn: ['t-a'], status: 'todo' }),
      node({ id: 't-d', title: 'D', dependsOn: ['t-b', 't-c'], status: 'todo', chainMissing: true }),
    ]
    const html = render({ tasks, steps: [] })
    expect(html).toContain('data-dag-summary="1"')
    expect(html).toContain('data-dag-layer-count="3"')
    expect(html).toContain('data-dag-task-count="4"')
    expect(html).toContain('data-dag-edge-count="4"')   // a→b, a→c, b→d, c→d
    expect(html).toContain('data-dag-parallelism="2"')  // L1 有 b、c 两张 = 最大并行度
    expect(html).toContain('data-dag-chain-missing="1"')
    expect(html).toContain('层级 3 层')
    expect(html).toContain('最大并行度 2 张/层')
    expect(html).toContain('L0 1 张 / L1 2 张 / L2 1 张')
    expect(html).toContain('done 1 · in_progress 1 · todo 2')
  })

  it('依赖指向图外的卡时不入边数（只数两端都在图里的边，且去重）', () => {
    const tasks = [
      node({ id: 't-a' }),
      node({ id: 't-b', dependsOn: ['t-a', 't-not-in-graph', 't-a'] }),
    ]
    const html = render({ tasks, steps: [] })
    expect(html).toContain('data-dag-edge-count="1"')
  })
})

describe('FR-8 DAG Tab：每步执行结果表（八列，逐行铺开）', () => {
  it('表头恒为八列，列名逐字对', () => {
    const html = render({ tasks: [node({ id: 't-1' })], steps: [step({ taskId: 't-1' })] })
    expect((html.match(/<th\b/g) ?? []).length).toBe(8)
    for (const col of ['卡', '阶段', '谁做', '触发', '起止时间', '结果', '产出与汇报', '证据与错误']) {
      expect(html).toContain('>' + col + '<')
    }
  })

  it('每个执行行带契约数据属性，且行数 == steps 条数（不截断、不折叠）', () => {
    const steps: DagStep[] = Array.from({ length: 12 }, (_, i) => step({
      taskId: 't-1', outcome: i === 0 ? 'failed' : 'succeeded', ...(i === 0 ? { error: 'boom' } : {}),
    }))
    const html = render({ tasks: [node({ id: 't-1', title: 'DAG Tab' })], steps })
    const rows = rowsOf(html)
    expect(rows.length).toBe(12)
    expect(html).toContain('data-task-id="t-1"')
    expect(html).toContain('data-outcome="succeeded"')
    expect(html).toContain('data-trigger="auto"')
    expect(html).toContain('data-step-table="1"')
  })

  it('四种结局各自如实落到 data-outcome（不合并成"有结果/没结果"）', () => {
    const steps: DagStep[] = [
      step({ taskId: 't-1', outcome: 'running', endedAt: undefined }),
      step({ taskId: 't-1', outcome: 'succeeded' }),
      step({ taskId: 't-1', outcome: 'failed', error: 'e' }),
      step({ taskId: 't-1', outcome: 'cancelled' }),
    ]
    const html = render({ tasks: [node({ id: 't-1' })], steps })
    for (const o of ['running', 'succeeded', 'failed', 'cancelled']) {
      expect(html).toContain('data-outcome="' + o + '"')
    }
    expect(html).toContain('进行中')
    expect(html).toContain('✅ 成功')
    expect(html).toContain('❌ 失败')
    expect(html).toContain('⛔ 已取消')
  })

  it('failed 行：data-step-error="1" + 错误原文在**该行内** + 第 N 次尝试', () => {
    const err = 'AssertionError: expected 8 to be 7（tests/dag-panel.test.ts:42）'
    const html = render({
      tasks: [node({ id: 't-1', title: 'DAG Tab' })],
      steps: [step({ taskId: 't-1', outcome: 'failed', error: err, attempt: 2 })],
    })
    expect(html).toContain('data-step-error="1"')
    expect(html).toContain('data-outcome="failed"')
    const failedRow = rowsOf(html).find(r => r.includes('data-step-error="1"'))
    expect(failedRow).toBeDefined()
    expect(failedRow).toContain(err)          // 原文可见（不是"失败了"三个字打发）
    expect(failedRow).toContain('第 2 次尝试') // attempt > 1 行里看得出
    expect(failedRow).toContain('data-attempt="2"')
  })

  it('failed 但没记错误原文时如实说"未记录"，不编一个原因', () => {
    const html = render({
      tasks: [node({ id: 't-1' })],
      steps: [step({ taskId: 't-1', outcome: 'failed', error: undefined })],
    })
    expect(html).toContain('（未记录错误原文）')
  })

  it('manual 触发行显示为 manual，且与 auto 行可分辨', () => {
    const html = render({
      tasks: [node({ id: 't-1' }), node({ id: 't-2' })],
      steps: [
        step({ taskId: 't-1', trigger: 'manual' }),
        step({ taskId: 't-2', trigger: 'auto' }),
      ],
    })
    const rows = rowsOf(html)
    expect(rows[0]).toContain('data-trigger="manual"')
    expect(rows[0]).toContain('>manual<')
    expect(rows[0]).toContain('人工触发')
    expect(rows[1]).toContain('data-trigger="auto"')
    expect(rows[1]).toContain('>auto<')
    expect(rows[1]).not.toContain('人工触发')
  })

  it('零产出执行有显式标记（outputCount === 0），正常行不得带', () => {
    const html = render({
      tasks: [node({ id: 't-1' }), node({ id: 't-2' })],
      steps: [
        step({
          taskId: 't-1', outcome: 'succeeded', outputCount: 0,
          report: { summary: '跑了一趟什么也没留下', completed: [], filesChanged: [] },
        }),
        step({
          taskId: 't-2', outcome: 'succeeded', outputCount: 3,
          report: { summary: '有产出', completed: ['一', '二'], filesChanged: ['src/a.ts'] },
        }),
      ],
    })
    const rows = rowsOf(html)
    expect(rows[0]).toContain('data-zero-output="1"')
    expect(rows[0]).toContain('零产出')
    expect(rows[1]).not.toContain('data-zero-output')
    expect(rows[1]).not.toContain('零产出')
  })

  it('running 不标零产出（在途还没产出是常态），产出未知也不写 0', () => {
    const html = render({
      tasks: [node({ id: 't-1' }), node({ id: 't-2' })],
      steps: [
        step({ taskId: 't-1', outcome: 'running', endedAt: undefined, outputCount: 0 }),
        step({ taskId: 't-2', outcome: 'cancelled', outputCount: undefined, report: undefined }),
      ],
    })
    const rows = rowsOf(html)
    expect(rows[0]).toContain('data-outcome="running"')
    expect(rows[0]).not.toContain('data-zero-output')
    expect(rows[1]).not.toContain('data-zero-output')
    expect(rows[1]).toContain('产出未记录') // 未知 ≠ 0（T-19 口径）
  })

  it('行内给出谁做 / 起止与耗时 / 汇报四要素', () => {
    const html = render({
      tasks: [node({ id: 't-1', title: 'DAG Tab' })],
      steps: [step({
        taskId: 't-1', stage: 'implement', sessionId: 'sess-xyz987', startedAt: 1_700_000_000_000, endedAt: 1_700_000_180_000,
        report: { summary: '做完八列表', completed: ['一', '二'], filesChanged: ['src/client/views/panels/dag.ts'], nextStep: '跑测试' },
      })],
    })
    expect(html).toContain('sess-xyz987')
    expect(html).toContain('data-step-time="closed"')
    expect(html).toContain('耗时 3 分 0 秒')
    expect(html).toContain('做完八列表')
    expect(html).toContain('完成 2 项')
    expect(html).toContain('改动 1 个文件')
    expect(html).toContain('下一步：跑测试')
  })

  it('未结束的执行起止列写"进行中"（不假造结束时间）', () => {
    const html = render({
      tasks: [node({ id: 't-1' })],
      steps: [step({ taskId: 't-1', outcome: 'running', endedAt: undefined })],
    })
    expect(html).toContain('data-step-time="open"')
    expect(html).toContain('进行中')
  })

  it('图里找不到这张卡时如实标注，不编标题', () => {
    const html = render({ tasks: [node({ id: 't-other' })], steps: [step({ taskId: 't-ghost' })] })
    expect(html).toContain('（图里没有这张卡）')
    expect(html).toContain('data-task-id="t-ghost"')
  })
})

describe('FR-8 DAG Tab：铺开纪律与空态', () => {
  it('产物无内层滚动（overflow: auto|scroll 命中 0）', () => {
    const steps = Array.from({ length: 30 }, () => step({ taskId: 't-1' }))
    const html = render({ tasks: [node({ id: 't-1' })], steps })
    expect(html).not.toMatch(/overflow\s*:\s*(auto|scroll)/i)
    expect(html).not.toContain('overflow')
  })

  it('无任务 + 无执行记录：两处都有说辞，表头仍在八列', () => {
    const html = render({ tasks: [], steps: [] })
    expect(html).toContain('data-dag-empty="no-tasks"')
    expect(html).toContain('还没有任务卡')
    expect(html).toContain('data-steps-empty="1"')
    expect(html).toContain('还没有执行记录')
    expect((html.match(/<th\b/g) ?? []).length).toBe(8)
    expect(rowsOf(html).length).toBe(0) // 空态不是"一行执行结果"
  })

  it('有任务但还没有执行记录：说辞照给，图摘要照给', () => {
    const html = render({ tasks: [node({ id: 't-1', title: 'A' })], steps: [] })
    expect(html).toContain('data-dag-task-count="1"')
    expect(html).toContain('data-steps-empty="1"')
    expect(html).toContain('还没有执行记录')
  })

  it('载荷形状不符：如实说明，不抛异常、不编图形与执行结果', () => {
    for (const bad of [null, undefined, 42, {}, { tasks: [] }] as unknown[]) {
      const html = render(bad)
      expect(html).toContain('data-dag-shape="unexpected"')
      expect(html).toContain('不编造')
      expect(html).not.toContain('data-step-row')
      expect(html).not.toContain('<canvas')
    }
  })

  it('汇报文本按 HTML 转义（不把汇报当 HTML 注入）', () => {
    const html = render({
      tasks: [node({ id: 't-1' })],
      steps: [step({
        taskId: 't-1',
        report: { summary: '<img src=x onerror=alert(1)>', completed: [], filesChanged: [] },
        evidence: ['</td><script>alert(2)</script>'],
      })],
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('FR-8 DAG Tab：面板契约不变', () => {
  it('key / label 照旧（改名字会让壳的 tab 栏静默失配）', () => {
    expect(dagPanel.key).toBe('dag')
    expect(dagPanel.label).toBe('DAG')
  })

  it('角标不前端推算（ReportResponse 没有按 Tab 计数 → 不显示）', () => {
    expect(dagPanel.badge(undefined)).toBeUndefined()
    expect(dagPanel.badge({} as never)).toBeUndefined()
  })

  it('载荷是空 DagResponse（有数组、无内容）时也走就绪渲染，而不是形状不符', () => {
    const ok: DagResponse = { tasks: [], steps: [] }
    const html = render(ok)
    expect(html).not.toContain('data-dag-shape="unexpected"')
    expect(html).toContain('data-dag-summary="1"')
  })
})
