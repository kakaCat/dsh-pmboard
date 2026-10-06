/**
 * rtm-accepting.yml 生成（REQ-260926140539-457b FR-2 触发点 7）。
 *
 * 产出：测试用例、任务 → 测试 / FR → 测试映射、测试覆盖度（门禁 ≥80%）；
 * REQ-261005105032-3b02 起增 `outputs.acceptance_items[]`——UI 需求的**「原型对照」证据条目**
 * （FR-7：验收侧要能追到"对照过哪一版"，决议 `#37` 载荷形状 + interfaces.md 逐字判据）。
 *
 * @module @pi-investment/reqboard/rtm/accepting-generator
 */
import { getRTMPath, readRTM, writeRTM } from './file-io.js'
import type { RTMContext } from './context.js'
import { parseTestCovers } from './parser.js'
import { buildFRToTests, buildTaskToTests } from './traceability-builder.js'
import { calculateTestingCoverage } from './coverage-calculator.js'
import { effectiveFRs } from './design-generator.js'
import type {
  AcceptanceEvidenceItem,
  RTMAccepting,
  RTMBrainstorming,
  RTMDecomposing,
} from './types.js'

/** 判据与理由逐字（interfaces.md §验收单项接口；改这里等于改契约）。 */
const PROTOTYPE_COMPARE_CRITERION = '与原型对照截图（含差异说明）'
const PROTOTYPE_COMPARE_HUMAN_REASON = '界面视觉需人对照权威原型'

/** requirement.md 的 front-matter 块。 */
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/
/** front-matter 里的 `prototype_exempt: <理由>`（理由可为带引号串）。 */
const PROTOTYPE_EXEMPT_RE = /^\s*prototype_exempt\s*:\s*(.+?)\s*$/m

/**
 * 是否要求「原型对照」项：只有 feature/refactor（D-12 同族口径：该仪式不施加给非 UI 需求）。
 *
 * 为什么不额外判 `sides`：`sides` 不在 RTM 上下文的需求投影里（`LedgerRequirementLike` 只有
 * id/title/category/status/artifacts），而"存在已登记 prototype 产物"本身就是 UI 需求的代理判据
 * ——没有原型就没有可对照的对象，这条在没有 sides 的情况下不会误判（非 UI 需求不会有原型产物）。
 */
function requiresPrototypeCompare(category: string | undefined): boolean {
  return category === 'feature' || category === 'refactor'
}

/**
 * requirement.md 是否声明了 `prototype_exempt`（理由非空才生效）。
 *
 * 口径（决议 `#45`）：已豁免的需求**不强制**对照项。这里只读"已声明的形态"——"是否经人确认"
 * 属 G1 确认门（prototype-gates）的职责，本处不复算，免得同一件事有两处判定口径。
 */
