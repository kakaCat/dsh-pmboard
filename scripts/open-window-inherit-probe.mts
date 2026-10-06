/**
 * 开窗继承探针（REQ-261005151245-54ae FR-7 / design/test-cases.md §探针）。
 *
 * 【为什么需要它】单测里的编排跑在**假端口**上，适配器那层又是**假宿主服务**——
 * 「新窗口到底有没有变成源窗口的样子」这件事，只有把**真适配器 + 真用例 + 真继承模块**
 * 串起来、只把最外层的宿主服务换成假的，才能一次看全。
 *
 * 【六个读数，三对相等才算继承闭环】
 *   source_title / child_title      （rename 真的收到「源标题 (1)」）
 *   source_preset / child_preset    （create 请求体真的带上了源模式）
 *   source_model / child_model      （selectModel 真的收到源模型，逐字含推理档）
 *
 * 【绝不碰真实会话】宿主服务是本地假对象：不读环境、不写盘、不连宿主。跑完即退。
 *
 * 用法：`npx tsx scripts/open-window-inherit-probe.mts`
 * 退出码：0 = 全通过；1 = 有断言不成立（逐条点名，不静默跳过）。
 *
 * @module dsh-pmboard/scripts/open-window-inherit-probe
 */
import { performance } from 'node:perf_hooks'
import { openWindow } from '../src/application/use-cases/OpenWindow.ts'
import { SessionWindowOpener } from '../src/adapters/SessionWindowOpener.ts'
import { increasedWindowTitle } from '../src/application/internal/window-inherit.ts'
import type { UseCaseDeps } from '../src/application/ports.ts'

const SOURCE = 'session-probe-source'
const CHILD = 'session-probe-child'

/** 源窗口画像（三样齐全：标题带序号、模式、模型含推理档）。 */
const SOURCE_VALUES = {
  title: '登录重构 (2)',
  agentPreset: 'cordis',
  modelSelection: {
    lastUsed: { provider: 'deepseek', model: 'deepseek-chat' },
    next: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
  },
}

/** 断言收集器：任一不成立 → 退出码 1，并把每一条**点名**打出来（不合并、不吞掉）。 */
const failures: string[] = []
function check(ok: boolean, message: string): boolean {
  if (!ok) failures.push(message)
  return ok
}

interface Captured {
  childTitle?: string
  childPreset?: string
  childModel?: { provider: string; model: string; reasoningEffort?: string }
  elapsed: { readProfile: number; rename: number; selectModel: number }
}

/** 假宿主服务：只实现本探针真正用到的四项能力，并记录真正被写进去的值与各段耗时。 */
function fakeHostService(captured: Captured) {
  return {
    projections: async () => {
      const t0 = performance.now()
      const values = SOURCE_VALUES
      captured.elapsed.readProfile = performance.now() - t0
      return { values }
    },
    create: async (request?: { cwd?: string; workspaceId?: string; agentPreset?: string }) => {
      captured.childPreset = request?.agentPreset
      return { sessionId: CHILD }
    },
    fork: async () => ({ sessionId: CHILD }),
    rename: async (request: { sessionId: string; title: string }) => {
      const t0 = performance.now()
      captured.childTitle = request.title
      captured.elapsed.rename = performance.now() - t0
      return { title: request.title, seq: 1 }
    },
    selectModel: async (request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }) => {
      const t0 = performance.now()
      captured.childModel = {
        provider: request.provider,
        model: request.model,
        ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
      }
      captured.elapsed.selectModel = performance.now() - t0
      return { selected: { provider: request.provider, model: request.model } }
    },
  }
}

const captured: Captured = { elapsed: { readProfile: 0, rename: 0, selectModel: 0 } }
// 第二个解析器 = 假 workspace 注册表：让 `create` 路径能解析出落点（否则用例层会**响亮拒绝**，
// 那正是"不许悄悄落到宿主目录"这条纪律在本探针里的体现）。
const opener = new SessionWindowOpener(
  () => fakeHostService(captured),
  () => ({ list: () => [{ id: 'ws-probe', path: '/tmp/pmboard-probe', sessionIds: [SOURCE] }] }),
)
const deps = {
  session: { windowKey: () => SOURCE, requireLiveDriver: () => undefined },
  windowOpener: opener,
} as unknown as UseCaseDeps

const started = performance.now()
const out = await openWindow(deps, { mode: 'create' }, {})
const totalMs = performance.now() - started

const sourceTitle = SOURCE_VALUES.title
const sourcePreset = SOURCE_VALUES.agentPreset
const sourceModel = SOURCE_VALUES.modelSelection.next

console.log('[probe] REQ-261005151245-54ae 开窗继承六读数')
console.log(`  source_title  = ${sourceTitle}`)
console.log(`  child_title   = ${String(captured.childTitle)}`)
console.log(`  source_preset = ${sourcePreset}`)
console.log(`  child_preset  = ${String(captured.childPreset)}`)
console.log(`  source_model  = ${JSON.stringify(sourceModel)}`)
console.log(`  child_model   = ${JSON.stringify(captured.childModel)}`)
console.log(
  `  elapsed       = readProfile ${captured.elapsed.readProfile.toFixed(2)}ms`
  + ` / rename ${captured.elapsed.rename.toFixed(2)}ms`
  + ` / selectModel ${captured.elapsed.selectModel.toFixed(2)}ms`
  + ` / total ${totalMs.toFixed(2)}ms`,
)

// ① 窗口真的建成了
check(out.success === true, `开窗未成功：${JSON.stringify(out)}`)
check(out.window_key === CHILD, `窗口码不是宿主返回的新会话：${String(out.window_key)}`)
// ② 三对读数相等（继承闭环）
check(
  captured.childTitle === increasedWindowTitle(sourceTitle),
  `标题未按源标题递增：期望 ${increasedWindowTitle(sourceTitle)}，实际 ${String(captured.childTitle)}`,
)
check(
  captured.childPreset === sourcePreset,
  `模式未随建会话请求带入：期望 ${sourcePreset}，实际 ${String(captured.childPreset)}`,
)
check(
  JSON.stringify(captured.childModel) === JSON.stringify(sourceModel),
  `模型未逐字继承：期望 ${JSON.stringify(sourceModel)}，实际 ${JSON.stringify(captured.childModel)}`,
)
// ③ 回执三态与实测一致（回执说 set，就必须真的写进去了）
check(out.inheritance.title === 'set', `回执 title 应为 set，实际 ${out.inheritance.title}`)
check(out.inheritance.preset === 'set', `回执 preset 应为 set，实际 ${out.inheritance.preset}`)
check(out.inheritance.model === 'set', `回执 model 应为 set，实际 ${out.inheritance.model}`)
check(out.inheritance.reasons.length === 0, `三项皆 set 时 reasons 应为空：${JSON.stringify(out.inheritance.reasons)}`)
// ④ 附加耗时目标（NFR：P95 < 500ms；本地假宿主，量级检查）
check(totalMs < 500, `附加耗时超出目标：${totalMs.toFixed(2)}ms ≥ 500ms`)

if (failures.length > 0) {
  console.error(`\n[probe] FAIL（${failures.length} 条）`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('\n[probe] OK：三对读数相等，继承闭环成立')
