/**
 * 归档说明书渲染器（REQ-261006201841-944d t3 / FR-5、FR-6）——
 * 「归档声明到底收尾成了什么」落成人可读的 `<需求目录>/archive.md`。
 *
 * ## 三条纪律
 *
 * ① **纯函数**：不 import `node:`、不碰时钟（`renderedAt` 由调用方注入）、不碰文件系统
 *    （所有实测读数由 `SubmitArchive` 采集后喂入）——本文件的 `Date` 只用于把**注入的毫秒**
 *    格式化成 ISO 文本——层边界测试按源码文本机械禁掉「取当前时间」那一族调用，故本文件连注释里
 *    也不出现它（写「读取当前时钟」即可）。
 * ② **渲染物不是事实源**：每一项都逐字来自输入（`indexEntry` 原文、闸 1 的 `ResolvedMergeTarget[]`、
 *    目录实测读数），不在这里新造判定、不重算。
 * ③ **机器产物分类只有一份**：`buildMachineGroups` 逐路径调
 *    `archive-exemptions.matchArchiveExemption`——渲染器与对账闸门用同一张 `ARCHIVE_EXEMPTIONS`
 *    表，避免"两套分类必然漂移"（FR-6 / D-2）。
 *
 * ## 幂等口径（FR-5 验收标准 2）
 *
 * 同一输入 → 同一文本（字节级）。跨次提交唯一的差异是**由 `renderedAt` 派生的那一行**
 * （「渲染时刻：…」），故调用方比对时先用 `stripRenderedAtLines` 整行剔除它，再逐字节比较：
 * 相同则不写盘、保留盘上首次时刻（`archive_manifest.written=false`）。不许拿整篇字节相等当
 * 幂等判据——那样每次提交都因时刻不同而重写，`written=false` 永远拿不到。
 *
 * @module dsh-pmboard/domain/requirement/archive-manifest
 */

import type { RequirementCategory } from './Requirement.js'
import { ARCHIVE_EXEMPTIONS, matchArchiveExemption } from './archive-exemptions.js'

/** 根判定来源（与 `application/internal/archive-targets.ts` 的 `RootJudgement` 同源同值）。 */
export type RootJudgement = 'project-id' | 'path-fallback'

/**
 * 一条合并去向的实测读数（**与 `application/internal/archive-targets.ts` 的 `ResolvedMergeTarget`
 * 结构同源**：路径 + 生效根 + 判据来源 + 存在性 + 字节数）。
 *
 * 为什么在 domain 再声明一次而不是 import：层边界（`tests/layer-boundary.test.ts`）禁止 domain
 * 反向依赖 application。两处形状必须逐字一致——结构不一致时调用方根本编译不过，故不需要额外守门。
 */
export interface ResolvedMergeTarget {
  /** 归一化后的目标路径（工作区相对）。 */
  readonly path: string
  /** 本次判据使用的生效根（绝对路径）。 */
  readonly root: string
  /** 生效根怎么来的；`unknown` = 记录既无 projectId 也无 workspaceRoot（F-1 兜底态）。 */
  readonly by: RootJudgement | 'unknown'
  /** 存在且字节数 > 0。 */
  readonly ok: boolean
  /** 实测字节数；不存在 → undefined（**缺失 ≠ 0**）。 */
  readonly bytes?: number
  /** 未通过时的原因（人读）；通过 → undefined。 */
  readonly reason?: 'missing' | 'empty'
}

/**
 * 归档材料里的一条说明书更新点（**与 `shared/protocol.ManualUpdate` 结构同源**；
 * domain 不得 import shared，故在此声明渲染需要的窄面）。
 */
export interface ManualUpdate {
  /** 取值形态 `<mergeTargets 白名单内的相对路径>#<该文档的标题锚点>`。 */
  readonly path: string
  /** **废弃字段**（保留仅为读侧兼容历史台账）：旧形态下渲染为 `path（旧：section）`。 */
  readonly section?: string
  /** 这一节多了什么认知。 */
  readonly summary: string
}

/** 台账镜像摘要（`queue.json`）；解析失败 → undefined，渲染为「无法解析，仅报体积」。 */
export interface QueueSummary {
  readonly tasks: number
  readonly edges: number
  readonly ready: number
  /** `generated_at` 原文（缺失 → undefined，**不编时间**）。 */
  readonly generatedAt?: string
  readonly bytes: number
}