function declaredPrototypeExempt(ctx: RTMContext, reqId: string): boolean {
  const text = ctx.readDoc(reqId, 'requirement.md')
  if (text === null) return false
  const frontMatter = FRONT_MATTER_RE.exec(text)
  if (frontMatter === null) return false
  const line = PROTOTYPE_EXEMPT_RE.exec(frontMatter[1])
  if (line === null) return false
  const reason = line[1].replace(/^['"]|['"]$/g, '').trim()
  return reason.length > 0
}

/**
 * 取要对照的原型路径（权威优先）。
 *
 * 事实源优先级：`rtm-brainstorming.yml` 的 `outputs.prototypes`（t7 已落的两节之一，带
 * `authoritative` 标记）→ 台账 `kind=prototype` 的 `.html` 产物（brainstorming RTM 还没生成时
 * 的回落，如验收材料先于需求 RTM 落盘）。`prototypes/INDEX.md` 自身不是原型页面（决议 `#1`），
 * 故只认 `.html`。
 */
function prototypePathsToCompare(
  ctx: RTMContext,
  reqId: string,
  brainstorming: RTMBrainstorming | null,
): string[] {
  const fromRtm = brainstorming?.outputs?.prototypes ?? []
  if (fromRtm.length > 0) {
    const authoritative = fromRtm.filter(p => p.authoritative).map(p => p.path)
    // 无 authoritative 标记（版本门会拒，但这里不静默丢项）：退回全部原型路径。
    const chosen = authoritative.length > 0 ? authoritative : fromRtm.map(p => p.path)
    return [...new Set(chosen.filter(p => p.length > 0))].sort()
  }
  const artifacts = ctx.requirement(reqId)?.artifacts ?? []
  return [
    ...new Set(
      artifacts
        .filter(a => a.kind === 'prototype' && a.path.endsWith('.html'))
        .map(a => a.path),
    ),
  ].sort()
}

/** 组装对照项（一条原型一个；多于一条时按序编号，id 稳定可断言）。 */
function acceptanceItemsOf(paths: readonly string[]): AcceptanceEvidenceItem[] {
  return paths.map((prototypePath, i) => ({
    id: i === 0 ? 'prototype-compare' : `prototype-compare-${i + 1}`,
    source: { kind: 'prototype-compare', prototypePath },
    criterion: PROTOTYPE_COMPARE_CRITERION,
    needsHuman: true,
    humanReason: PROTOTYPE_COMPARE_HUMAN_REASON,
  }))
}

/**
 * 生成/更新 rtm-accepting.yml。
 *
 * 返回类型就是 `RTMAccepting`（`acceptance_items` 是它的**可选字段**，声明在 types.ts 这一
 * 唯一类型事实源里）——不再需要生成器侧的交叉类型别名。
 */
export function generateAcceptingRTM(ctx: RTMContext, reqId: string): RTMAccepting {
  const filePath = getRTMPath(ctx.reqDir(reqId), 'rtm-accepting.yml')
  const existing = readRTM<RTMAccepting>(filePath)
  const tasks = ctx.tasks(reqId)
  const testCases = parseTestCovers(ctx.testFiles(reqId))
  const taskToTests = buildTaskToTests(tasks, testCases)
  const decomposing = readRTM<RTMDecomposing>(getRTMPath(ctx.reqDir(reqId), 'rtm-decomposing.yml'))
  const frToTasks = decomposing?.traceability?.fr_to_tasks ?? {}
  const frToTests = buildFRToTests(frToTasks, taskToTests, effectiveFRs(ctx, reqId).map(f => f.id))

  // 「原型对照」验收项（FR-7）：UI 需求（feature/refactor）且未声明豁免时，逐条权威原型一条。
  const brainstorming = readRTM<RTMBrainstorming>(getRTMPath(ctx.reqDir(reqId), 'rtm-brainstorming.yml'))
  const wantsCompare = requiresPrototypeCompare(ctx.requirement(reqId)?.category)
    && !declaredPrototypeExempt(ctx, reqId)
  const acceptanceItems = wantsCompare
    ? acceptanceItemsOf(prototypePathsToCompare(ctx, reqId, brainstorming))
    : []

  const data: RTMAccepting = {
    metadata: ctx.metadata('accepting', reqId, existing),
    inputs: { tasks: tasks.map(t => ({ id: t.id, title: t.title ?? '', status: t.status ?? 'todo' })) },
    outputs: {
      test_cases: testCases,
      // 无对照项（非 UI 需求 / 无原型 / 已豁免）时**不写空数组**——缺键与"采集到 0 条"是两件事，
      // 与 prototypes/decisions 两节的"缺节 = pending"同口径（data-model §6.4）。
      ...(acceptanceItems.length > 0 ? { acceptance_items: acceptanceItems } : {}),
    },
    traceability: { task_to_tests: taskToTests, fr_to_tests: frToTests },
    coverage: { testing: calculateTestingCoverage(tasks, taskToTests) },
  }
  writeRTM(filePath, data)
  return data
}
