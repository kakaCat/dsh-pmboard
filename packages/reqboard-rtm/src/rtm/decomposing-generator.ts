/**
 * rtm-decomposing.yml 生成（REQ-260926140539-457b FR-2 触发点 5）。
 *
 * 产出：任务列表、设计 → 任务 / FR → 任务映射、实施覆盖度；
 * REQ-261005105032-3b02 起增 `task_coverage[]`（每卡的 `covers_prototypes` / `covers_decisions`，
 * 决议 `#18` / `#36`，data-model §6.4）。
 *
 * @module @pi-investment/reqboard/rtm/decomposing-generator
 */
import { getRTMPath, readRTM, writeRTM } from './file-io.js'
import type { RTMContext } from './context.js'
import { buildDesignToTasks, buildFRToDesign, buildFRToTasks } from './traceability-builder.js'
import { calculateImplementationCoverage } from './coverage-calculator.js'
import { effectiveFRs } from './design-generator.js'
import { RTM_SCHEMA_VERSION, type DesignSection, type RTMDecomposing, type RTMDesign } from './types.js'

/** 取设计章节：优先 rtm-design.yml，退回实时解析。 */
export function effectiveSections(ctx: RTMContext, reqId: string): DesignSection[] {
  const d = readRTM<RTMDesign>(getRTMPath(ctx.reqDir(reqId), 'rtm-design.yml'))
  const cached = d?.outputs?.design_sections
  if (Array.isArray(cached) && cached.length > 0) return cached
  return []
}

/** 生成/更新 rtm-decomposing.yml。 */
export function generateDecomposingRTM(ctx: RTMContext, reqId: string): RTMDecomposing {
  const filePath = getRTMPath(ctx.reqDir(reqId), 'rtm-decomposing.yml')
  const existing = readRTM<RTMDecomposing>(filePath)
  const frs = effectiveFRs(ctx, reqId)
  const sections = effectiveSections(ctx, reqId)
  const tasks = ctx.tasks(reqId)
  const designToTasks = buildDesignToTasks(sections, tasks)
  const frToTasks = buildFRToTasks(buildFRToDesign(frs, sections), designToTasks, frs.map(f => f.id))
  const data: RTMDecomposing = {
    metadata: ctx.metadata('decomposing', reqId, existing, { rtm_version: RTM_SCHEMA_VERSION }),
    inputs: { requirements: frs, design_sections: sections },
    outputs: {
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title ?? '',
        implements: t.implements ?? '',
        serves: t.serves ?? [],
        depends_on: t.depends_on ?? [],
        phase: t.phase ?? '',
        side: t.side ?? '',
      })),
    },
    // 每卡承接清单（data-model §6.4）：来源与 TaskRecord.prototypeRefs / decisionRefs 同源（决议 #36）。
    // 字段缺失 = 未采集 ⇒ 空数组——**不编造**（旧卡缺键正是"未采集"，补个猜测值会让覆盖度说假话）。
    task_coverage: tasks.map(t => ({
      task_id: t.id,
      covers_prototypes: [...(t.prototypeRefs ?? [])],
      covers_decisions: [...(t.decisionRefs ?? [])],
    })),
    traceability: { design_to_tasks: designToTasks, fr_to_tasks: frToTasks },
    coverage: { implementation: calculateImplementationCoverage(sections, designToTasks) },
  }
  writeRTM(filePath, data)
  return data
}
