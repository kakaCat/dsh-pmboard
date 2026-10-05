/**
 * 子卡模板映射表（REQ-4842fe t1）——子任务的**唯一契约起点**。
 *
 * 设计依据：design/data-model.md §2。三条口径：
 *  ① 映射表是**数据化配置**：新增卡类型 = 加一行（不改代码）；
 *  ② 未映射类型回退 dev → review（保守两卡，避免模板缺失时落空）；
 *  ③ 显式 stages 逃生舱口（FR-1b）：受控枚举、去重，用于映射表盖不住的新流程；
 *     **空数组 = 显式声明本卡不落链（solo）**（2026-09-28 卡片层契约）。
 *
 * 本文件是纯数据 + 纯函数：不 import node:/@deepseek-ai/，不碰时间与随机数（沿用 domain 层纪律）。
 */

/** 受控 stageKind 枚举（顺序即语义分组：研发族 / 复核 / 测试族 / 调研族 / 数据族 / 运维族）。 */
export const STAGE_KINDS = [
  'dev',
  'integrate',
  'review',
  'test',
  'repro',
  'fix',
  'regress',
  // REQ-261003203909-55f2 FR-1/FR-2：测试族补两段——e2e（场景断言，区别于 test 的「失败数≤基线」）
  // 与 manual（这步归人：真机/浏览器核对，链停下等人，见 AdvanceChain awaiting-manual 分支）。
  'e2e',
  'manual',
  'probe',
  'collect',
  'analyze',
  // REQ-261003203909-55f2 FR-6：采集段（探针/截图/基线），写入族——产物落 evidence/ 即凭证。
  'capture',
  'prepare',
  'run',
  'verify',
  'change',
  'dryrun',
  'apply',
  // REQ-261003203909-55f2 FR-3：发布段（打包/构建/发版门禁 + 回滚方式声明）。
  'release',
] as const

import { fmt } from '../text/fmt.js'

export type StageKind = (typeof STAGE_KINDS)[number]

const STAGE_KIND_SET: ReadonlySet<string> = new Set<string>(STAGE_KINDS)

/** 未映射类型的保守回退：先研发、再复核放行。 */
export const DEFAULT_FALLBACK_STAGES: readonly StageKind[] = ['dev', 'review']

/**
 * 卡类型 → 子卡集合（顺序即串行链序）。
 *
 * 顺序口径（2026-09-20 用户裁定）：review 在前、测试在后 —— 先复核设计与实现
 * 是否对齐（早发现偏离、改完再测不浪费），测试作为链尾放行门。故除 review-only 外，
 * 每种类型都以 review 收尾。
 */
export const SUBTASK_TEMPLATES: Readonly<Record<string, readonly StageKind[]>> = {
  feature: ['dev', 'integrate', 'review', 'test'],
  refactor: ['dev', 'integrate', 'review', 'test'],
  bug: ['repro', 'fix', 'review', 'regress'],
  doc: ['dev', 'review'],
  chore: ['dev', 'review'],
  spike: ['probe', 'review'],
  research: ['collect', 'analyze', 'review'],
  analysis: ['collect', 'analyze', 'review'],
  data: ['prepare', 'run', 'verify', 'review'],
  ops: ['change', 'dryrun', 'apply', 'verify', 'review'],
  'review-only': ['review'],
  // REQ-261003203909-55f2 FR-5：固化高频逃生舱组合（40 需求 627 子卡实测）——
  // change-only：文案/契约/纯函数类卡（手写 stages 19 次）；acceptance：链尾总验收卡（跨 3 需求手写 3 次）。
  // acceptance 是「每条链必含 review」不变量的显式豁免：它是全链收口后的总校验，复核已分散在各卡链尾。
  'change-only': ['dev', 'review'],
  acceptance: ['verify'],
}

