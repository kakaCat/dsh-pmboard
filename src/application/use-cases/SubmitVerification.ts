/**
 * SubmitVerification 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineVerifySubmitTool / reqboard_verify_submit 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/SubmitVerification
 */
import type { UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import { coverageGateOf, syncRTMYaml } from '../internal/rtm-yaml.js'
import { fmt } from '../../domain/text/fmt.js'
import { normalizeText,
  type VerificationSheet,
  type RequirementRecord,
  type TaskRecord,
} from '../../shared/protocol.js'
import { buildSheet, requirementItemTitle, PROTOTYPE_COMPARE_CRITERION, type SheetItemLike } from '../../domain/workflow/AcceptanceSheetSpec.js'
import { bindItemResults, itemResultBindingEnabled } from '../../domain/workflow/AcceptanceSheetSpec.js'
// REQ-261006092213-4f5b FR-1 / FR-2（D-3 / D-4 / D-7）：结构化逐项结果 —— 匹配与体检单点在 domain。
import { applyStructuredResults, matchStructuredResults, refKeyOf, splitUnmatched } from '../../domain/workflow/ResultBinding.js'
// REQ-261007160829-1991 FR-1 / design S-4：锚点形态提示是**单点常量**——弹框题干与拒绝回执的
// `how` 共用同一句（两处各写一份必然漂移，且漂移的正是"什么算可核验"这条判据的说明）。
import { ACCEPT_RESULT_FORM_HINT } from '../../domain/workflow/VerdictNotices.js'
import { checkDocCompleteness } from '../../domain/workflow/DocCompleteness.js'
import { renderVerificationDoc } from '../../domain/workflow/VerificationDoc.js'
import { docSyncSummary } from '../../domain/workflow/DocSyncSpec.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { applyTaskRollupVia } from '../internal/rollup.js'
import { captureSnapshot } from '../internal/token-usage.js'
import { registerArtifact } from '../internal/artifact-gates.js'
import {
  collectOrphanTestFiles,
  collectMissingAnchors,
  e2eCoverageOf,
  collectNumberedItems,
  collectTaskRefs,
  buildConsistencyRows,
  consistencyGaps,
  assertArtifactOpenable,
} from '../internal/content-gate-wiring.js'
import { toSheetTasks } from '../internal/sheet-tasks.js'
import { parseDocument } from '../internal/content-gates.js'
import { DECISION_SECTION_NAME } from '../internal/decision-gates.js'
import { designDocPolicyFrom } from '../internal/category-doc-sets.js'
import { parsePrototypeIndex, prototypeExemptOf } from '../internal/prototype-gates.js'
import { docQualityRulesApply } from '../../domain/workflow/DocQualityRules.js'
import { envelope } from '../internal/gate-feedback.js'
import { checkHowToVerify, checkAcceptance } from '../../domain/task/Acceptability.js'
// REQ-261005193546-1b1a FR-1/FR-2/FR-4：活卡判据单点——本用例四处手写 filter 收编（探针/守卫/ledger/落盘）
import { isLiveTask, liveTasksOf } from '../../domain/status/Predicates.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  rollupBlockersOf,
  workspacePathCandidates,
  assertWritableRequirementProject,
} from '../internal/support.js'
import { generateAcceptanceTracking } from '../internal/submit-rtm-integration.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from './queue-access.js'
import { readRTM, requirementsDir, getRTMPath } from '../../../vendor/reqboard/src/rtm/file-io.js'
import type { RTMAccepting } from '../../../vendor/reqboard/src/rtm/types.js'
import { askConfirm } from './AskConfirm.js'
// REQ-261006164732-6503 t5（serves: FR-1）：验收门的自动确认同样先过建门唯一入口
import { requestGate } from '../internal/gate-request.js'

