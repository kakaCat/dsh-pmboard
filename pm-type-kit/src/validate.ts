/**
 * 类型规格的**通用校验**与**稳定快照**（REQ-261009174713-7bc8 · RF-25 / RF-26）。
 *
 * 两件事，都是六类共用、与具体类型无关的：
 *   ① 校验：规格自己立不立得住（类型枚举合法、必填侧非空、无重复项……）；
 *   ② 快照：把规格 dump 成**确定性字符串**——同一批规格，无论谁先谁后，dump 逐字相同。
 *      这是 RF-26「六类型规格快照逐字不变」那条判据的机械载体（t9 用它对基线）。
 *
 * 判据口径：违规一律**逐条点名 path**（`category.field[0]` 形态），不吞不并——
 * 静默通过是这类门禁最危险的失效形态。
 *
 * @module pm-type-kit/validate
 */
import { ALL_REQ_CATEGORIES } from 'pm-common/protocol.js'
import type { TemplateRef } from 'pm-common/template/types.js'
import type {
  ArchiveRule,
  ConditionalArtifactRule,
  ConditionalDocRule,
  RequirementTypeSpec,
  StageTemplates,
} from './contract.js'

/** 单引用模板键（`designDocs` 是数组，单独处理）；顺序即快照的键顺序。 */
const SINGLE_REF_KEYS = [
  'requirement', 'prototype', 'decomposition', 'taskCard', 'testEvidence', 'review', 'verification', 'archiveIndex', 'retro',
] as const

/** 一条规格违规：`path` 指到具体字段（含数组下标），`message` 说清为什么不行。 */
export interface TypeSpecViolation {
  readonly path: string
  readonly message: string
}

function blank(v: unknown): boolean {
  return typeof v !== 'string' || v.trim().length === 0
}

/** 数组里是否有重复项（去首尾空白后比较）。 */
function duplicates(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const dup: string[] = []
  for (const raw of items) {
    const k = raw.trim()
    if (seen.has(k)) dup.push(raw)
    seen.add(k)
  }
  return dup
}

/** 校验一串「非空字符串」字段（逐条点名下标）。 */
function checkStringList(out: TypeSpecViolation[], path: string, items: readonly string[] | undefined): void {
  if (items === undefined) return
  items.forEach((item, i) => {
    if (blank(item)) out.push({ path: `${path}[${i}]`, message: '不能为空字符串' })
  })
  const dup = duplicates(items)
  if (dup.length > 0) out.push({ path, message: `有重复项：${dup.join('、')}` })
}

function checkDocRules(out: TypeSpecViolation[], path: string, rules: readonly ConditionalDocRule[] | undefined): void {
  if (rules === undefined) return
  rules.forEach((r, i) => {
    if (blank(r.name)) out.push({ path: `${path}[${i}].name`, message: '条件设计文档缺文件名' })
    if (blank(r.side)) out.push({ path: `${path}[${i}].side`, message: '条件设计文档缺触发端侧' })
  })
}

function checkArtifactRules(out: TypeSpecViolation[], path: string, rules: readonly ConditionalArtifactRule[] | undefined): void {
  if (rules === undefined) return
  rules.forEach((r, i) => {
    if (blank(r.stage)) out.push({ path: `${path}[${i}].stage`, message: '条件产物缺阶段名' })
    if (blank(r.kind)) out.push({ path: `${path}[${i}].kind`, message: '条件产物缺产物类别' })
    if (blank(r.side)) out.push({ path: `${path}[${i}].side`, message: '条件产物缺触发端侧' })
  })
}

/** 单条模板引用：`relPath` 必须是**资产包内相对路径**（绝对路径意味着有人想把读盘塞进类型包）。 */
function checkOneRef(out: TypeSpecViolation[], path: string, ref: TemplateRef): void {
  if (blank(ref.relPath)) out.push({ path: `${path}.relPath`, message: '模板引用缺相对路径' })
  else if (ref.relPath.startsWith('/')) out.push({ path: `${path}.relPath`, message: '模板引用必须是资产包内相对路径，不能是绝对路径' })
}

function checkTemplates(out: TypeSpecViolation[], path: string, entries: readonly StageTemplates[] | undefined): void {
  if (entries === undefined) return
  entries.forEach((entry, i) => {
    const at = `${path}[${i}]`
    if (blank(entry.stage)) out.push({ path: `${at}.stage`, message: '模板表缺阶段名' })
    for (const key of SINGLE_REF_KEYS) {
      const ref = entry[key]
      if (ref !== undefined) checkOneRef(out, `${at}.${key}`, ref)
    }
    entry.designDocs?.forEach((ref, j) => checkOneRef(out, `${at}.designDocs[${j}]`, ref))
  })
}

function checkArchive(out: TypeSpecViolation[], rule: ArchiveRule | undefined): void {
  if (rule === undefined) {
    out.push({ path: 'archive', message: '缺归档去向与说明书要求' })
    return
  }
  if (typeof rule.requireManual !== 'boolean') out.push({ path: 'archive.requireManual', message: '必须是布尔' })
  if (blank(rule.note)) out.push({ path: 'archive.note', message: '缺一句话依据（空话会被判红）' })
  checkStringList(out, 'archive.requiredDocs', rule.requiredDocs)
  checkStringList(out, 'archive.mergeTargets', rule.mergeTargets)
}