/** 阶段中文名（看板徽标与子卡标题用；单点避免前后端各写一份）。 */
export const STAGE_LABELS: Readonly<Record<StageKind, string>> = {
  dev: '研发',
  integrate: '联调',
  review: '复核',
  test: '测试',
  repro: '复现',
  fix: '修复',
  regress: '回归测试',
  probe: '探针',
  collect: '取数调研',
  analyze: '分析',
  prepare: '准备',
  run: '执行',
  verify: '校验',
  change: '变更',
  dryrun: '试运行',
  apply: '实施',
  e2e: '端到端',
  manual: '人工核对',
  capture: '采集',
  release: '发布',
}

/** 各阶段默认验收模板：必须可证伪（含命令/断言锚点），不得是「功能正常」式空话。 */
export const STAGE_ACCEPTANCE: Readonly<Record<StageKind, string>> = {
  dev: '`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要',
  integrate: '`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）',
  review: '对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据',
  test: '`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）',
  repro: '`npx vitest run <新增回归用例>` → 修复前失败、修复后通过（贴两次输出）',
  fix: '`npx vitest run <回归用例>` → 转绿（贴命令与输出），且根因单独写明',
  regress: '`pnpm test` → 无新增失败（与基线比对，贴汇总输出）',
  probe: '给出可证伪问题的答案与证据（`npx vitest run <探针用例>` 或等价命令的输出）',
  collect: '数据样本量与来源已标注：给出取数命令（如 `npx tsx scripts/<脚本>.mts`）或输出文件路径，对齐 R-013 来源与时点口径',
  analyze: '结论含置信度与适用边界，并列出被证伪的假设（附支撑数据的命令或 `docs/requirements/<REQ>/` 下证据路径）',
  prepare: '方案或脚本改动可复现：`npx vitest run <自检用例>` 或脚本命令 + 输出摘要',
  run: '执行完成且结果落库：`npx tsx scripts/<执行脚本>.mts` 的记录条数或输出路径可复核',
  verify: '校验项逐条给出结果：`npx vitest run <校验用例>` → 全绿；异常项已列出并标注影响面',
  change: '变更内容与回滚方式已写明，并给出可执行验证命令（`npx vitest run <校验用例>`）与输出',
  dryrun: '试运行输出与预期一致（`npx tsx scripts/<脚本>.mts --dry-run` + 输出）',
  apply: '变更已生效：给出可复核的验证命令（`npx vitest run <校验用例>`）与输出',
  // REQ-261003203909-55f2：四段验收模板（可证伪、含命令锚点；语义边界与 STAGE_SCOPE_RULE 同源）。
  e2e: '端到端场景逐条给出：场景名 + 命令 + 退出码 + 输出摘要（如 `npx vitest run <e2e用例>` → 全绿）；场景清单覆盖本卡承接的 FR；失败如实贴输出，不改实现（改实现属研发段）',
  manual: '人工核对清单落盘 `docs/requirements/<REQ>/manual/<taskId>.md`：核对项逐条勾验（通过/不通过+现象）+ 截图或证据路径；机器不自动判过，核对结果更新必须晚于清单骨架生成时间',
  release: '构建/发版命令 + 完整输出（含构建戳或版本号断言，如 `pnpm build:client` 的 verify 门禁输出）；回滚方式显式写明（revert 范围/开关/数据回滚路径）',
  capture: '采集产物路径列表（`docs/requirements/<REQ>/evidence/` 下）+ 每项一句话内容摘要 + 一条可复核命令（`ls -la` / `head` / `sha256sum`）',
}

/**
 * 阶段证据形态（子卡完工凭证 L2，D17 结构性死路收口）——**与 STAGE_KINDS 同处的唯一事实源**。
 *
 * 为什么要分流：子卡完工凭证原先把「有 filesChanged 且文件新鲜」当**唯一**证据形态，而
 * review / test / verify 这类阶段天然不产 diff（它们产出的是**结论**：复核意见、测试输出）→
 * 100% 死在凭证门、链必停（D17 实测）。证据形态按阶段分两类：
 *   'file'    = 写入族：必须落盘——filesChanged 非空且至少一个文件真实存在、mtime ≥ 链出身；
 *   'verdict' = 结论族：天然无 diff——完工结论（completed）非空即放行。
 *
 * 新增 stageKind 必须在 STAGE_KINDS 与本表**同时**登记（Record<StageKind,…> 让漏登记成为类型错误）；
 * 未登记的阶段在凭证门按写入族从严处理（保守方向：拒绝 > 误放）。
 */