export async function submitVerification(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; summary?: unknown; evidence?: unknown; results?: unknown }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const summary = normalizeText(a.summary, 'summary', 2000)
      if (summary.length === 0) reject('reqboard_verify_submit 未执行：summary 不能为空', 'REQBOARD_INVALID_INPUT')
      if (!Array.isArray(a.evidence)) reject('reqboard_verify_submit 未执行：evidence 必须是数组', 'REQBOARD_INVALID_INPUT')
      const evidence = (a.evidence as unknown[])
        .map(e => normalizeText(e, 'evidence[]', 1000))
        .filter(e => e.length > 0)
        .slice(0, 20)
      if (evidence.length === 0) {
        reject('reqboard_verify_submit 未执行：至少要有一条可复核的证据（命令+输出摘要 / 报告路径 / 截图路径）', 'REQBOARD_INVALID_INPUT')
      }
      // evidence 存在性校验（REQ-2e9473 t12）：evidence 里引用的工作区文件路径必须真实存在，
      // 防"编造证据路径"（事故 E 变体：文档/产物路径不存在也算证据）。
      const citedPaths = workspacePathCandidates(evidence)
      const docs = deps.docs
      const missingPaths = citedPaths.filter(p => !docs.exists(p))
      if (missingPaths.length > 0) {
        reject(
          fmt('reqboard_verify_submit 未执行：evidence 引用的文件不存在（疑似编造）：{paths}。请引用真实存在的产物/报告路径，或改用命令+输出摘要', { paths: missingPaths.join('、') }),
          'REQBOARD_EVIDENCE_MISSING',
        )
      }

      // t8/B11：绑定读改走新端口（只读摘要，不装配整册）；status 门也吃摘要 ⇒ 该门零文件读。
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) reject('reqboard_verify_submit 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      if (picked === undefined) {
        reject(fmt('reqboard_verify_submit 未执行：需求 {id} 不是本窗口绑定的进行中需求', { id: explicitId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
      }
      if (picked.status !== 'implementing' && picked.status !== 'accepting') {
        reject(fmt('reqboard_verify_submit 未执行：需求处于 {status}，只有执行/验收阶段的交付才能提交验收', { status: picked.status }), 'REQBOARD_BAD_STATUS')
      }
      // 判据过了才取**整条**（下游要目标需求的字段）；`get()` 返回可空 ⇒ 显式守卫，不用 `!` 断言。
      const target = await requirementStoreOf(deps).get(picked.id)
      if (target === undefined) {
        reject(fmt('reqboard_verify_submit 未执行：需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }

      const store = taskStoreOf(deps)
      // 任务已迁出台账（v9）：本用例的任务集从队列取一次，全程复用（下方拼 sheet / 文档校验 /
      // 渲染 / 阻塞判定共用同一份，避免多处各自读导致口径漂移）。
      const targetTasks = await store.listByRequirement(target.id)
      // REQ-261005193546-1b1a FR-2：活卡集合**只算一次**（单点 `liveTasksOf`）——下游所有分母
      // （文档探针 / 可执行性守卫 / 验收文档 ledger / RTM 探针与落盘）都吃这一份，
      // 从结构上堵住"同一用例两个分母（探针 132 / 落盘 106）"的死灰复燃。
      const liveTargetTasks = liveTasksOf(targetTasks)

      // ── 9 类文档完整性检查（REQ-308b9a FR-7 / AC-7.4、7.5）─────────────────
      // 口径见 domain/workflow/DocCompleteness.ts（与本仓 feature 流水线产物对齐，不另造清单）。
      // 缺项 → **拒绝提交**（"缺文档也能过验收"会让文档永远补不上）。
      const reqDir = 'docs/requirements/' + target.id
      // ── 对照项前置判定（REQ-261005105032-3b02 FR-7 / §10 #14/#37/#38/#45）──────────
      // 为什么在用例层做：适用性判据要读 requirement.md 的 front-matter（sides / prototype_exempt，async IO），
      // 而组装规则在 domain（buildSheet）单点。**缺项即拒**放在这里、文档门之前——它是"没有可对照的对象"，
      // 与"文档没交齐"是两回事，先报更贴近病因（且判据不依赖别的门是否通过）。
      const compare = await compareInputsOf(deps, target, reqDir)
      if (compare.needsPrototype) {
        reject(
          envelope({
            lead: 'reqboard_verify_submit 未执行：',
            what: fmt('需求 {id} 的验收单缺「{criterion}」项', { id: target.id, criterion: PROTOTYPE_COMPARE_CRITERION }),
            why: '本需求声明了 frontend 端侧（feature/refactor 且 requirement.md 的 sides 含 frontend），'
              + '但产物簿里没有已登记的 kind=prototype 原型、也没有生效的 prototype_exempt 豁免'
              + '——没有原型就没有可对照的对象（内部码 verification_prototype_compare_missing，§10 #38）',
            how: '先调 reqboard_submit(kind=prototype, requirement_id="' + target.id + '") 登记权威原型'
              + '（骨架见 templates/brainstorming/prototype.html），再重交验收材料；'
              + '确需豁免时在 requirement.md front-matter 写 prototype_exempt: <理由> 并请人确认 requirement 产物',
          }),
          'REQBOARD_VERIFICATION_INCOMPLETE',
        )
      }
      const collectDir = (sub: string): string[] => docs.list(sub.length > 0 ? reqDir + '/' + sub : reqDir)
        .filter(e => e.isFile)
        .map(e => (sub.length > 0 ? sub + '/' + e.name : e.name))
      const reqFiles = new Set<string>([
        ...collectDir(''),
        ...collectDir('design'),
        ...collectDir('tasks'),
        ...collectDir('reviews'),
        ...collectDir('tests'),
      ])
      const reqTaskIds = liveTargetTasks.map(t => t.id)
      // 存量/直种需求（artifacts 为空）→ 豁免，不追溯惩罚（同 isLegacyForHow 的口径）；
      // 走新流水线的需求在 requirement/plan/design 各节点已登记产物，故必然被检查。
      // 两条豁免口径（都指向"不是走新流水线落盘的需求"）：
      //   ① artifacts 为空 —— 直种/存量数据，不追溯（同 isLegacyForHow）；
      //   ② 需求目录为空 —— 文档体系根本未建立（测试种子/脏数据）。
      // 真实需求在 brainstorming 必落 requirement.md，故目录非空、必然受检。
      // 判据用**盘上是否有 requirement.md**（稳定信号：本流程第一次提交会写 verification.md，
      // 若用"目录非空"会被自己生成的产物破坏——实测踩过）。真实需求在 brainstorming 必落它。
      const isLegacyForDocs = target.artifacts === undefined || target.artifacts.length === 0 || !reqFiles.has('requirement.md')
      const docCheck = isLegacyForDocs
        ? { passed: true, missing: [] as string[] }
        : checkDocCompleteness({ files: reqFiles, taskIds: reqTaskIds })
      if (!docCheck.passed) {
        reject(
          fmt('reqboard_verify_submit 未执行：验收前置的 9 类文档未齐——{list}。请补齐后再提交验收（AC-7.5）', { list: docCheck.missing.join('、') }),
          'REQBOARD_DOC_INCOMPLETE',
        )
      }

      // ── 孤儿用例检测（REQ-d3e61a T-7 / FR-5）：设计文件点名了、但文件头未声明覆盖的测试文件 ──
      // 警告级：不阻断提交，但必须成为验收面上**可见的一项**（靠人记得 = 不该有的形态）。
      // 必须在 mutate 之前算（读文件是异步的，而 mutate 回调是同步的）。
      // ── 「怎么验」（REQ-d3e61a T-9 / FR-10）：验收项必须能照着动手验 ──────────────
      // 计划期门槛是"含断言词"（VERIFIABLE_ANCHOR），验收期门槛是"能独立复核"（HOW_TO_VERIFY：
      // 命令 / 可查数据 / 可达界面路径）。两层之间的**缝**正是本卡要堵的。
      // 分流（与其它内容闸门同语义）：
      //   ① 存量需求（artifacts 为空）→ 豁免，不追溯惩罚
      //   ② 过了计划期锚点但验收期不可操作 → **硬拦**（须先用 reqboard_task_move 的 acceptance
      //      参数修订——修订通道见 AmendTaskAcceptance.ts，硬拦必须配修复路径，否则是死锁）
      //   ③ 连锚点都没有（直种/历史数据）→ 只作**可见项**，不允许静默
      const isLegacyForHow = target.artifacts === undefined || target.artifacts.length === 0
      const unverifiable: string[] = []
      const hardUnverifiable: string[] = []
      if (!isLegacyForHow) {
        for (const t of targetTasks) {
          // "已取消就跳过"的守卫行为逐字不变，只是判据改走单点（REQ-261005193546-1b1a FR-4）
          if (!isLiveTask(t)) continue
          const acceptance = t.acceptance ?? ''
          const key = t.title.length > 0 ? t.title : t.id
          const how = checkHowToVerify(key, acceptance)
          if (how.ok) continue
          if (checkAcceptance(key, acceptance).ok) hardUnverifiable.push(how.reason)
          else unverifiable.push(how.reason)
        }
      }
      if (hardUnverifiable.length > 0) {
        reject(
          fmt('reqboard_verify_submit 未执行：以下验收项无法照着验——{items}。可用 reqboard_task_move(task_id, acceptance=...) 修订（修订通道已就位）', { items: hardUnverifiable.join('；') }),
          'REQBOARD_ACCEPTANCE_NOT_EXECUTABLE',
        )
      }

      const orphanTestFiles = await collectOrphanTestFiles(deps.docs, target)
      // 验收锚点失效（REQ-260930183951-eb6c FR-2）：验收标准引用的 tests/*.test.* 不存在 → 可见项。
      // 同步探针（docs.exists），必须在 mutate 之前算好（mutate 回调是同步的）。
      // REQ-261005193546-1b1a FR-5：喂**活卡**——吃全量时已取消卡的锚点缺失会作为可见项渲染进验收文档，
      // 那就是「界面一处都不出现」的真泄漏（收口窗口复核 t7 时补上，见 t-879f7e 卡片汇报）。
      const anchorGaps = collectMissingAnchors(deps.docs, liveTargetTasks)
      // E2E 覆盖读数（FR-11）：读需求文档的测试策略表。读数未知（undefined）时不追加可见项。
      const e2eCoverage = await e2eCoverageOf(deps.docs, target)
      // 三方一致性（FR-9）：做什么（需求编号）× 怎么做（设计章节 serves）× 实际做了什么（任务↔编号绑定）。
      // 绑定从 decomposition.md 的 RTM 表读——没有该表时**不比对**（避免把"没记录"误报成"实施缺失"）。
      const taskRefs = await collectTaskRefs(deps.docs, target)
      const consistency = taskRefs.length === 0
        ? []
        : consistencyGaps(buildConsistencyRows(await collectNumberedItems(deps.docs, target), taskRefs))

      // ── 门禁预检（FR-2 触发点 7 / FR-5）：测试覆盖度必须 ≥80% 才允许提交验收 ──
      // 读 tests/*.md + design/test-cases.md + tasks/*.md 的 covers: 标注；无数据时不拦截（FR-9）。
      // 存量/直种需求（无 requirement.md / artifacts 为空）豁免——同上口径。
      // REQ-261005193546-1b1a FR-2：探针喂**活卡**（`liveTargetTasks`）——改前此处吃全量 `targetTasks`，
      // 于是同一次提交里"门禁读 132、文件写 106"（下游 `:363` 吃的是过滤后的 `tasks`）。
      // 现在探针与落盘同一份分母；入口侧（rtm-yaml 两个公开入口）也各自剔一次卡，两处同口径。
      const verifyGateProbe = isLegacyForDocs ? undefined : await syncRTMYaml(deps, liveTargetTasks, target.id, 'submit:verification')
      const testGate = coverageGateOf('accepting', verifyGateProbe)
      if (testGate !== undefined && !testGate.passed) {
        reject(
          'reqboard_verify_submit 被测试覆盖度门禁拒绝：' + (testGate.message ?? '测试覆盖度不足')
            + '。请在测试文档里用 `covers: t-xxx` 标注补上缺失任务的测试后重新提交。',
          'REQBOARD_TESTING_COVERAGE_GATE',
        )
      }

      // ── FR 追溯断链（REQ-260930094139-2d65 FR-5）：门禁探针通过后读回 rtm-accepting.yml，
      // fr_to_tests 为空的 FR = 断链（FR→设计→任务→测试链路断裂）→ 生成提示验收项（不阻断提交）。
      // 探针失败（undefined）→ 跳过（RTM 是增强层，不能因读不到而拦主流程）。
      const traceabilityGaps = verifyGateProbe === undefined
        ? []
        : readTraceabilityGaps(deps, target.id)

      const nowTs = deps.clock.now()
      // 逐项交代的回执（在 mutate 回调内赋值；见回调里的顺序说明）。
      const bindingEnabled = itemResultBindingEnabled(process.env)
      const structuredGiven = a.results !== undefined
      let resultsMatched = 0
      let resultsBound = 0
      let resultsOutOfScope: readonly string[] = []
      let resultsCoverage: 'complete' | 'legacy' = 'legacy'
      let textUnmatched: readonly string[] = []
      const result = await mutateIfPresent(requirementStoreOf(deps), target.id, (req) => {
        // ── 逐项验收单组装（REQ-2e9473 t13/W6；规则在 domain/workflow/AcceptanceSheetSpec.ts，t4）──
        // items = 每任务验收标准 + 需求级标准；返工时（上一版有未过项）只含未过项。
        // REQ-260930183951-eb6c FR-1：投影单点为 toSheetTasks（**必须**透传 parentId，否则
        // buildSheet 的 domain 侧二次过滤恒等通过、"双保险"只剩一层）。
        //
        // REQ-261006092213-4f5b FR-2（复核 R1 步骤序 / 第二版复核 F1 更正）：组装必须
        //   ① 排在逐项交代硬门**之前**——可预见集合是按**组装出来的项**判的
        //     （「E2E 覆盖：有」那一行、原型豁免说明行的豁免只有靠项才判得出）；
        //   ② 且必须**在 mutate 回调内**跑——`prevSheet` / `sheetHistoryLength` 要读**此刻新鲜**的
        //     `req.verification`。曾经把组装前移到回调之外（读 `target` 快照），并发写者刚落的那一版
        //     会被整体覆盖且不进历史（复核实测：version 撞号、history 出现 [1,1]）。
        // **同一次调用只组装一次**：预览单与落库单是同一份对象（为跑门禁重算第二次 = 口径漂移）。
        const allTasks = toSheetTasks(targetTasks)
        const prevSheet = req.verification?.sheet
        const built = buildSheet({
          sheetHistoryLength: req.verification?.sheetHistory?.length ?? 0,
          ...(prevSheet !== undefined ? { prevSheet } : {}),
          tasks: allTasks,
          evidence,
          ...(orphanTestFiles.length > 0 ? { orphanTestFiles } : {}),
          ...(unverifiable.length > 0 ? { unverifiableItems: unverifiable } : {}),
          ...(e2eCoverage !== undefined ? { e2eCoverage } : {}),
          ...(consistency.length > 0 ? { consistencyGaps: consistency } : {}),
          ...(anchorGaps.length > 0 ? { anchorGaps } : {}),
          ...(traceabilityGaps.length > 0 ? { traceabilityGaps } : {}),
          // 两个对照项（§10 #14/#37/#45）：原型对照（或豁免说明行）+ 有 D-x 时的裁定对照
          ...(compare.prototypeCompare !== undefined ? { prototypeCompare: compare.prototypeCompare } : {}),
          ...(compare.decisionIds.length > 0 ? { decisionIds: compare.decisionIds } : {}),
          generatedAt: nowTs,
          generatedBy: { kind: 'agent', sessionId: windowKey },
        })
        // ── 先兼容、后主路径（复核 F4 更正顺序）──────────────────────────────
        // REQ-261001184609-cecb FR-1 兼容路径（FR-8）：evidence 里 `<验收项id> :: <结果>` 的老写法仍解析；
        // **未命中的键不再静默**（旧实现丢弃了 `unmatched` 返回值——那正是"键写错也报齐了"的成因）。
        // 顺序刻意是「文本（兼容回填）→ 结构化（契约主路径）」：主路径**最后写赢**，
        // 否则兼容路径会覆盖本次结构化写入、而 `results_bound` 已先行计过数（自查会误判）。
        if (bindingEnabled) textUnmatched = bindItemResults(built.sheet.items, evidence).unmatched
        // ── 逐项交代硬门 + 落结果（FR-1 / FR-2 / FR-8 · D-3 / D-4 / D-7）──────────────
        // 校验与写入都在 `req.verification` 被赋值**之前**，且 `fn` 只改本地克隆（抛出不落盘）
        // ⇒ 拒绝时台账零变更（revision 都不动）。回滚开关关闭逐项绑定时整段跳过（一行配置回退旧口径）。
        // 顺序：形状 → 冲突 → 重复 → 交代完整性 → **指不到项 → 漏项**（interfaces.md 判定顺序：
        // 先判「ref 指不到项」，否则「坏 ref + 忘填结果」会被报成「没给 result」，把 agent 引向错误的修法）。
        if (bindingEnabled && structuredGiven) {
          const outcome = bindStructuredResults(
            built.sheet.items,
            a.results,
            knownResultKeysOf(liveTargetTasks, compare),
          )
          resultsMatched = outcome.matched
          resultsBound = outcome.changed
          resultsOutOfScope = outcome.outOfScope
          resultsCoverage = 'complete'
        }
        const sheet: VerificationSheet = built.sheet as VerificationSheet
        req.verification = {
          summary,
          evidence,
          submittedAt: nowTs,
          submittedBy: { kind: 'agent', sessionId: windowKey },
          sheet,
          sheetHistory: [
            ...(req.verification?.sheetHistory ?? []),
            ...(prevSheet !== undefined ? [prevSheet] : []),
          ],
        }
        req.comments.push({
          id: deps.ids.comment(),
          body: fmt('[验收] 提交验收材料（待人工审核）：{summary}\n证据：\n{evidence}', {
            summary,
            evidence: evidence.map(e => '- ' + e).join('\n'),
          }),
          createdAt: nowTs,
          createdBy: { kind: 'agent', sessionId: windowKey },
        })
        req.updatedAt = nowTs
        req.updatedBy = { kind: 'agent', sessionId: windowKey }
        return { changed: true }
      })
      // 任务全完成时顺带推进到验收态（人来了就有东西可审）。
      // B12 阶段②c：从"同一次整册 mutate"拆成**紧随其后的定点调用**（顺序与旧路径一致）。
      await applyTaskRollupVia(
        requirementStoreOf(deps),
        targetTasks,
        { now: nowTs, commentId: () => deps.ids.comment(), snapshot: () => captureSnapshot(deps, windowKey) },
        target.id,
      )
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_verify_submit 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      // ── 产物登记（REQ-31e11f t4）：verification 产物 ─────────────────────
      // ── verification.md 结构化生成（FR-7 / AC-7.1~7.3）────────────────────
      // 四段：验收列表（含派生操作步骤/预期结果）· 测试报告 · 文档完整性检查 · 验收结果表。
      const verPath = reqDir + '/verification.md'
      const sheetNow = changed.verification?.sheet
      const ledgerTasks = liveTargetTasks
      const taskById = new Map(ledgerTasks.map(t => [t.id, t]))
      const docItems = (sheetNow?.items ?? []).map(it => {
        const src = it.source
        const t = src.kind === 'task' ? taskById.get(src.taskId) : undefined
        const who = it.decidedBy === undefined
          ? undefined
          : [it.decidedBy.kind, it.decidedBy.sessionId].filter(v => v !== undefined && v !== '').join('/')
        return {
          id: it.id,
          // REQ-260930183951-eb6c FR-4：需求级项标题走 domain 单点（三处调用方同源）。
          title: src.kind === 'task' ? (t?.title ?? src.taskId) : requirementItemTitle(it.criterion, it.gapKind),
          criterion: it.criterion,
          howToVerify: src.kind === 'task' ? (t?.acceptance ?? it.criterion) : it.criterion,
          status: it.status,
          ...(it.opinion !== undefined ? { opinion: it.opinion } : {}),
          ...(who !== undefined ? { decidedBy: who } : {}),
          ...(it.decidedAt !== undefined ? { decidedAt: it.decidedAt } : {}),
        }
      })
      // REQ-261001203710-0fbf t7 / FR-2：验收文档是工作区相对落盘——写前按需求 id 核验根
      await assertWritableRequirementProject(deps, target.id)
      await docs.write(verPath, renderVerificationDoc({
        reqId: target.id,
        title: target.title,
        summary,
        sheetVersion: sheetNow?.version ?? 1,
        items: docItems as never,
        testReport: evidence,
        docCheck,
      }))
      // REQ-2d1c74 FR-5：写盘后核验可打开性——写盘静默失败时当场响亮，而不是登记一个不存在的产物
      assertArtifactOpenable(deps.docs, verPath)
      await mutateIfPresent(requirementStoreOf(deps), changed.id, (r) => {
        registerArtifact(r, {
          stage: 'accepting', kind: 'verification', path: verPath,
          registeredAt: nowTs, registeredBy: { kind: 'agent', sessionId: windowKey },
        })
        return { changed: true }
      })
      const tasks = liveTasksOf(await store.listByRequirement(target.id))
      // t8/B11：只需该需求单条（此前为凑一个 rollupBlockersOf 的未用实参而整册读）
      const reqNow = await requirementStoreOf(deps).get(changed.id)
      // rollup 阻塞显式化（REQ-2e9473 t02）：有未完成任务时验收材料虽收，但需求进不了 accepting
      // D4：rollupBlockersOf 新签名 (ledger, tasks, reqId, reqStatus)。
      const blockers = reqNow === undefined ? undefined : rollupBlockersOf(tasks, reqNow.id, reqNow.status)
      // 说明文案与变量**在 return 之外**组装：输出契约门禁静态扫描 return 字面量的顶层键，
      // 把 fmt 的变量表误读成响应字段（实测被误判为 n/list 两个未声明字段）。不改门禁，改写法。
      const blockerBlock = blockers === undefined
        ? {}
        : {
            blockers,
            warning: fmt('⚠️ 需求未进验收（rollup 阻塞）：{n} 个任务未完成——{list}。若为重复拆分产生的幽灵任务，请人工取消后重新提交', {
              n: blockers.length,
              list: blockers.map(b => b.id + ' ' + b.title + '（' + b.status + '）').join('；'),
            }),
          }
      const finishNote = blockers === undefined
        // REQ-261006164732-6503 t8（serves: FR-3）：基础文案不再无条件指向 ask_confirm——
        // 验收门会自动弹（下面那段），再指一次就是"叫 agent 去开第二个框"。
        // 是否要人再发起，看紧随其后的 autoConfirmNote（它写明本次是已自动触发 / 已有一道门在等 / 已落章）。
        ? '验收材料已提交。请人逐项审核：本提交已按下面说明处理确认通道（看板「验收通过/退回」同样有效）。'
        : fmt('验收材料已提交，但需求因 {n} 个未完成任务停在 implementing——见 warning/blockers', { n: blockers.length })
      // RTM 集成：生成 acceptance_tracking（REQ-260925172227-2d61 FR-2）
      let rtmData: ReturnType<typeof generateAcceptanceTracking> | undefined
      try {
        const prevTracking = reqNow?.verification?.sheet?.rtmTracking
        rtmData = generateAcceptanceTracking(reqDir, prevTracking)
      } catch (rtmErr) {
        // RTM 生成失败不阻断提交，但记录警告
        console.warn('[SubmitVerification] RTM 集成失败:', rtmErr)
      }
      // RTM 触发点 7：提交验收材料 → rtm-accepting.yml（测试覆盖度）
      await syncRTMYaml(deps, tasks, changed.id, 'submit:verification')
      
      // 🆕 自动触发验收确认（Dive 自动流程：提交后自动弹框请人确认）
      // REQ-261006164732-6503 t5（serves: FR-1、FR-3）：先过**建门唯一入口**再决定投不投递——
      // 已有在等的门 / 已落章时不弹第二个框（重复提交验收材料是常态：补材料、改结论）。
      // 阻塞形态（本处 await）与 blockers 条件**逐字不变**（G4 的统一另立后续线，见设计 B-7）。
      let autoConfirmNote = ''
      if (blockers === undefined) {
        if (!deps.questions.available()) {
          // 弹框通道不可用时**不建门**：requestGate 会登记一张没人能答的票，那会把窗口钉到 TTL。
          // （既有行为是 askConfirm 自己探测通道后返回 fallback=board，这里保持同一结局。）
          autoConfirmNote = '；弹框通道不可用：请到项目看板点确认按钮（未建门）'
        } else {
          try {
            const gate = await requestGate(deps, {
              requirementId: changed.id,
              target: 'artifact',
              kind: 'verification',
              question: '验收材料已提交，是否确认进入验收？',
            }, exec)
            if (gate.mode === 'reused') {
              autoConfirmNote = fmt('；该门已有一个在等的框（ticket={t}）：未重复弹框', { t: gate.ticket })
            } else if (gate.mode === 'already-settled') {
              autoConfirmNote = '；该门已落章：未重复弹框（以台账为准）'
            } else {
              await askConfirm(deps, {
                requirement_id: changed.id,
                target: 'artifact',
                kind: 'verification',
                question: '验收材料已提交，是否确认进入验收？',
                // 门已由 requestGate 建好：沿用该票投递，不二次登记
                adopted_ticket: gate.ticket,
              }, exec)
              autoConfirmNote = '；已自动触发验收确认'
            }
          } catch (err) {
            // 触发失败不阻断提交，只留痕
            autoConfirmNote = fmt('；自动触发验收确认失败（可手动 reqboard_ask_confirm）：{msg}', { msg: String((err as Error).message ?? err) })
          }
        }
      }
      
      return {
        success: true,
        requirement_id: changed.id,
        status: reqNow?.status ?? changed.status,
        tasks_done: tasks.filter(t => t.status === 'done').length,
        tasks_total: tasks.length,
        sheet_version: reqNow?.verification?.sheet?.version ?? 0,
        sheet_items: reqNow?.verification?.sheet?.items.length ?? 0,
        // REQ-261006092213-4f5b FR-2：逐项交代的回执（不靠「我以为它绑上了」自查）。
        results_bound: resultsBound,
        results_matched: resultsMatched,
        results_unmatched: [...textUnmatched],
        results_out_of_scope: [...resultsOutOfScope],
        results_coverage: resultsCoverage,
        ...(reqNow?.verification?.sheet?.reworkOnly === true ? { rework_only: true } : {}),
        ...(rtmData !== undefined
          ? {
              acceptance_tracking_count: rtmData.acceptance_tracking_count,
              ...(rtmData.is_rework ? { rework_only: true } : {}),
            }
          : {}),
        ...(reqNow !== undefined && (reqNow.docSyncPending ?? []).length > 0
          ? { doc_sync_pending: reqNow.docSyncPending, doc_sync_warning: docSyncSummary(reqNow) }
          : {}),
        ...blockerBlock,
        note: finishNote + autoConfirmNote,
      }    }

/** 逐项交代硬门的回执（`bindStructuredResults` 的产出）。 */
interface StructuredResultsOutcome {
  /** 命中可预见项的 results 条数（= `applyStructuredResults` 的 matched）。 */
  matched: number
  /** **真正改动了台账字段**的项数（= changed；人填过的 result 受保护 → 命中而不计）。 */
  changed: number
  /** 本版验收单不含、但确实存在的 ref（返工续版的正常情形）——如实报告、不拒。 */
  outOfScope: readonly string[]
}

/**
 * 逐项交代硬门 + 落结果（REQ-261006092213-4f5b FR-1 / FR-2 · D-3 / D-4 / D-7）。
 *
 * 为什么映射放在用例层：体检六族 → 错误码是**工具面**的语义（interfaces.md 的表），
 * 而"哪六族、怎么算"单点在 domain（`matchStructuredResults`，全函数）；用例层只做映射与放行判断，
 * **不复制逐项判定**（复核 F2：口径只能有一处，否则两处必然漂移）。
 *
 * `unmatched` 必须再过 `splitUnmatched`（复核 R2）：返工续版只带上一版的未过项，
 * 而 agent 在出单前无从知道本轮是续版、必然按全量交代——越界的一律拒会让返工轮永远交不上去。
 * 只有 `unknown`（根本指不到东西）才拒；`outOfScope` 如实进返回体。
 *
 * 判定顺序刻意照 interfaces.md：**形状 → 冲突 → 重复 → 交代完整性 → 指不到项 → 漏项**。
 * 先判「ref 指不到项」再判「漏交代」，否则「ref 写错又忘填结果」会被报成「没给 result」，
 * 把 agent 引向错误的修法（复核 F2 实测：两处顺序反了会多一次往返）。
 */
function bindStructuredResults(
  items: SheetItemLike[],
  raw: unknown,
  knownKeys: ReadonlySet<string>,
): StructuredResultsOutcome {
  const report = matchStructuredResults(items, raw)
  const { outOfScope, unknown } = splitUnmatched(report.unmatched, knownKeys)
  const refuse = (code: string, what: string, why: string, how: string): never =>
    reject(envelope({ lead: 'reqboard_submit(kind=verification) 未执行：', what, why, how }), code)
  if (report.invalid.length > 0) {
    // 口径（复核 F3，刻意双层的两层都写在这里）：
    //   · **形状级**（results 非数组 / 元素非对象 / ref.kind 非法）在**绑定层**就被工具 schema 拒，
    //     宿主报 INVALID_ARGS 并点名到字段路径——比这里更早、路径更精确，且不以牺牲 schema 指引为代价；
    //   · 走到这里的 invalid 是**语义级**载荷问题（如 kind=task 但 taskId 缺失/空白），回本码。
    refuse('REQBOARD_INVALID_INPUT',
      fmt('results 形状非法（{n} 条）', { n: String(report.invalid.length) }),
      report.invalid.join('；'),
      'results 必须是数组、元素形如 {ref:{kind:"task"|"requirement"|"prototype-compare"|"decision-compare",…}, result, needsHuman, humanReason}；照 reqboard_submit(kind=verification) 的参数说明重交')
  }
  if (report.conflict.length > 0) {
    refuse('REQBOARD_STORE_INCONSISTENT',
      '验收单自身异常：两个可预见项共用了同一引用键',
      report.conflict.join('；'),
      '这不是调用方的错（是收项口径的问题）：请把本单交维护者，先修 reqboard_submit 的组装口径再重交')
  }
  if (report.duplicate.length > 0) {
    refuse('REQBOARD_RESULT_REF_DUPLICATE',
      fmt('同一个 ref 交了多次（{n} 个）', { n: String(report.duplicate.length) }),
      report.duplicate.join('；'),
      '同一 ref 只交一条：把多条结果合并进该条的 result，再调 reqboard_submit(kind=verification) 重交')
  }
  if (report.empty.length > 0) {
    refuse('REQBOARD_RESULT_EMPTY',
      fmt('交代不完整（{n} 条）', { n: String(report.empty.length) }),
      report.empty.join('；'),
      '每条二选一：给 result（命令+输出摘要），或标 needsHuman:true 并写明 humanReason；补齐后调 reqboard_submit(kind=verification) 重交')
  }
  // 顺序（复核 F2）：指不到项的 ref **先报**，漏项**后报**。
  // interfaces.md 的判定顺序是「形状 → 命中 → 重复 → 交代完整性」：一次提交里既打错 ref 又漏交代时，
  // 必须先告诉他「这个 ref 指不到任何项」，否则他会按「漏项」去补，下一次才收到 ref 无效——两次往返。
  if (unknown.length > 0) {
    refuse('REQBOARD_RESULT_REF_INVALID',
      fmt('以下 ref 指不到本版任何可预见项（{n} 个）', { n: String(unknown.length) }),
      unknown.join('；'),
      'ref 必须与验收项来源同构：{kind:"task",taskId} / {kind:"requirement"} / {kind:"prototype-compare",prototypePath} / {kind:"decision-compare",decisionIds}；改正后调 reqboard_submit(kind=verification) 重交')
  }
  if (report.missing.length > 0) {
    refuse('REQBOARD_RESULT_COVERAGE_MISSING',
      fmt('以下可预见项没被逐项交代（{n} 项）', { n: String(report.missing.length) }),
      report.missing.join('；'),
      '可预见项 = 顶层父卡任务 + 需求级 + 对照项（原型/裁定）：按上面点名的 ref 逐项补 result（或 needsHuman+humanReason），再调 reqboard_submit(kind=verification) 重交')
  }
  // ── 提交侧锚点体检 → 拒绝（REQ-261007160829-1991 FR-1 · design S-3 / interfaces I-6）────
  // 位置刻意排在 `missing`（漏项）**之后**：`missing` 是「覆盖面没交齐」的结构问题，本桶是
  // 「交上来的质量不够」，两者互斥（漏项根本不在 `unanchored` 里）；本仓既有口径是结构性优先，
  // 先报结构让 agent 一次往返补齐，避免同一批错误来回两次（I-6「为什么排在这」的取舍原话）。
  //
  // 体检（哪些项要判锚点）单点在 domain：人工项走事实形态、系统项走处置两义，都已在
  // `matchStructuredResults` 里排除；用例层只做「桶 → 工具面错误码」的映射，不复制逐项判定。
  // 拒绝发生在 `applyStructuredResults` 之前 ⇒ 台账零改动（与上面各分支同址，revision 都不动）。
  if (report.unanchored.length > 0) {
    refuse('REQBOARD_RESULT_UNANCHORED',
      fmt('以下结果没有可核验锚点（{n} 条）：{list}', {
        n: String(report.unanchored.length),
        list: report.unanchored.join('；'),
      }),
      '结果必须可复核：一条命令 + 读数 / 一个文件路径 / 一个明确计数都没有时，人只能凭印象点通过，'
        + '无锚点的「跑过了，没问题」会被静默降级成未复核——那正是本门要消灭的形态',
      '给点名的每条 result 补一个可核验锚点——' + ACCEPT_RESULT_FORM_HINT
        + '；补齐后调 reqboard_submit(kind=verification) 重交')
  }
  // 前置条件（conflict 为空）已由上面的拒绝保证；apply 自己也守（非空则一个字段都不写）。
  const applied = applyStructuredResults(items, raw)
  const out: StructuredResultsOutcome = { matched: applied.matched, changed: applied.changed, outOfScope }
  return out
}

/**
 * `splitUnmatched` 用的已知键集合（四类；后两类按**本轮实际产出**条件化）。
 *
 * ⚠️ 两条反例纪律（复核 R2，别改回去）：
 *  ① **不要放宽成「全部活卡」**——子卡的父卡若不是活卡，放行该子卡 ref 后既没有父卡项 `missing`
 *     兜底、也没有别的门，那正是「子卡冒充父卡」的掩盖路径；
 *  ② 对照项键**必须条件化**——本轮没有该对照项却放进去 = 无条件放行野 ref。
 */
function knownResultKeysOf(liveTasks: readonly TaskRecord[], compare: CompareInputs): Set<string> {
  const keys = new Set<string>()
  for (const t of liveTasks) {
    const parentId = typeof t.parentId === 'string' && t.parentId.length > 0 ? t.parentId : undefined
    if (parentId === undefined) keys.add('task:' + t.id)
  }
  keys.add('requirement')
  if (compare.prototypeCompare !== undefined && !('exempt' in compare.prototypeCompare)) {
    keys.add('prototype:' + compare.prototypeCompare.path)
  }
  if (compare.decisionIds.length > 0) {
    keys.add(refKeyOf({ kind: 'decision-compare', decisionIds: compare.decisionIds }))
  }
  return keys
}

/**
 * 对照项输入（见下方 compareInputsOf）。
 *
 * 为什么用一个具名形状 + **就地赋值**再 `return out`，而不是直接 `return { prototypeCompare, … }`：
 * 本文件在输出契约门禁的静态扫描范围内（`RESPONSE_SOURCES.Submit`），它把**任何** `return { … }`
 * 字面量的顶层键当成"工具响应字段"——辅助函数的内部形状会被误判成未声明字段（实测被点名两次）。
 * 既有代码同类处理见 return 之外的 `blockerBlock`：不改门禁，改写法。
 */
interface CompareInputs {
  /**
   * 原型对照项输入；`{ exempt: true, reason }` = 已批准豁免，改渲染豁免说明行。
   * `degradedNote` = 权威路径取不到而退回台账时的**如实标注**（REQ-261006201649-cc89 FR-3），
   * 会拼进该项的 criterion——评审人必须知道这个路径不是从权威清单来的。
   */
  prototypeCompare?: { path: string; degradedNote?: string } | { exempt: true; reason: string }
  /** 该需求的 D-x 裁定编号（非空才组装裁定对照项） */
  decisionIds: string[]
  /** UI 需求且既无已登记原型、豁免也未生效 → 缺项即拒（内部码见调用点） */
  needsPrototype: boolean
}

/**
 * 组装验收单两个对照项的输入（REQ-261005105032-3b02 FR-7 / FR-9，§10 #14/#37/#38/#45）。
 *
 * 适用性（interfaces.md「出现条件」表，逐条对应）：
 *   · **UI 需求** = feature/refactor 且 requirement.md front-matter 的 `sides` 含 frontend
 *     （与 prototype-gates 同一判据源，避免两处各判一套）；
 *   · 有已登记 `kind=prototype` 的 **`.html`** 产物 → `prototype-compare` 项。为什么只认 `.html`：
 *     `prototypes/INDEX.md` 也登记为 kind=prototype（§10 #1），但它是清单不是页面，没有可对照的界面；
 *   · `prototype_exempt` **已生效**（理由非空 + requirement 产物已落章）→ 不强制该项，
 *     改渲染一行豁免说明（§10 #45）；
 *   · 存量/直种需求（artifacts 空/undefined）→ 一概不判（不追溯，与既有门禁同口径）；
 *   · D-x 裁定：有则组装 `decision-compare`（裁定是需求级产物，非 UI 需求同样出现）；
 *     非 feature/refactor 不出现（该节只在 feature 模板，D-12）。
 *
 * `needsPrototype = true` = UI 需求既没原型也没生效豁免 → 缺项即拒（#38）。
 * 为什么不判"验收单里有没有该项"：那会死锁——没有原型就永远造不出该项。
 * 判据落在**输入条件**上，修复路径明确（交原型 / 走豁免）。
 */
async function compareInputsOf(
  deps: UseCaseDeps,
  req: RequirementRecord,
  reqDir: string,
): Promise<CompareInputs> {
  const out: CompareInputs = { decisionIds: [], needsPrototype: false }
  // 存量/直种需求：不追溯（同 isLegacyForDocs 口径）
  if (req.artifacts === undefined || req.artifacts.length === 0) return out
  // D-x 节只在 feature 模板里；别的分类不给它加仪式（D-12 / interfaces.md 出现条件第 4 行）
  if (req.category !== 'feature' && req.category !== 'refactor') return out
  const reqPath = reqDir + '/requirement.md'
  // 需求文档不存在 → 不判（随后的 9 类文档门会点名缺 requirement.md，不在这里抢答）
  if (!deps.docs.exists(reqPath)) return out
  const text = await deps.docs.read(reqPath)
  const frontmatter = parseDocument(text).frontmatter
  out.decisionIds = decisionIdsOf(text)
  const isUi = designDocPolicyFrom(frontmatter).sides.includes('frontend')
  if (!isUi) return out
  const exempt = prototypeExemptOf(req, frontmatter)
  if (exempt.active) {
    out.prototypeCompare = { exempt: true, reason: exempt.reason }
    return out
  }
  // ── 取数（REQ-261006201649-cc89 FR-3）───────────────────────────────────────
  // 「有没有可对照的对象」与「对照的是哪一版」是**两问**，顺序不能反：
  //
  //   ① 先问"能不能产出这一项"：权威路径 ∪ 台账路径**都**为空 ⇒ `needsPrototype`，
  //      维持既有语义（#38 的拒绝判据落在输入条件上，修复路径是"交原型 / 走豁免"）；
  //   ② 再问"取哪一版"：新规则适用 ⇒ 读 INDEX 权威行；取不到 ⇒ 退回台账并如实标降级。
  //
  // ⚠️ 为什么必须**先并集、后取数**（这条是被既有用例逼出来的，不是设计出来的）：
  // 旧实现的顺序是「台账没有产物 ⇒ needsPrototype = true」在前。若把 INDEX 判定提到它前面，
  // 那些**既没有 requirement.md、也没有台账原型产物**的既有标本（accept-sheet 一族用例就是这样）
  // 会从「缺项即拒」变成「组装一项对照」——把 #38 的拒绝面悄悄改宽，30 条既有用例当红。
  // 迁移纪律：新增取数只能**替换已有取数**，不得越过"有没有"这一问。
  const ledgerPath = prototypeHtmlPathOf(req)
  const authoritative = docQualityRulesApply(req.createdAt)
    ? await authoritativePrototypePathIn(deps, req.id)
    : undefined
  if (ledgerPath === undefined && authoritative === undefined) {
    out.needsPrototype = true
    return out
  }
  if (authoritative !== undefined) {
    // 消费版本门的结论：INDEX 唯一 authoritative 行才是"对照的是哪一版"的权威答案。
    out.prototypeCompare = { path: authoritative }
    return out
  }
  if (!docQualityRulesApply(req.createdAt)) {
    // 存量需求：走**原路**（台账排序首项）、**不标降级**——迁移承诺是行为逐字不变，
    // 而"降级"这个标注本身就是新增行为。
    out.prototypeCompare = { path: ledgerPath as string }
    return out
  }
  out.prototypeCompare = {
    path: ledgerPath as string,
    // 降级**如实写在验收项上**：INDEX 读不出（或缺权威行）时退回台账排序首项，
    // 评审人必须知道"这个路径不是从权威清单来的"。
    degradedNote: fmt('⚠️ 降级读数：未能从 {index} 取到唯一 authoritative 行，本项路径取自台账登记产物（排序首项）{path}',
      { index: reqDir + '/prototypes/INDEX.md', path: ledgerPath as string }),
  }
  return out
}

/**
 * `prototypes/INDEX.md` 里**唯一 `authoritative` 行**的路径（需求目录相对）；取不到 → undefined。
 *
 * 与锚点门/版本门**同源**：复用 `parsePrototypeIndex`（路径归一与"权威恰一条"的口径只有一份实现）。
 * 任何取不到的情形都返回 undefined（文件不在 / 解析缺口 / 权威条数 ≠ 1）——调用方据此降级并如实标注，
 * **不在这里抢报错误码**：那是三个原型门的职责，且它们跑在阶段转移上，本用例是验收材料提交，两处报码会让人对齐两条消息。
 */
async function authoritativePrototypePathIn(deps: UseCaseDeps, reqId: string): Promise<string | undefined> {
  const indexPath = 'docs/requirements/' + reqId + '/prototypes/INDEX.md'
  if (!deps.docs.exists(indexPath)) return undefined
  const index = parsePrototypeIndex(parseDocument(await deps.docs.read(indexPath)), reqId)
  if (index.gaps.length > 0) return undefined
  const auth = index.rows.filter(r => r.status === 'authoritative')
  return auth.length === 1 ? auth[0]?.path : undefined
}

/**
 * 已登记原型页面路径（需求目录相对，取排序首项）。
 * 版本门保证恰好一份 authoritative，这里**不重算 INDEX**（同一件事两处判定必然漂移）；
 * 多份 .html 时取排序首项，只为给"对照的是哪一版"一个稳定可断言的落点。
 */
function prototypeHtmlPathOf(req: RequirementRecord): string | undefined {
  const paths = (req.artifacts ?? [])
    .filter(a => a.kind === 'prototype' && a.path.endsWith('.html'))
    .map(a => a.path)
  return paths.length === 0 ? undefined : [...paths].sort()[0]
}

/** `D-<数字>` 编号（与 decision-gates 的编号形态同源：`D-ARCH-2` 这类不入组）。 */
const DECISION_ID_RE = /\bD-\d+\b/g

/**
 * 需求文档「讨论与裁定记录（D-x）」节里的 D-x 编号（去重 + 数字序）。
 *
 * 为什么在用例层：节名常量是 decision-gates 的事实源（导入复用，不抄字面量），
 * 而"节的切分"只有这里需要——domain 层保持纯函数、零 IO，不引文档解析。
 */
function decisionIdsOf(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const doc = parseDocument(text)
  const head = doc.headings.find(h =>
    h.level === 2 && h.text.replace(/(?:\s*<!--[\s\S]*?-->)+$/g, '').trim() === DECISION_SECTION_NAME)
  if (head === undefined) return []
  let end = lines.length + 1
  for (const h of doc.headings) if (h.line > head.line && h.level <= 2 && h.line < end) end = h.line
  const section = lines.slice(head.line, end - 1).join('\n')
  const ids = [...new Set([...section.matchAll(DECISION_ID_RE)].map(m => m[0]))]
  return ids.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
}

/**
 * 读回 rtm-accepting.yml，返回 fr_to_tests 为空的 FR 编号清单（REQ-260930094139-2d65 FR-5）。
 * 读不到/解析失败 → 空清单（RTM 是增强层，断链提示项宁缺毋滥，不阻断提交）。
 */
function readTraceabilityGaps(deps: UseCaseDeps, reqId: string): string[] {
  try {
    const reqDir = requirementsDir(deps.docs.workspaceRoot(), reqId)
    const data = readRTM<RTMAccepting>(getRTMPath(reqDir, 'rtm-accepting.yml'))
    if (data === null) return []
    const frToTests = data.traceability?.fr_to_tests
    if (frToTests === undefined || typeof frToTests !== 'object') return []
    return Object.entries(frToTests)
      .filter(([, tests]) => !Array.isArray(tests) || tests.length === 0)
      .map(([fr]) => fr)
  } catch {
    return []
  }
}
