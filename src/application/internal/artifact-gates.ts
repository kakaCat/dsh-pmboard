/**
 * 产物登记与分类感知闸门（REQ-31e11f t4）。
 *
 * 「节点完成 = 节点产物就位」的代码级落地：
 *   - registerArtifact()：产物登记幂等助手（同 stage+kind+path 不重复）；
 *   - assertArtifactGates()：状态转移前的两级校验——
 *     ① 产物存在门（missing_artifact）：该分类启用的阶段，必备产物已登记；
 *     ② 五道人工确认门（artifact_not_confirmed）：对应 kind 的产物须人确认（confirmedAt）。
 *
 * 分类感知：按 CATEGORY_FLOW_PROFILES 过滤该分类生效的门——bug 免需求分析门、
 * spike/doc/chore 只保留验收+归档门。存量需求（artifacts 字段 undefined/空）不硬拦，
 * 仅标记（向后兼容，避免锁死历史工作）。
 *
 * 2026-09-21 用户裁定：design>decomposing 不再用 planApproved 特判（原注释见 git 历史）——
 * 设计阶段只写设计文档，该门与拆分计划批准门（decomposing>implementing 锚定
 * decomposition 产物）都走通用 artifact.confirmedAt 判定。
 *
 * @module dsh-pmboard/host/artifact-gates
 */
import {
  confirmGateKindFor,
  flowProfileFor,
  type ArtifactKind,
  type RequirementRecord,
  type RequirementStatus,
  type StageArtifact,
  type StageKey,
} from '../../shared/protocol.js'
// 条件必交阶段产物的并集单点（REQ-261005105032-3b02 FR-1/FR-2）：基线 ∪ sides 命中项。
// 只 import 纯函数，不引 docs 端口——本模块仍保持同步、零 IO。
import { requiredStageArtifactKinds } from './category-doc-sets.js'
import { isRegisteredArtifact } from './prototype-registration.js'
import { isConfirmGateKind } from './pending-guard.js'
// 回退方向判定（REQ-261003204149-1e80 FR-2）：回退不适用「离开一个已完成节点」的闸门语义。
import { isRollback } from '../../domain/requirement/RollbackSpec.js'
import { fmt } from '../../domain/text/fmt.js'

// ---------------------------------------------------------------------------
// 产物登记（幂等）
// ---------------------------------------------------------------------------

/**
 * 向 req.artifacts 登记一条产物（就地修改）。
 * 幂等：同 stage+kind+path 已存在 → 不重复 push，返回 false。
 *
 * REQ-261005105032-3b02 t11（FR-1「登记才算数」）：同 path 已存在但那条是**自动发现**補登的
 * （`autoDiscovered === true`）时，本函数把它**升级**成显式登记（清标记 + 用本次的字段覆盖，
 * 其余键保留）并返回 true——因为否则"落盘未登记"永远变不成"已登记"：显式 submit 会被幂等闸挡掉，
 * 存在门收紧后 agent 照 how 文案做也照样被判未交（实测：升级前 registered_count=0、标记仍在）。
 */
export function registerArtifact(
  req: RequirementRecord,
  artifact: StageArtifact,
): boolean {
  req.artifacts ??= []
  const at = req.artifacts.findIndex(
    a => a.stage === artifact.stage && a.kind === artifact.kind && a.path === artifact.path,
  )
  if (at >= 0) {
    const existing = req.artifacts[at]
    // 「是不是自动发现補登的」判据单点在 prototype-registration（与存在门同一口径，不各写一份 filter）
    if (existing === undefined || isRegisteredArtifact(existing)) return false
    const upgraded: StageArtifact = { ...existing, ...artifact }
    delete upgraded.autoDiscovered
    req.artifacts[at] = upgraded
    return true
  }
  req.artifacts.push(artifact)
  return true
}

// ---------------------------------------------------------------------------
// 成组落章（REQ-2d1c74 FR-2/FR-3；REQ-261003222428-3556 FR-7/N-3 扩 task_detail/task_output）
// ---------------------------------------------------------------------------

/**
 * 按确认语义收集待落章产物：**成组 kind** 一次全落章，其余 kind 维持首份（历史语义）。
 * 三条确认通道（弹框/文字证据/看板一键）共用，保证"一次确认 = 全部有章"的口径全仓只有这一处。
 * 空数组 = 没有该 kind 产物（调用方按 missing_artifact 处理）。
 *
 * 成组 kind 清单（单一事实源，改它要同步 artifact-group-confirm 用例）：
 *  · design（REQ-2d1c74 FR-2/FR-3）——"一次确认设计 = 全部设计文档都有章"；
 *  · task_detail / task_output（REQ-261003222428-3556 FR-7 / N-3）——高频产物逐份落章
 *    实测一次交付积累 39 份待确认；成组后人点 1 次清一组（确认门语义不变，只是组织方式变）。
 */