export const STAGE_EVIDENCE_KIND: Readonly<Record<StageKind, 'file' | 'verdict'>> = {
  // 写入族：必须留下落盘改动
  dev: 'file',
  repro: 'file',
  fix: 'file',
  prepare: 'file',
  run: 'file',
  change: 'file',
  apply: 'file',
  manual: 'file', // 人工核对：核对清单+结果落盘（mtime > 骨架生成时间，防伪造）
  release: 'file', // 发布：版本/变更文件改动 + 回滚声明
  capture: 'file', // 采集：产物落 evidence/（截图/探针输出/基线）
  // 结论族：产出是判断/输出，天然无 diff
  integrate: 'verdict',
  review: 'verdict',
  test: 'verdict',
  regress: 'verdict',
  probe: 'verdict',
  collect: 'verdict',
  analyze: 'verdict',
  verify: 'verdict',
  dryrun: 'verdict',
  e2e: 'verdict', // 端到端：场景断言输出（与 test 同族，语义区分写在验收模板）
}

/** 阶段中文名（未知 stageKind 回退为原值，避免渲染崩）。 */
export function stageLabel(kind: StageKind): string {
  return STAGE_LABELS[kind] ?? kind
}

/** 卡类型 → 子卡集合；未映射/空值回退 dev → review。 */
export function stagesForCardType(type: string | undefined | null): readonly StageKind[] {
  if (type === undefined || type === null) return DEFAULT_FALLBACK_STAGES
  const key = String(type).trim().toLowerCase()
  const hit = SUBTASK_TEMPLATES[key]
  return hit ?? DEFAULT_FALLBACK_STAGES
}

/**
 * 卡 phase → 默认子卡段（REQ-260928185112-e20d，2026-09-28）。
 *
 * 为什么需要：`stagesForCardType` 只认**需求分类**，于是同一需求下所有父卡落同一套子卡链。
 * 2026-09-28 实测（REQ-260928185112-e20d：7 父卡 × 4 段 = 28 段，分类 refactor）：
 * 计划自述「零调用方纯新增」的卡照样挂联调段、phase=test 的验证卡照样先挂 dev 段、
 * phase=doc 的文档卡也是 4 段；6 张联调卡共 19.2 min **零文件产出**（占该需求有效执行时间 34%）。
 *
 * 口径：只收「阶段语义与需求分类明显不同」的相位；未列出的（implement / ui / data…）继续按
 * 需求分类走映射表——**不做静默降级**，避免悄悄削掉本来就该有的联调/测试段。
 * 显式 `stages` 永远优先于本表（逃生舱口）；`skipIntegration` 仍可再裁掉联调段。
 * 段序沿用 2026-09-20 用户裁定：复核在前、测试在后。
 */
export const PHASE_STAGES: Readonly<Record<string, readonly StageKind[]>> = {
  /** 文档卡：无接口可联调，也没有独立的测试段（与 SUBTASK_TEMPLATES.doc 同口径）。 */
  doc: SUBTASK_TEMPLATES.doc,
  /** 复核卡：产出就是复核结论（与 review-only 同口径）。 */
  review: SUBTASK_TEMPLATES['review-only'],
  /** 合并卡：不新增接口（与 chore 同口径）。 */
  merge: SUBTASK_TEMPLATES.chore,
  /** 分析/取数卡：取数 → 分析 → 复核，没有研发与联调段。 */
  analysis: SUBTASK_TEMPLATES.analysis,
  /** 验证卡：要写验证脚本(dev)→复核(review)→跑(test)，但**没有新接口可联调**，故不落 integrate。 */
  test: ['dev', 'review', 'test'],
}

