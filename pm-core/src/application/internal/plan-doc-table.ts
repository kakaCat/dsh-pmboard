/**
 * 提交的那份计划文档里**任务表**的读取与判据（2026-10-06 缺口 4 之四）。
 *
 * 为什么需要它：批准人点「批准计划」时读的是**文档**，而落库读的是 `tasks[]` 数组——
 * 两者此前没有任何一致性判据。实测有一条需求 `decomposition.md` 只有 41 行、**没有任务表**，
 * 而 `plan.json` 里有 10 张完整卡：门禁全绿、人批的是一份空文档、落的是另一批卡。
 * 这就是「批准所见 ≠ 文档所见」，本模块把那句话变成可判定的两条硬判据 + 一条软判据。
 *
 * 判定分寸（刻意的，不是漏做）：
 *  · **硬判**只要求「有任务表 + 表里的 key 覆盖 tasks[].key 全集」——只判**有没有这张卡的落点**，
 *    不判列内容是否与数组逐字一致（文档是人读的汇总，允许有说明性差异，逐字比对只会逼人写机器文）。
 *  · **软判**（缺「验收标准」「工作量」这类该有的列）只点名、不拒——列缺失是**披露**问题，不是
 *    "批的东西不是落的东西"，用硬拒处置会把"先批后补文档"这条正常路径整条堵死。
 *  · 表头判据与 `scripts/template-gate-probe.mts` 的 decomposition 判据**同口径**（表头含「计划 key」）：
 *    同一件事（哪张表是任务表）在全仓只能有一份词法，否则探针绿、门禁红。
 *
 * @module dsh-pmboard/application/internal/plan-doc-table
 */
import { parseDocument } from './content-gates.js'
import { planKeysIn } from './content-trace.js'

/** 任务表的表头判据（与探针同口径；改这里必须同时改探针的 decompositionColumnGaps）。 */
const TASK_TABLE_HEADER = '计划 key'

export interface PlanDocTaskTable {
  /** 文档里有没有任务表（表头含「计划 key」）。 */
  found: boolean
  /** 表里出现的计划 key（自然序、去重）。 */
  keys: string[]
  /** 表头原文（软判与文案用）。 */
  header: string[]
}

/**
 * 读计划文档的任务表。只取**第一张**命中表——一份计划文档的任务表只有一张，
 * 多张同名表属于文档写坏了，此时按第一张判（不做"合并多表"的猜测，猜错会静默放行）。
 */
export function readPlanDocTaskTable(docText: string): PlanDocTaskTable {
  const table = parseDocument(docText).tables.find(t => t.header.some(h => h.includes(TASK_TABLE_HEADER)))
  if (table === undefined) return { found: false, keys: [], header: [] }
  const iKey = table.header.findIndex(h => h.includes(TASK_TABLE_HEADER))
  const keys: string[] = []
  for (const row of table.rows) {
    for (const k of planKeysIn((row[iKey] ?? '').trim())) {
      if (!keys.includes(k)) keys.push(k)
    }
  }
  return { found: true, keys, header: [...table.header] }
}

/** 硬判据：文档里根本没有任务表（批准人没东西可批）。 */
export function planDocTaskTableMissing(reading: PlanDocTaskTable): boolean {
  return !reading.found
}

/** 硬判据：表里的 key 覆盖不了 `tasks[].key` 全集 → 返回**没被文档收录**的卡 key。 */
export function planDocUncoveredKeys(reading: PlanDocTaskTable, keys: readonly string[]): string[] {
  const inDoc = new Set(reading.keys)
  return keys.filter(k => !inDoc.has(k))
}

/** 软判据：任务表缺该有的列 → 逐列点名（不拒，只进 `plan_doc_warnings`）。 */
export function planDocColumnWarnings(reading: PlanDocTaskTable): string[] {
  if (!reading.found) return []
  const header = reading.header.join(' | ')
  const out: string[] = []
  if (!header.includes('验收')) {
    out.push('计划文档任务表缺「验收标准」列——批准人在文档里看不到「怎么算做完」，只能回查 tasks[] 数组')
  }
  if (!/工作量|体量|footprint|S\/M\/L/i.test(header)) {
    out.push('计划文档任务表缺「工作量（S/M/L 或 footprint）」列——看不出哪张卡一轮装不下，超容量软门禁的读数在文档里不可见')
  }
  if (!header.includes('依赖')) {
    out.push('计划文档任务表缺「依赖」列——串并行关系在文档里看不见（落库依据是 tasks[].depends_on）')
  }
  return out
}