/** 机器产物分区（由目录实测分类派生；一行一类，逐文件路径不铺开）。 */
export interface MachineArtifactGroup {
  /** 类别名（= `ARCHIVE_EXEMPTIONS[].id`：`rtm-reports` / `rtm-dir` / `ledger-mirror` / `runtime-state`）。 */
  readonly rule: string
  /** 人读类别名（渲染用）。 */
  readonly label: string
  readonly count: number
  readonly bytes: number
  /** `queue.json` 的摘要；解析失败 / 该类别没有摘要 → undefined。 */
  readonly queueSummary?: QueueSummary
}

/** 渲染输入（不落盘；全部读数由调用方采集）。 */
export interface ArchiveManifestInput {
  readonly requirementId: string
  readonly title: string
  readonly category: RequirementCategory
  /** 渲染时刻（由调用方注入；渲染器**不碰时钟**）。幂等比对时由 `stripRenderedAtLines` 剔除派生行。 */
  readonly renderedAt: number
  /** 一句话结论（`indexEntry` 原文，逐字进渲染物）。 */
  readonly indexEntry: string
  /** 归档目录（工作区相对）。 */
  readonly dir: string
  /** 清单（kind + path）。 */
  readonly docs: readonly { readonly kind: string; readonly path: string }[]
  /** 合并去向 + 逐条存在性读数（闸 1 的结果，直接复用、不重算）。 */
  readonly mergedInto: readonly ResolvedMergeTarget[]
  /** 说明书更新点（含旧形态，原样呈现）。 */
  readonly manualUpdates: readonly ManualUpdate[]
  readonly manualNote?: string
  /** 机器产物分区（由 `buildMachineGroups` 从同一次目录遍历派生）。 */
  readonly machine: readonly MachineArtifactGroup[]
  /** 人读文档数（分区标题里的对照数字）。 */
  readonly listedCount: number
}

/**
 * 一条目录实测读数（调用方从**同一次遍历**采集后喂入——渲染器自己不遍历目录，也不重复校验）。
 */
export interface MachineArtifactReading {
  /** 相对**需求目录**的路径（如 `rtm-implementing/t-1.yml`、`queue.json`）。 */
  readonly path: string
  readonly bytes: number
  /** 仅 `queue.json` 需要：原文（解析摘要用）；缺省 → 只报体积 + 「无法解析」。 */
  readonly text?: string
}

/** 由 `renderedAt` 派生的行标记（**唯一一处定义**：调用方不许各写一套剔除规则）。 */
export const RENDERED_AT_LINE_MARKER = '渲染时刻：'

/** 机器产物类别的**人读名**（分类本身仍只由 `ARCHIVE_EXEMPTIONS` 决定，这里只是呈现名）。 */
const MACHINE_LABELS: Readonly<Record<string, string>> = {
  'rtm-reports': '追溯报告（rtm-*.yml）',
  'rtm-dir': '追溯报告目录（rtm-*/）',
  'ledger-mirror': '台账镜像（queue.json）',
  'runtime-state': '运行态留痕（state/）',
}

/** 类别人读名（未登记的新规则 → 回落规则 id；**不抛错**，免得新增豁免把归档渲染打挂）。 */
export function machineLabelOf(rule: string): string {
  return MACHINE_LABELS[rule] ?? rule
}

/**
 * 剥掉**由 `renderedAt` 派生的整行**（幂等比对用：两处「渲染时刻：」行都被剔除）。
 *
 * 逐行过滤而不是 `String.replace`：只换掉标记本身会把空行留下，两份文本仍可能因行尾差异不等。
 */
export function stripRenderedAtLines(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.includes(RENDERED_AT_LINE_MARKER))
    .join('\n')
}

/**
 * 解析 `queue.json` 摘要（纯函数，零 IO）：任务数 / 依赖边数 / 就绪数 / `generated_at` / 字节数。
 *
 * **解析失败或字段形状不符 → undefined**（渲染为「无法解析，仅报体积」）：摘要是增益不是判据，
 * 坏 JSON 不得让一次合法归档失败。`bytes` 由调用方实测传入（渲染器不做 `stat`）。
 */
export function summarizeQueueJson(text: string | undefined, bytes: number): QueueSummary | undefined {
  if (text === undefined) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as { generated_at?: unknown; tasks?: unknown; edges?: unknown; ready?: unknown }
  // 三个计数都必须是数组：缺一个就说明这不是本工具认识的台账镜像（不把"读不到"渲染成 0）。
  if (!Array.isArray(o.tasks) || !Array.isArray(o.edges) || !Array.isArray(o.ready)) return undefined
  return {
    tasks: o.tasks.length,
    edges: o.edges.length,
    ready: o.ready.length,
    ...(typeof o.generated_at === 'string' ? { generatedAt: o.generated_at } : {}),
    bytes,
  }
}