/** 按父卡 phase 取默认子卡段；未映射（含 undefined/未知相位）→ undefined，由调用方退回需求分类映射表。 */
export function stagesForPhase(phase: string | undefined | null): readonly StageKind[] | undefined {
  if (phase === undefined || phase === null) return undefined
  return PHASE_STAGES[String(phase).trim().toLowerCase()]
}

/**
 * 按父卡 side 取默认子卡段（REQ-260928185112-e20d 统一方案）——只有 `doc` 侧有明确答案：
 * 纯文档卡既无接口可联调、也没有独立测试段（与 SUBTASK_TEMPLATES.doc 同口径）。
 *
 * 其余端侧（frontend/backend/fullstack）**一律返回 undefined**，回到需求分类口径——
 * "这张卡有没有接口面"是**计划侧才能声明的事实**（skipIntegration / stages），代码不猜：
 * 从端侧推断"是否要与别的模块对接"必然猜错，猜错就是静默削段。
 */
export function stagesForSide(side: string | undefined | null): readonly StageKind[] | undefined {
  if (side === undefined || side === null) return undefined
  return String(side).trim().toLowerCase() === 'doc' ? SUBTASK_TEMPLATES.doc : undefined
}

export type ExplicitStagesVerdict =
  | { ok: true; value: StageKind[] }
  | { ok: false; error: string }

/**
 * 校验显式 stages 逃生舱口（FR-1b）：① 必须是数组（**空数组 = 显式无链，合法**，2026-09-28）；
 * ② 元素取自受控枚举；③ 不得重复。返回结构化原因，调用方拼错误码 REQBOARD_STAGES_INVALID。
 */
export function validateExplicitStages(stages: readonly unknown[]): ExplicitStagesVerdict {
  if (!Array.isArray(stages)) return { ok: false, error: 'stages 必须是数组' }
  // 空数组 = **显式声明「本卡不落子卡链」（solo）**（2026-09-28 卡片层契约）：
  // `undefined` = 未指定（走 phase → side → 需求分类映射）；`[]` = 明确无链——两者必须可区分，
  // 否则"没子卡"永远分不清「不需子卡」与「需要但未生成」。
  if (stages.length === 0) return { ok: true, value: [] }
  const out: StageKind[] = []
  const seen = new Set<string>()
  for (const raw of stages) {
    const kind = String(raw ?? '').trim()
    if (!STAGE_KIND_SET.has(kind)) {
      return {
        ok: false,
        error: fmt('非法 stageKind：{kind}（受控枚举：{allowed}）', { kind, allowed: STAGE_KINDS.join(', ') }),
      }
    }
    if (seen.has(kind)) return { ok: false, error: fmt('stageKind 重复：{kind}', { kind }) }
    seen.add(kind)
    out.push(kind as StageKind)
  }
  return { ok: true, value: out }
}

/** 子卡规格（落库前的中间形态；id 由调用方在写台账时生成）。 */
export interface SubtaskSpec {
  /** 链上下标（0 起），用于生成 dependsOn */
  chainIndex: number
  stageKind: StageKind
  /** 子卡标题，如「研发」 */
  title: string
  /** 可证伪验收模板 */
  acceptance: string
  /** 依赖链上前一张的下标；null = 依赖父卡的外部依赖（由调用方继承） */
  dependsOnIndex: number | null
}

/**
 * 由有序 stageKind 生成子卡规格：链内依赖 = 前一张；首卡 dependsOnIndex=null（由调用方接父卡依赖）。
 * 空集合返回空数组（不落任何子卡）。
 */
export function buildSubtaskSpecs(stages: readonly StageKind[]): SubtaskSpec[] {
  return stages.map((stageKind, i) => ({
    chainIndex: i,
    stageKind,
    title: stageLabel(stageKind),
    acceptance: STAGE_ACCEPTANCE[stageKind],
    dependsOnIndex: i === 0 ? null : i - 1,
  }))
}