/** 校验一份类型规格；返回逐条违规（空数组 = 合法）。 */
export function validateTypeSpec(spec: RequirementTypeSpec): TypeSpecViolation[] {
  const out: TypeSpecViolation[] = []
  if (!(ALL_REQ_CATEGORIES as readonly string[]).includes(spec.category)) {
    out.push({ path: 'category', message: `类型枚举非法：${String(spec.category)}（合法值：${ALL_REQ_CATEGORIES.join(', ')}）` })
  }
  if (blank(spec.label)) out.push({ path: 'label', message: '缺中文标签' })
  checkStringList(out, 'rootSectionsDelta', spec.rootSectionsDelta)
  checkStringList(out, 'requiredDesignDocs', spec.requiredDesignDocs)
  checkDocRules(out, 'conditionalDesignDocs', spec.conditionalDesignDocs)
  checkArtifactRules(out, 'conditionalStageArtifacts', spec.conditionalStageArtifacts)
  checkTemplates(out, 'templates', spec.templates)
  checkArchive(out, spec.archive)
  checkStringList(out, 'promptFragments', spec.promptFragments)
  return out
}

/** 校验一批规格（逐份校验 + 类型键唯一）。 */
export function validateTypeSpecs(specs: readonly RequirementTypeSpec[]): TypeSpecViolation[] {
  const out: TypeSpecViolation[] = []
  specs.forEach((spec, i) => {
    for (const v of validateTypeSpec(spec)) out.push({ path: `[${i}].${v.path}`, message: v.message })
  })
  const seen = new Set<string>()
  specs.forEach((spec, i) => {
    if (seen.has(spec.category)) out.push({ path: `[${i}].category`, message: `类型重复登记：${spec.category}` })
    seen.add(spec.category)
  })
  return out
}

/** 哪些类型没登记（六类必须齐备；空数组 = 齐备）。 */
export function missingCategories(specs: readonly RequirementTypeSpec[]): readonly string[] {
  const have = new Set(specs.map((s) => s.category as string))
  return ALL_REQ_CATEGORIES.filter((c) => !have.has(c))
}

/** 违规 → 一行一条的可读文本（抛错与回执共用，别的模块不再各拼一遍）。 */
export function violationText(violations: readonly TypeSpecViolation[]): string {
  return violations.map((v) => `${v.path}：${v.message}`).join('\n')
}

/** 校验不过就**响亮抛错**（装配期用；错误信息带逐条违规）。 */
export function assertValidTypeSpecs(specs: readonly RequirementTypeSpec[], where: string): void {
  const violations = validateTypeSpecs(specs)
  if (violations.length > 0) {
    throw new Error(`[pm-type-kit] ${where}：类型规格不合法\n${violationText(violations)}`)
  }
}

/**
 * 规格的**确定性快照**：同一批规格无论谁先谁后，dump 逐字相同。
 *
 * 归一化口径（决定了快照能不能当基线）：
 *   · 规格按类型枚举的规范顺序排列（`ALL_REQ_CATEGORIES`），不看调用方传入顺序；
 *   · 对象键按固定顺序显式列出（不依赖对象字面量的书写顺序）；
 *   · 数组**保持声明顺序**——`mergeTargets` 这类字段顺序即优先级，排序会改语义；
 *   · 不写时间戳、不写路径、不读环境（快照必须是纯函数，否则基线必然抖动）。
 */
/** 单条模板引用的规范形（可选字段写成 null，保证快照键集合稳定）。 */
function canonicalRef(ref: TemplateRef): Record<string, unknown> {
  return { relPath: ref.relPath, title: ref.title ?? null, purpose: ref.purpose ?? null, description: ref.description ?? null }
}

/** 一个阶段模板表的规范形：键顺序固定（stage → 单引用键 → designDocs），不写则不出现。 */
function canonicalStageTemplates(entry: StageTemplates): Record<string, unknown> {
  const out: Record<string, unknown> = { stage: entry.stage }
  for (const key of SINGLE_REF_KEYS) {
    const ref = entry[key]
    if (ref !== undefined) out[key] = canonicalRef(ref)
  }
  if (entry.designDocs !== undefined) out.designDocs = entry.designDocs.map(canonicalRef)
  return out
}

export function serializeTypeSpec(spec: RequirementTypeSpec): string {
  const canonical = {
    category: spec.category,
    label: spec.label,
    description: spec.description ?? null,
    rootSectionsDelta: [...spec.rootSectionsDelta],
    requiredDesignDocs: [...spec.requiredDesignDocs],
    conditionalDesignDocs: (spec.conditionalDesignDocs ?? []).map((r) => ({ name: r.name, side: r.side })),
    conditionalStageArtifacts: (spec.conditionalStageArtifacts ?? []).map((r) => ({ stage: r.stage, kind: r.kind, side: r.side })),
    templates: (spec.templates ?? []).map(canonicalStageTemplates),
    archive: {
      requireManual: spec.archive.requireManual,
      requiredDocs: [...spec.archive.requiredDocs],
      mergeTargets: [...spec.archive.mergeTargets],
      note: spec.archive.note,
    },
    promptFragments: [...(spec.promptFragments ?? [])],
    docQuality: spec.docQuality ?? null,
  }
  return JSON.stringify(canonical, null, 2)
}

/** 一批规格的确定性快照（顺序归一后逐份 dump、以空行分隔）。 */
export function serializeTypeSpecs(specs: readonly RequirementTypeSpec[]): string {
  const order = new Map(ALL_REQ_CATEGORIES.map((c, i) => [c as string, i]))
  const sorted = [...specs].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99))
  return sorted.map(serializeTypeSpec).join('\n\n')
}