export const GROUP_CONFIRM_KINDS: ReadonlySet<string> = new Set(['design', 'task_detail', 'task_output'])

export function artifactsToConfirm(req: RequirementRecord, kind: ArtifactKind): StageArtifact[] {
  const all = (req.artifacts ?? []).filter(a => a.kind === kind)
  return GROUP_CONFIRM_KINDS.has(kind as string) ? all : all.slice(0, 1)
}

/**
 * 待确认产物的聚合标签（REQ-261003222428-3556 FR-7 / N-3）——**催办按 kind 聚合**：
 * 成组 kind 合并为一条「kind×N（成组确认一次清）」，其余 kind 逐条（label 由调用方给）。
 * 与 GROUP_CONFIRM_KINDS 同源：聚合成什么样、确认就清什么——两件事用同一份清单。
 * 单份不成组（N=1 时退回逐条标签，不制造噪音）。
 */
export function aggregateUnconfirmedLabels(
  unconfirmed: readonly StageArtifact[],
  labelOf: (a: StageArtifact) => string,
): string[] {
  const grouped = new Map<string, StageArtifact[]>()
  const singles: StageArtifact[] = []
  for (const a of unconfirmed) {
    if (GROUP_CONFIRM_KINDS.has(a.kind as string)) {
      const list = grouped.get(a.kind as string) ?? []
      list.push(a)
      grouped.set(a.kind as string, list)
    } else {
      singles.push(a)
    }
  }
  const out = singles.map(labelOf)
  for (const [kind, arts] of grouped) {
    if (arts.length === 1) {
      out.push(labelOf(arts[0]!))
    } else {
      out.push(fmt('{kind}×{n}（成组确认一次清：{paths}）', {
        kind, n: arts.length, paths: arts.map((a) => a.path).join('、'),
      }))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 分类感知闸门（两级校验）
// ---------------------------------------------------------------------------

/** 闸门校验结果（成功 → undefined；失败 → 结构化原因）。 */
export interface GateFailure {
  code:
    | 'missing_artifact'
    | 'artifact_not_confirmed'
    // ── 内容闸门（REQ-d3e61a）：读文档**正文**的校验，与上面两级「登记态」正交互补 ──
    | 'requirement_uncovered'
    | 'dangling_reference'
    | 'orphan_clause'
    | 'design_orphan'
    | 'no_e2e_case'
    | 'acceptance_incomplete'
    | 'task_card_incomplete'
    | 'tbd_not_cleared'
    // ── 需求文档格式闸门（编号规范强制）──
    | 'requirement_missing_clauses'
    | 'requirement_clause_sequence_gap'
    | 'requirement_clause_duplicates'
    // 端侧声明门（2026-10-06 文档质量门禁加固）：feature/refactor 的 front-matter `sides`
    // 必须显式且值域合法——缺声明或写非法值原先都被静默过滤，条件必交设计文档永不触发。
    | 'requirement_sides_invalid'
    // 「失败与并发路径」必填节门（2026-10-06）：新需求的 requirement.md 缺该节即拒（存量不追溯）。
    | 'requirement_section_missing'
    // ── 设计阶段规范化（REQ-2d1c74）：G2 完整性门 + 拆分内容硬门 ──
    | 'design_doc_incomplete'
    | 'design_contains_decomposition'
    // ── 超容量标记在场（REQ-261002175818-80a8 t5 / FR-5）──
    | 'plan_overcapacity_marker_missing'
    // 计划文档任务表缺失 / 覆盖不了 tasks[].key（2026-10-06 缺口 4 之四）：批准人读的是**文档**、
    // 落库读的是**数组**，两者此前没有任何一致性判据——实测有需求 decomposition.md 只有 41 行、
    // 无任务表，而 plan.json 有 10 张完整卡（门禁全绿、批空文档、落另一批卡）。
    | 'plan_doc_task_table_incomplete'
    // ── 粒度门禁（REQ-261007125552-32cb FR-2 / FR-4）：判定单点 plan-granularity.ts ──
    // 清单条目无卡接 / 对照行 key 悬空（接口段与组件段分码，免得人靠读 gaps 猜是哪段）；
    // 一卡多接口且无 granularity_exempt 豁免。
    | 'plan_interface_map_missing'
    | 'plan_component_map_missing'
    | 'plan_card_multi_interface'
    // ── 既有实现已在返回的码（此前漏在联合里，被 tsc 拒收；补声明，零行为变化）──
    // 设计文档内容门（content-gate-wiring:checkDesignContentGate）
    | 'REQBOARD_DESIGN_CONTENT_GATE'
    // 三级追溯覆盖度门（content-gate-wiring:assertFullTraceabilityGate）
    | 'traceability_incomplete'
    // ── 需求阶段原型门 / 裁定门 / 阶段门时序（REQ-261005105032-3b02，§10 #35/#38/#39）──
    // 为什么加在这里而不是新开联合：四条转移路径的失败信封、传输码映射、HTTP 状态表都以
    // `GateFailure['code']` 为**唯一键控点**——门实现分模块（prototype-gates / decision-gates），
    // 码却必须同源，否则又成"两份真相"。
    // 边界（§10 #46）：本文件仍只做产物存在 / 人工确认门，**不新增门禁函数**、签名不变。
    | 'prototype_missing'
    | 'prototype_version_conflict'
    | 'prototype_anchor_missing'
    // REQ-261006201649-cc89：锚点门新增两问——① 权威原型仍是模板骨架（"填过没有"）；
    // ② 几何量读数无法复核（截图路径 + sha256 对不上）。两码与既有三码**并列不替代**：
    // 骨架自带示例 FR-1 与示例 geometry 块，天然"锚点齐"，共码会让人靠读 gaps 猜病因。
    | 'prototype_placeholder'
    | 'prototype_geometry_unverified'
    | 'decision_log_missing'
    | 'decision_entry_invalid'
    // 验收材料缺「与原型对照截图（含差异说明）」项（SubmitVerification，#38）
    | 'verification_prototype_compare_missing'
    // 阶段门时序逾期仍红（StageGateTimeline，#39）
    | 'stage_gate_overdue'
  /**
   * 缺/待确认的产物 kind。
   *
   * **可选**：绝大多数闸门都指向单一产物 kind，但三级追溯覆盖度门
   * （`assertFullTraceabilityGate`：需求←设计←任务←测试）跨越整条链、不对应某一个产物，
   * 该返回点本来就不带本字段。声明为可选 = 如实描述既有实现，零行为变化。
   */
  kind?: ArtifactKind
  /** 提示消息（含产物 path 或缺失说明） */
  message: string
  /** 结构化缺口（如缺失的根编号清单）：供 agent 精确修复与 UI 标红 */
  gaps?: string[]
}

/**
 * 该分类下，from 状态对应的必备产物 kind 列表。
 * 只检查「from 状态」的产物是否就位——转移的源头节点必须已完成。
 *
 * REQ-261005105032-3b02 FR-1/FR-2：必备产物 = **基线 ∪ 条件命中项**，并集规则只在
 * `requiredStageArtifactKinds` 里写一次（本函数改为调它，避免"条件必交"在这处长出第二份口径）。
 *
 * `sides` 为什么在这里**取不到**（如实说明，不是漏做）：本函数挂在**同步**单点
 * `assertArtifactGates` 上，而 `sides` 只存在于需求文档 front-matter 里（`designDocPolicyFrom`），
 * 读它必须走 async 的 docs 端口——同步上下文里拿不到。故此处退化为基线并集；
 * 条件必交的产物（UI 需求的原型）由 `contentGatesForMove` 分派的原型门在 async 侧执行。
 * 这不只是折中，也是**必须**的：若同步门把 prototype 当 missing_artifact 拦，
 * 那么 `prototype_exempt`（D-13：人已确认的豁免）就永远走不到豁免判定，豁免形同虚设。
 */
function requiredKindsFor(
  category: RequirementRecord['category'],
  from: RequirementStatus,
  sides: readonly string[] = [],
): readonly ArtifactKind[] {
  // 分类未启用该阶段 → 不要求产物
  if (!flowProfileFor(category).stages.includes(from as StageKey)) return []
  return requiredStageArtifactKinds(from as StageKey, category, sides)
}

/**
 * 状态转移前的两级产物闸门校验。
 *
 * 在 assertReqTransition **之后**、真正写盘之前调用。
 *
 * 两级：
 *  ① 产物存在门：该分类启用的 from 阶段必备产物已登记（存量需求不硬拦）；
 *  ② 人工确认门：confirmGateKindFor 返回的 kind，对应产物须 confirmedAt（存量不硬拦）。
 *
 * 2026-09-21 用户裁定：design>decomposing 不再特殊（原用 planApproved 判定）——
 * 设计阶段只写设计文档，统一走通用 artifact.confirmedAt 判定（kind=design）。
 *
 * @returns GateFailure | undefined（undefined = 通过）
 */
export function assertArtifactGates(
  req: RequirementRecord,
  from: RequirementStatus,
  to: RequirementStatus,
): GateFailure | undefined {
  // 取消需求（*>canceled）是**放弃路径**，不是节点推进——不适用「节点完成=产物就位」闸门。
  // 否则形成死锁：想取消一个卡在 decomposing 的需求，却被要求先交出 decomposition 产物
  // （2026-09-20 实测：REQ-6cbbf7 人工点取消被 missing_artifact 拒绝，看板无法解锁）。
  // gate-post-chain 早已声明「取消需求不进链」，这里把产物存在门/确认门一并豁免。
  if (to === 'canceled') return undefined

  // 回退方向同理（REQ-261003204149-1e80 FR-2）：下面两级的语义是「离开一个**已完成**的节点」
  // （产物就位 + 人已确认），而回退的动机**恰恰是 from 没完成**——最需要退的时候退不动。
  // 实测缺口：decomposing 未提交 decomposition.md 就退不回 design，被 missing_artifact 拒死；
  // `DecomposeSpec` 的注释里也记录过这个死锁的另一半。
  //
  // 安全责任随之**转移**：退回去之后由同一笔 mutate 内的 `applyRollbackRevocation` 如实作废
  // 下游的确认章与计划批准（FR-3）。两者必须同批生效——只上豁免就成了闸门缺口（退了但不作废）。
  if (isRollback(from, to)) return undefined

  // 存量需求（无 artifacts 字段或空数组）→ 不硬拦（向后兼容）
  const artifacts = req.artifacts
  const isLegacy = artifacts === undefined || artifacts.length === 0

  // ── 第一级：产物存在门 ────────────────────────────────────────────────
  const requiredKinds = requiredKindsFor(req.category, from)
  for (const kind of requiredKinds) {
    const found = artifacts?.find(a => a.stage === from && a.kind === kind)
    if (found === undefined && !isLegacy) {
      return {
        code: 'missing_artifact',
        kind,
        message: '节点产物缺失：' + from + ' 阶段须先完成产物（kind=' + kind + '）并登记到 req.artifacts',
      }
    }
  }

  // ── 第二级：五道人工确认门 ────────────────────────────────────────────
  const gateKind = confirmGateKindFor(req.category, from, to)
  if (gateKind !== undefined && !isLegacy) {
    // REQ-2d1c74 FR-2：kind=design 改「成组确认」判定——原来 find 第一份，
    // 第一份有章就放行，其余 design 产物（含确认后新自动发现的那份）可无章绕过 G2。
    // 现在 filter 全部、任一未确认即拒，未确认路径进 gaps 供精确修复与 UI 标红。
    // （design>decomposing 的 planApproved 特判已于 2026-09-21 移除——设计阶段只写设计文档，
    //   拆分计划的批准门在 decomposing>implementing。）
    const pool = (artifacts ?? []).filter(a =>
      gateKind === 'design' ? a.kind === 'design' : (a.stage === from && a.kind === gateKind))
    if (pool.length === 0) {
      return {
        code: 'missing_artifact',
        kind: gateKind,
        message: '节点产物缺失：' + from + ' 阶段须先完成产物（kind=' + gateKind + '）并登记',
      }
    }
    const unconfirmed = pool.filter(a => a.confirmedAt === undefined)
    if (unconfirmed.length > 0) {
      return {
        code: 'artifact_not_confirmed',
        kind: gateKind,
        gaps: unconfirmed.map(a => a.path),
        message: '产物待确认：' + unconfirmed.map(a => a.path).join('、') + '（kind=' + gateKind + '）——请人在项目看板一键确认后放行',
      }
    }
  }

  return undefined
}

// ---------------------------------------------------------------------------
// 阶段通知简版
// ---------------------------------------------------------------------------

/**
 * 产物登记成功的通知文案（阶段通知简版）。
 * 调用方负责实际发送（feishu_notify 或 logger.info 降级）。
 *
 * REQ-261005200052-ce40 FR-4：**门感知**——没有人工确认门的产物（如 `kind=prototype`）不许写「确认入口」，
 * 因为看板只为门值域（requirement / design / decomposition / verification）渲染确认控件：
 * 通知里写了「一键确认」，人翻遍看板也找不到，agent 还会照着它去自救。
 */
export function artifactNotifyText(
  req: RequirementRecord,
  artifact: StageArtifact,
): string {
  const gated = isConfirmGateKind(artifact.kind)
  return (gated ? '[reqboard] 产物已登记，请人审阅确认' : '[reqboard] 产物已登记（登记即生效，无需人工确认）')
    + '\n需求：' + req.id + ' ' + req.title
    + '\n节点：' + artifact.stage
    + '\n产物：' + artifact.path + '（kind=' + artifact.kind + '）'
    + (gated
        ? '\n确认入口：项目看板 → 需求卡 → 「待确认」一键确认'
        : '\n说明：该产物种类不在人工确认门值域内（门只有 requirement / design / decomposition / verification），登记即生效')
}