// ── template 一等字段（REQ-261003203909-55f2 FR-4/FR-5）────────────────────
// 计划任务表可引用模板键（如 change-only/acceptance/ops）替代手写 stages 数组；
// 落库时一次解析为具体 stages（批准所见 = 落库所得），引用键冗余记录进 TaskRecord.template 供统计。

export type TemplateRefVerdict =
  | { ok: true; value: readonly StageKind[] }
  | { ok: false; error: string }

/** template 校验错误码（跨层可读：错误消息末尾也附一份，纯文本通道能识别；同 RequirementRefError 口径）。 */
export const TEMPLATE_REF_ERROR = 'REQBOARD_TEMPLATE_INVALID'
export const TEMPLATE_CONFLICT_ERROR = 'REQBOARD_TEMPLATE_CONFLICT'

/**
 * template 引用键校验：命中 SUBTASK_TEMPLATES → 该键的链；未命中/非字符串 → 结构化原因
 * （调用方拼 REQBOARD_TEMPLATE_INVALID；合法键清单写进原因，响亮失败不让人猜）。
 */
export function validateTemplateRef(template: unknown): TemplateRefVerdict {
  if (typeof template !== 'string' || template.trim().length === 0) {
    return { ok: false, error: 'template 必须是非空字符串（引用 SUBTASK_TEMPLATES 的键）' }
  }
  const key = template.trim().toLowerCase()
  const hit = SUBTASK_TEMPLATES[key]
  if (hit === undefined) {
    return {
      ok: false,
      error: fmt('非法 template：{key}（合法键：{keys}）', { key, keys: Object.keys(SUBTASK_TEMPLATES).join(', ') }),
    }
  }
  return { ok: true, value: hit }
}

export type PlanStagesVerdict =
  | { ok: true; value: readonly StageKind[] | undefined }
  /** code 仅在 template 相关失败时带（INVALID/CONFLICT）；stages 校验失败不带码（沿用 invalid_input 既有口径）。 */
  | { ok: false; error: string; code?: typeof TEMPLATE_REF_ERROR | typeof TEMPLATE_CONFLICT_ERROR }

/**
 * 计划卡 → 落库 stages 的统一解析（**优先级唯一实现点**；协议层计划解析调它一次，
 * 解析结果随计划落库、plan-landing 原样透传进 TaskRecord.stages，lazy-expand 收到的已是解析好的值）：
 *   stages（显式枚举，最高优先）> template（引用键）> undefined（交回 phase/side/分类兜底）。
 * 冲突规则：stages 与 template **同时给出 → 拒绝**（二选一，禁止两套口径并存埋歧义，
 * code=REQBOARD_TEMPLATE_CONFLICT）；template 非法 → code=REQBOARD_TEMPLATE_INVALID；
 * template + skipIntegration 合法（正交裁剪，不在此处处理）。
 */
export function resolvePlanStages(draft: {
  stages?: readonly unknown[]
  template?: string
}): PlanStagesVerdict {
  const hasStages = draft.stages !== undefined && draft.stages !== null
  const hasTemplate = draft.template !== undefined && draft.template !== null
  if (hasStages && hasTemplate) {
    return { ok: false, error: 'stages 与 template 二选一，不得同时给出', code: TEMPLATE_CONFLICT_ERROR }
  }
  if (hasStages) {
    const verdict = validateExplicitStages(draft.stages as readonly unknown[])
    return verdict.ok ? { ok: true, value: verdict.value } : { ok: false, error: verdict.error }
  }
  if (hasTemplate) {
    const verdict = validateTemplateRef(draft.template)
    return verdict.ok ? { ok: true, value: verdict.value } : { ok: false, error: verdict.error, code: TEMPLATE_REF_ERROR }
  }
  return { ok: true, value: undefined }
}
