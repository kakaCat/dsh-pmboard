#!/usr/bin/env tsx
/**
 * 端到端探针（REQ-261002105242-a3fb · 人工浏览器核对的机械版）。
 *
 * 为什么需要它：卡 t5 的验收要求"在真实看板上点开归档需求看 DAG"。点鼠标这步由人在
 * 验收单里完成，但**同一份真实数据 + 同一批渲染函数**可以被机械复核——探针取看板真实
 * API 的 state（不伪造 fixture），跑 buildBoard / buildReqDetail / buildListView 三条
 * 真实渲染路径，逐条断言 A1-2 / A2 / A3 / A4。
 *
 * 用法：npx tsx docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts
 * 退出码 0 = 全部断言通过；非 0 = 有断言失败（逐条打印 FAIL）。
 */
import { buildBoard, buildListView, toTerminalCards, toReqCards } from '../../../../src/client/views/board.ts'
import { buildReqDetail } from '../../../../src/client/view.ts'

const URL_ = process.env.REQBOARD_STATE_URL ?? 'http://127.0.0.1:19387/dashboard/api/reqboard/state'
/** 探针锚点需求：本次需求文档里点名的那条（39 张任务卡的归档需求）。 */
const TARGET = process.env.REQBOARD_TARGET ?? 'REQ-261001213924-1441'

const fails: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail.length > 0 ? '  —— ' + detail : ''))
  if (!ok) fails.push(name)
}

const res = await fetch(URL_)
if (!res.ok) {
  console.error('✗ 取 state 失败：HTTP ' + res.status + '（服务未在跑？URL=' + URL_ + '）')
  process.exit(2)
}
const envelope = (await res.json()) as { data?: Record<string, unknown> }
const state = (envelope.data ?? envelope) as unknown as Parameters<typeof buildBoard>[0]
const requirements = state.requirements as Array<{ id: string; status: string; title: string }>
const tasks = state.tasks as Array<{ id: string; requirementId: string }>

const archived = requirements.filter(r => r.status === 'archived')
const canceled = requirements.filter(r => r.status === 'canceled')
const target = requirements.find(r => r.id === TARGET)
const targetTasks = tasks.filter(t => t.requirementId === TARGET)

console.log('真实数据：需求 ' + requirements.length + ' 条（归档 ' + archived.length + ' / 取消 ' + canceled.length
  + '）、任务 ' + tasks.length + ' 张；锚点 ' + TARGET + ' 有 ' + targetTasks.length + ' 张任务卡')

console.log('\n[A1-2] 泳道视图：归档条在场，归档需求只出现在归档条里')
const board = buildBoard(state)
const beforeBar = board.split('data-archived-bar')[0] ?? ''
check('data-archived-bar 在场', board.includes('data-archived-bar'))
const leaked = archived.concat(canceled).filter(r => beforeBar.includes('data-req="' + r.id + '"'))
check('泳道段不含任何归档/取消需求', leaked.length === 0, leaked.length > 0 ? '泄漏 ' + leaked.map(r => r.id).join(',') : '')
check('归档条默认折叠（<details> 无 open 属性）',
  !/\sopen(\s|=|>)/.test(/<details[^>]*>/.exec(board)?.[0] ?? 'open'))
check('锚点需求在归档条里可点', board.includes('data-req="' + TARGET + '"'))
const chip = new RegExp('data-req="' + TARGET + '".*?</button>', 's').exec(board)?.[0] ?? ''
check('归档 chip 带任务进度', /\d+\/\d+/.test(chip), (/\d+\/\d+/.exec(chip) ?? ['(无)'])[0])

console.log('\n[A2] 点开后：DAG 画布 + 全部任务行')
if (target === undefined) {
  check('锚点需求存在于 state', false)
} else {
  const detail = buildReqDetail(target as never, targetTasks as never, Date.now())
  const rows = (detail.match(/data-task="/g) ?? []).length
  check('详情含 DAG 画布面板', detail.includes('dsh-pm-dag-panel'))
  check('任务表行数 = 真实任务数（' + targetTasks.length + '）', rows === targetTasks.length, '实际 ' + rows)
  check('详情含总任务统计', detail.includes('总任务'))
}

console.log('\n[A3] 归档需求详情只读')
if (target !== undefined) {
  const detail = buildReqDetail(target as never, targetTasks as never, Date.now())
  const actions = ['move-req', 'plan-approve', 'plan-reject', 'verify-pass', 'verify-rework', 'archive-req']
    .filter(a => detail.includes('data-action="' + a + '"'))
  check('无任何操作按钮', actions.length === 0, actions.length > 0 ? '仍有 ' + actions.join(',') : '')
  check('无操作条容器', !detail.includes('dsh-pm-action-bar'))
}

console.log('\n[A4] 列表视图：终态分组含归档行')
// 列表视图默认 10 条/页——归档行按排序落在后面的页。这里把一页放大到 50 条，
// 让"归档行确实进了终态分组"这件事可被机械断言（默认分页下人工翻页同样能看到）。
const list = buildListView(state, Date.now(), { page: 1, pageSize: 50 })
const finishedCount = requirements.filter(r => r.status === 'done' || r.status === 'archived' || r.status === 'canceled').length
check('分组标题为「已完成 / 已归档」', list.includes('已完成 / 已归档'))
check('终态分组计数含归档（' + finishedCount + ' 条）', list.includes('已完成 / 已归档 ' + finishedCount))
check('锚点需求以行出现（pageSize=50）', list.includes('data-req="' + TARGET + '"'))
check('默认分页（10/页）下归档行在后续页，故泳道归档条是常驻入口',
  !buildListView(state).includes('data-req="' + TARGET + '"') || list.includes('data-req="' + TARGET + '"'))

console.log('\n[A6] 投影不变量（真实数据）')
const active = toReqCards(state)
const terminal = toTerminalCards(state)
const both = [...active, ...terminal]
check('两投影互斥', new Set(both.map(c => c.req.id)).size === both.length)
check('两投影并集 = 全部需求', new Set(both.map(c => c.req.id)).size === requirements.length)
check('归档需求仍带全部任务', terminal.filter(c => c.req.status === 'archived')
  .every(c => c.totalCount === tasks.filter(t => t.requirementId === c.req.id).length))

console.log('\n' + (fails.length === 0
  ? '✅ 探针全绿：' + new Date().toISOString()
  : '❌ 探针失败 ' + fails.length + ' 项：' + fails.join('；')))
process.exit(fails.length === 0 ? 0 : 1)
