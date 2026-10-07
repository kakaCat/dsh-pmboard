/**
 * 归档即沉淀（REQ-261001110934-3766 t7 / design/architecture.md「关键机制 2」）。
 *
 * 归档材料提交成功后，把这条需求的结论**真的写进知识层**：
 *   ① 分配条目 id（取索引里现有 kb-NNNN 最大值 +1，不依赖台账）；
 *   ② 写 `entries/<id>.md`（kind 由材料推断：有复盘 → pitfall；否则 decision）；
 *   ③ 把索引行写进 INDEX 对应分节（同源重复提交 → 复用 id、原位替换，幂等）。
 *
 * 失败策略：**抛错**（不静默）。归档记录已写台账，索引缺失会被 `kb-probe` K4/K5 报出来——
 * 「知识没沉淀」必须是可见的失败，而不是悄悄没有。
 *
 * @module dsh-pmboard/application/use-cases/DepositKnowledge
 */
import type { UseCaseDeps } from '../ports.js'
import type { KbKind } from '../../domain/knowledge/types.js'

/** 归档材料里与沉淀相关的字段（SubmitArchive 已校验过的形状）。 */
export interface ArchiveDepositInput {
  readonly requirementId: string
  readonly requirementTitle: string
  /** 一句话结论（归档 material.indexEntry，必填且非空）。 */
  readonly indexEntry: string
  /** 合并去向 / 证据指针（取第一个作为 L2 指针；空数组 → 无原文指针）。 */
  readonly mergedInto: readonly string[]
  /** 需求目录（指针兜底：requirement.md）。 */
  readonly dir: string
  /** 归档材料里登记的文档种类（含 retro → 按坑沉淀）。 */
  readonly docKinds: readonly string[]
  /** 归档日期（YYYY-MM-DD，由调用方注入时钟派生）。 */
  readonly archivedOn: string
  /** 是否已存在复盘（决定 kind）。 */
  readonly hasRetro: boolean
}

/** 归档 → 知识条目的内容组装（纯函数，便于单测）。 */
export function buildDepositDraft(input: ArchiveDepositInput): {
  kind: KbKind
  title: string
  oneLiner: string
  appliesWhen: string
  pointer: string
  updated: string
  req: string
  body: string
} {
  const kind: KbKind = input.hasRetro ? 'pitfall' : 'decision'
  const pointer = input.mergedInto[0] ?? (input.dir.length > 0 ? input.dir + '/verification.md' : '')
  const title = input.requirementTitle.length > 0 ? input.requirementTitle : input.requirementId
  // REQ-261006201841-944d t5 / FR-4：失效条件**由 pointer 与 req id 派生**，不再写死模板句——
  // 旧模板「相关实现被重构、或该结论被新条目 supersede 时」既无指针也无具体 id，人读不出
  // "这条还算不算数"（K14 的 60/60 全是它）。派生锚点：指针（缺省 → 源需求 id）可被判存在性。
  const invalidationAnchor = pointer.length > 0 ? pointer : input.requirementId
  const body = [
    '## 结论',
    input.indexEntry,
    '',
    '## 适用条件',
    '同类需求再次出现时（先读这条，别重复踩坑）',
    '',
    '## 证据',
    '归档目录：' + (input.dir.length > 0 ? input.dir : '（未登记）'),
    '材料文档：' + (input.docKinds.length > 0 ? input.docKinds.join(' / ') : '（未登记）'),
    '原始需求：' + input.requirementId,
    '',
    '## 失效条件',
    '`' + invalidationAnchor + '` 被删除或改名，或该结论被 `kb-XXXX` supersede（源需求 ' + input.requirementId + '）',
    '',
    '## 相关',
    pointer.length > 0 ? pointer : '（无合并去向）',
  ].join('\n')
  return {
    kind,
    title: title.slice(0, 120),
    // REQ-261006123819-3af3 FR-4 根因①：**先清洗非法字符再截断**。
    // 索引行语法禁 `·` / `→` / 换行（isOneLiner）；直接 slice 会把非法字符原样带进条目与
    // 索引行 → 该条目永远进不了索引（孤儿 kb-0043/kb-0048 就是这么来的）。
    // 与 operations.ts 的 entryToIndexRow 既有正确口径同源。
    oneLiner: input.indexEntry.replace(/[·→\n]/g, ' ').slice(0, 140),
    appliesWhen: '同类需求再次出现时',
    pointer,
    updated: input.archivedOn,
    req: input.requirementId,
    body,
  }
}

/**
 * 执行沉淀：知识层未装配 → 直接返回 `skipped`（**不阻断归档**：老部署没有知识层也能归档）；
 * 已装配但写入失败 → 抛错（响亮失败）。
 */
export async function depositArchiveKnowledge(
  deps: UseCaseDeps,
  input: ArchiveDepositInput,
): Promise<{ deposited: boolean; id?: string; reason?: string }> {
  const port = deps.knowledge
  if (port === undefined) return { deposited: false, reason: '知识层未装配（UseCaseDeps.knowledge 缺失）' }
  if (!(await port.indexExists())) {
    return { deposited: false, reason: '知识索引不存在（' + 'docs/knowledge/INDEX.md' + '）——先跑 kb-build --write' }
  }
  const draft = buildDepositDraft(input)
  const { id } = await port.appendEntry(draft)
  return { deposited: true, id }
}