/**
 * 机器产物分区（FR-6）：逐路径复用 `matchArchiveExemption` 分类，聚合成"一行一类"。
 *
 * 输出顺序 = `ARCHIVE_EXEMPTIONS` 表序（与目录遍历顺序无关，同一输入恒同一输出）；
 * 未命中豁免的一律不进分区（人读材料与机器产物两不相交）。
 */
export function buildMachineGroups(readings: readonly MachineArtifactReading[]): MachineArtifactGroup[] {
  const acc = new Map<string, { count: number; bytes: number; queue?: QueueSummary }>()
  for (const r of readings) {
    const rule = matchArchiveExemption(r.path)
    if (rule === undefined) continue
    const cur = acc.get(rule.id) ?? { count: 0, bytes: 0 }
    cur.count += 1
    cur.bytes += r.bytes
    if (rule.id === 'ledger-mirror') {
      const summary = summarizeQueueJson(r.text, r.bytes)
      if (summary !== undefined) cur.queue = summary
    }
    acc.set(rule.id, cur)
  }
  const out: MachineArtifactGroup[] = []
  for (const rule of ARCHIVE_EXEMPTIONS) {
    const hit = acc.get(rule.id)
    if (hit === undefined) continue
    out.push({
      rule: rule.id,
      label: machineLabelOf(rule.id),
      count: hit.count,
      bytes: hit.bytes,
      ...(hit.queue !== undefined ? { queueSummary: hit.queue } : {}),
    })
  }
  return out
}

/** 注入的毫秒 → ISO 文本（确定性：不读当前时间）。 */
function isoOf(ts: number): string {
  return new Date(ts).toISOString()
}

/** 一条合并去向的人读行：路径 + 存在性读数 + 生效根 + 判据来源（三要素缺一不可复核）。 */
function mergeTargetLine(t: ResolvedMergeTarget): string {
  const where = '（生效根 ' + t.root + '，判据来源 by=' + t.by + '）'
  if (t.ok) return '- `' + t.path + '` — ✅ 存在 ' + String(t.bytes ?? 0) + ' 字节' + where
  if (t.reason === 'empty') return '- `' + t.path + '` — ❌ 空文件（0 字节）' + where
  return '- `' + t.path + '` — ❌ 不存在' + where
}

/**
 * 一条说明书更新点的人读标签：新形态直接用 `path#anchor`；
 * **旧形态**（历史台账里 path 不带 `#`）把 `section` 回落呈现为 `path（旧：section）`——
 * 与 `SubmitArchive.manualUpdateLabelOf` / 看板读侧同款口径（存量信息不得丢）。
 */
function manualUpdateLabel(u: ManualUpdate): string {
  if (u.path.includes('#')) return u.path
  const legacy = typeof u.section === 'string' ? u.section.trim() : ''
  return legacy.length > 0 ? u.path + '（旧：' + legacy + '）' : u.path
}

/** 人读材料按 kind 分组（分组顺序 = 清单里的首次出现序；同一输入恒同一输出）。 */
function groupDocsByKind(docs: readonly { readonly kind: string; readonly path: string }[]):
Array<{ kind: string; paths: string[] }> {
  const out: Array<{ kind: string; paths: string[] }> = []
  for (const d of docs) {
    let g = out.find(x => x.kind === d.kind)
    if (g === undefined) {
      g = { kind: d.kind, paths: [] }
      out.push(g)
    }
    g.paths.push(d.path)
  }
  return out
}

/** 机器产物分区的一行（类别名 · 数量 · 体积）——逐文件路径**不铺开**（M-3）。 */
function machineGroupLine(g: MachineArtifactGroup): string {
  return '- ' + g.label + ' · ' + String(g.count) + ' 个 · ' + String(g.bytes) + ' 字节'
}

/** `queue.json` 摘要行（解析失败 → 「无法解析，仅报体积」，不抛错）。 */
function queueSummaryLine(g: MachineArtifactGroup): string | undefined {
  if (g.queueSummary !== undefined) {
    const s = g.queueSummary
    return '  - 摘要：任务 ' + String(s.tasks) + ' · 依赖边 ' + String(s.edges)
      + ' · 就绪 ' + String(s.ready)
      + ' · 生成时间 ' + (s.generatedAt !== undefined ? s.generatedAt : '未知（原文缺失）')
      + ' · ' + String(s.bytes) + ' 字节'
  }
  // 只有台账镜像这一类的摘要会缺失：文件不在分区里（类别整体不出现）或解析失败。
  return g.rule === 'ledger-mirror'
    ? '  - 摘要：无法解析，仅报体积（' + String(g.bytes) + ' 字节）'
    : undefined
}

/**
 * 渲染归档说明书（Markdown 文本）。纯函数：不碰时钟、不碰文件系统、不读环境变量。
 *
 * **分节顺序即契约**：归档结论 → 一句话结论 → 合并去向 → 人读材料 → 机器产物（可重建，折叠）
 * → 说明书更新点 → 相关。
 */
export function renderArchiveManifest(input: ArchiveManifestInput): string {
  const lines: string[] = []

  // ① 归档结论（目录 / 类型 / 渲染时刻）
  lines.push('# 归档结论（' + input.requirementId + ' ' + input.title + '）')
  lines.push('')
  lines.push('> 归档目录：`' + input.dir + '` ｜ 类型：' + input.category)
  lines.push('> ' + RENDERED_AT_LINE_MARKER + isoOf(input.renderedAt) + '（由归档提交注入）')
  lines.push('')

  // ② 一句话结论（indexEntry 原文逐字）
  lines.push('## 一句话结论')
  lines.push('')
  lines.push(input.indexEntry)
  lines.push('')

  // ③ 合并去向（逐条：路径 + 存在性读数 + 生效根 + 判据来源）
  lines.push('## 合并去向')
  lines.push('')
  if (input.mergedInto.length === 0) lines.push('- （无）')
  for (const t of input.mergedInto) lines.push(mergeTargetLine(t))
  lines.push('')

  // ④ 人读材料（kind 分组；计数与机器产物计数对照）
  const machineFiles = input.machine.reduce((n, g) => n + g.count, 0)
  lines.push('## 人读材料')
  lines.push('')
  lines.push('清单 ' + String(input.listedCount) + ' 份 · 对照机器产物 '
    + String(input.machine.length) + ' 类 / ' + String(machineFiles) + ' 份（按 kind 分组）：')
  for (const g of groupDocsByKind(input.docs)) {
    lines.push('')
    lines.push('**' + g.kind + '**（' + String(g.paths.length) + ' 份）')
    for (const p of g.paths) lines.push('- `' + p + '`')
  }
  lines.push('')

  // ⑤ 机器产物（可重建，折叠）：一行一类 + queue.json 摘要
  const machineBytes = input.machine.reduce((n, g) => n + g.bytes, 0)
  lines.push('## 机器产物（可重建，折叠）')
  lines.push('')
  if (input.machine.length === 0) {
    lines.push('- （无）')
  } else {
    lines.push('已折叠 ' + String(input.machine.length) + ' 类 / ' + String(machineFiles)
      + ' 份 · 共 ' + String(machineBytes) + ' 字节（逐文件不铺开；原文件位置与数量不变）：')
    for (const g of input.machine) {
      lines.push(machineGroupLine(g))
      const q = queueSummaryLine(g)
      if (q !== undefined) lines.push(q)
    }
  }
  lines.push('')

  // ⑥ 说明书更新点（新形态 path#anchor；旧形态 path（旧：section））
  lines.push('## 说明书更新点')
  lines.push('')
  if (input.manualUpdates.length === 0) {
    const note = input.manualNote ?? ''
    lines.push(note.length > 0 ? '- 无（' + note + '）' : '- （无）')
  } else {
    for (const u of input.manualUpdates) lines.push('- `' + manualUpdateLabel(u) + '` — ' + u.summary)
    const note = input.manualNote ?? ''
    if (note.length > 0) lines.push('- 备注：' + note)
  }
  lines.push('')

  // ⑦ 相关（台账锚点）
  lines.push('## 相关')
  lines.push('')
  lines.push('- 需求：`' + input.requirementId + '`（' + input.category + '）')
  lines.push('- 归档目录：`' + input.dir + '`')
  lines.push('- ' + RENDERED_AT_LINE_MARKER + isoOf(input.renderedAt) + '（归档材料提交时刻的渲染读数）')
  lines.push('- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。')
  lines.push('')

  return lines.join('\n')
}
