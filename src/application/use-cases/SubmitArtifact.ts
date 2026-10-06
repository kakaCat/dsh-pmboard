/**
 * SubmitArtifact 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineRequirementSubmitTool + definePlanSubmitTool 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * REQ-261005105032-3b02 t10 追加 `submitPrototypeArtifacts`（kind=prototype 登记编排）：
 * 「交原型」= 有登记、有锚点、有几何量、有留痕的动作，而不是往目录里扔一个 html。
 *
 * @module dsh-pmboard/application/use-cases/SubmitArtifact
 */
import type { UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from './queue-access.js'
import {
  normalizePlanTasks,
  normalizeText,
  type StageArtifact,
} from '../../shared/protocol.js'
// 原型产物分类的唯一事实源（三条正则：prototypes/*.html、旧 prototype/*.html、prototypes/INDEX.md）
import { kindForRelPath } from '../../domain/artifact/ArtifactSpec.js'
// 原型元数据的抽取/解析/路径口径/豁免判定全部复用 t4 的纯函数——本卡**不重写**判定，
// 只做编排（登记 + 留痕 + 逐份态投影），避免第二份"什么算原型"的真相。
import { parseDocument, naturalSort } from '../internal/content-gates.js'
import {
  parsePrototypeIndex,
  parsePrototypeMetadata,
  prototypeExemptOf,
  toReqRelative,
  type PrototypeIndexRow,
  type PrototypeMetadata,
} from '../internal/prototype-gates.js'
import { applyDocSync, clearDocSync, docSyncDownstream } from '../../domain/workflow/DocSyncSpec.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { registerArtifact } from '../internal/artifact-gates.js'
import { isRegisteredArtifact, registeredPrototypesOf } from '../internal/prototype-registration.js'
import { stampCheckpoint } from '../internal/interruption.js'
import { checkNumberChainGate, checkDesignServesGate, checkRequirementDocFormatGate, assertArtifactOpenable, assertClauseCoverageGate, checkOverCapacityMarkerGate, overCapacityItemsOf } from '../internal/content-gate-wiring.js'
import { markerGateOf, resolveRoundCapacity } from '../../plugin-config.js'
import { triggerAutoConfirm } from '../internal/auto-confirm.js'
import { planDependencyWarnings } from '../internal/plan-deps-check.js'
import { missingCategoryDocs } from '../internal/category-doc-sets.js'
import { readabilityHints } from '../../domain/workflow/ReadabilityHints.js'
import { fmt } from '../../domain/text/fmt.js'
import { envelope } from '../internal/gate-feedback.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  notifyArtifactRegistered,
  syncWorkspaceRootForRequirement,
} from '../internal/support.js'

export async function submitRequirementArtifact(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; path?: unknown; summary?: unknown; change_note?: unknown }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const explicitPath = normalizeText(a.path, 'path', 400)
      const summary = normalizeText(a.summary, 'summary', 2000)
      const changeNote = normalizeText(a.change_note, 'change_note', 1000)

      // t8/B11：绑定读改走新端口（只读摘要，不装配整册）。
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) reject('reqboard_requirement_submit 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      if (picked === undefined) {
        reject(
          'reqboard_requirement_submit 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求',
          'REQBOARD_NOT_BOUND_TO_WINDOW',
        )
      }
      // 判据过了才取**整条**（下游要目标需求的字段）；`get()` 可空 ⇒ 显式守卫，不用 `!` 断言。
      const target = await requirementStoreOf(deps).get(picked.id)
      if (target === undefined) {
        reject('reqboard_requirement_submit 未执行：需求 ' + picked.id + ' 不在台账中', 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }
      // FR-6 二次校正（t5）：需求级 workspaceRoot 优先于会话 cwd——立项时选了非会话工作区的
      // 需求，docs/queue 根须切到需求级值（入口同步只到会话级）。
      syncWorkspaceRootForRequirement(deps, exec, target)

      // 阶段纪律：需求文档属于「需求分析」（brainstorming）阶段产物。
      if (target.status !== 'brainstorming') {
        reject(
          'reqboard_requirement_submit 未执行：需求当前处于 ' + target.status
          + '，需求文档只能在 brainstorming 阶段提交（回到需求分析重新提交会作废既有确认）',
          'REQBOARD_BAD_STATUS',
        )
      }

      // REQ-2d1c74 FR-5：登记即可打开性校验——不存在/伪路径/越界当场拒（不再等人点看才发现）。
      // 通过则返回 normalized 工作区相对路径（台账以归一值登记，形态不再漂移）。
      const path = assertArtifactOpenable(
        deps.docs,
        explicitPath.length > 0 ? explicitPath : 'docs/requirements/' + target.id + '/requirement.md',
      )

      // ── 需求文档格式校验（编号规范强制）────────────────────────────────
      // 在 mutate 之前校验：系统负责格式，人负责内容。避免让用户确认不合格的文档。
      const formatFailure = await checkRequirementDocFormatGate(deps.docs, target)
      if (formatFailure !== undefined) {
        reject(formatFailure.message, formatFailure.code)
      }

      // 人读性软门禁（人读纪律机械兜底）：缺 TL;DR / ASCII 图 / 表格 → 提示进响应，不阻断提交。
      const readability = readabilityHints(await deps.docs.read(path))

      const nowTs = deps.clock.now()
      const artifact: StageArtifact = {
        stage: 'brainstorming',
        kind: 'requirement',
        path,
        registeredAt: nowTs,
        registeredBy: { kind: 'agent', sessionId: windowKey },
      }
      // 幂等判定放在 mutate 之前（registerArtifact 内部同样幂等，这里只为 give 准确的 registered 标记）
      const alreadyRegistered = (target.artifacts ?? []).some(
        x => x.stage === artifact.stage && x.kind === artifact.kind && x.path === artifact.path,
      )
      // 文档演进留痕（REQ-2e9473 t19/W8）：已确认过再重写 = 变更 → change_note 必填
      const prevConfirmed = (target.artifacts ?? []).find(
        x => x.kind === 'requirement' && x.confirmedAt !== undefined,
      )
      const isChange = prevConfirmed !== undefined
      if (isChange && changeNote.length === 0) {
        reject(
          'reqboard_requirement_submit 未执行：需求文档此前已经人确认过，重写即变更——'
          + '必须传 change_note（改了哪里/为什么，留痕并把下游标"待同步"）；'
          + '改完全文后再提交，旧确认会作废需重新确认',
          'REQBOARD_CHANGELOG_REQUIRED',
        )
      }
      const result = await mutateIfPresent(requirementStoreOf(deps), target.id, (req) => {
        const added = registerArtifact(req, artifact)
        if (added) {
          req.comments.push({
            id: deps.ids.comment(),
            body:
              '[需求文档] 提交需求文档产物（待人工确认）：' + path
              + (summary.length > 0 ? '\n摘要：' + summary : ''),
            createdAt: nowTs,
            createdBy: { kind: 'agent', sessionId: windowKey },
          })
          req.updatedAt = nowTs
          req.updatedBy = { kind: 'agent', sessionId: windowKey }
        }
        if (isChange) {
          // changelog + 作废旧确认 + 下游待同步
          const art = (req.artifacts ?? []).find(x => x.kind === 'requirement')
          if (art !== undefined) {
            delete art.confirmedAt
            delete art.confirmedBy
            delete art.confirmedVia
          }
          // 需求文档变更 → 已登记的 plan / decomposition 待同步（规则在 DocSyncSpec.ts，t3）
          const downstream = docSyncDownstream('requirement', req.artifacts)
          applyDocSync(req, 'requirement', changeNote, nowTs)
          req.comments.push({
            id: deps.ids.comment(),
            body: '[文档变更] 需求文档变更（changelog）：' + changeNote
              + '\n旧确认已作废（需重新确认）；下游待同步：' + (downstream.join('、') || '（暂无）'),
            createdAt: nowTs,
            createdBy: { kind: 'agent', sessionId: windowKey },
          })
          req.updatedAt = nowTs
          req.updatedBy = { kind: 'agent', sessionId: windowKey }
        }
        // REQ-260924213231-b1c4 T-9（FR-6 写入器 A）：交棒即写 checkpoint——断点永远
        // 等于「最后一步做完后的下一步」，即使随后被上游超时掐断也有据可续。
        stampCheckpoint(req, nowTs, 'reqboard_submit')
        return { changed: true }
      })
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_requirement_submit 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      const registered = !alreadyRegistered
      if (registered) notifyArtifactRegistered(deps, changed.id, artifact)
      // RTM 触发点 2：提交需求文档 → rtm-brainstorming.yml
      syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(changed.id), changed.id, 'submit:requirement')
      // FR-1 自动唤醒（REQ-260929210741-30ae t4）：登记成功 → 后台触发确认弹框（非阻塞）。
      // REQ-261006094052-1da2 t3：triggerAutoConfirm 已改 async（弹框前要按原型存在门做窄口径预判）。
      const autoConfirm = registered
        ? await triggerAutoConfirm(deps, {
            requirementId: changed.id,
            target: 'artifact',
            kind: 'requirement',
            question: '需求文档已提交，请确认进入设计阶段',
          }, exec)
        : undefined
      return {
        success: true,
        requirement_id: changed.id,
        artifact: { stage: artifact.stage, kind: artifact.kind, path: artifact.path },
        registered,
        ...(autoConfirm !== undefined ? { auto_confirm: autoConfirm } : {}),
        ...(readability.length > 0 ? { readability_warnings: readability } : {}),
        note: (registered
          ? '需求文档产物已登记。' + (autoConfirm?.triggered === true
              // REQ-261006164732-6503 t8（serves: FR-3）：已自动弹框时**不再指向 ask_confirm**——
              // 那句「下一步：调 reqboard_ask_confirm」正是拆分门双框事故里 agent 照做的那一句。
              ? '已自动触发确认弹框（后台非阻塞）——**已有一道门在等：不要重复发起确认**。'
                + '改为调 reqboard_confirm_receipt 取回执，或到项目看板作答；肯定答复自动落章并推进到 design。'
              : '本次未自动弹框（原因见下）。确认通道二选一：调一次 reqboard_ask_confirm'
                + '（target=artifact, kind=requirement），或到看板一键确认——肯定答复自动落章并推进到 design'
                // REQ-261006094052-1da2 t3（serves: FR-3）：没弹框时把**原因**摆在回执里——
                // 预判早退的 reason 就是原型存在门的文案（含「原型落到哪、怎么登记」的可执行路径），
                // 藏起来等于把「为什么没请你确认」变成要猜的事。
                + (autoConfirm?.reason !== undefined ? fmt('。未自动弹框的原因：{reason}', { reason: autoConfirm.reason }) : ''))
          : '该需求文档此前已登记（幂等命中，未重复登记）')
          + (readability.length > 0
              ? fmt(' 人读性提示（不阻断）：{hints}', { hints: readability.join('；') })
              : ''),
      }
    }

export async function submitPlanArtifact(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; path?: unknown; summary?: unknown; tasks?: unknown; change_note?: unknown }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const path = normalizeText(a.path, 'path', 400)
      const summary = normalizeText(a.summary, 'summary', 4000)
      const changeNote = normalizeText(a.change_note, 'change_note', 1000)
      if (path.length === 0) reject('reqboard_plan_submit 未执行：path 不能为空', 'REQBOARD_INVALID_INPUT')
      if (summary.length === 0) reject('reqboard_plan_submit 未执行：summary 不能为空（人要读它来决定批不批）', 'REQBOARD_INVALID_INPUT')
      // 2026-09-21 用户裁定（w-2105d331 代录）：拆分计划归**拆分阶段**——设计阶段只交
      // 一套设计文档（架构/四视角/风险/工作流划分），拆分计划（含任务表）在 decomposing
      // 阶段提交并批准，批准 = reqboard_decompose 落卡的唯一钥匙。传了 tasks 走严格校验；
      // 不传则合法（tasks=[]，decompose 时走创作路径兜底）。
      const tasks = a.tasks === undefined ? [] : normalizePlanTasks(a.tasks)

      // t8/B11：绑定读改走新端口（只读摘要，不装配整册）。
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) reject('reqboard_plan_submit 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      if (picked === undefined) {
        reject(
          'reqboard_plan_submit 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求',
          'REQBOARD_NOT_BOUND_TO_WINDOW',
        )
      }
      // 判据过了才取**整条**（下游要目标需求的字段）；`get()` 可空 ⇒ 显式守卫，不用 `!` 断言。
      const target = await requirementStoreOf(deps).get(picked.id)
      if (target === undefined) {
        reject('reqboard_plan_submit 未执行：需求 ' + picked.id + ' 不在台账中', 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }
      // FR-6 二次校正（t5）：需求级 workspaceRoot 优先于会话 cwd（与 requirement 路径同口径）。
      syncWorkspaceRootForRequirement(deps, exec, target)

      // 流程纪律（2026-09-21 用户裁定）：拆分计划属于「拆分」（decomposing）阶段——
      // 设计阶段只写设计文档（design/ 目录，G2 确认设计文档后才进拆分）。
      if (target.status !== 'decomposing') {
        reject(
          'reqboard_plan_submit 未执行：需求当前处于 ' + target.status + '，拆分计划只能在 decomposing（拆分）阶段提交。'
          + '设计阶段只写设计文档 → 确认设计文档后进拆分 → 再提交拆分计划；'
          + '已有计划要改，也在拆分阶段重新提交（旧批准自动作废）',
          'REQBOARD_BAD_STATUS',
        )
      }

      // 计划变更留痕（REQ-2e9473 t19/W8）：已批准过再重交 = 变更 → change_note 必填
      const prevPlanApproved = target.plan?.approvedAt !== undefined
      if (prevPlanApproved && changeNote.length === 0) {
        reject(
          'reqboard_plan_submit 未执行：计划此前已获批准，重交即变更——必须传 change_note'
          + '（改了什么/为什么）；旧批准作废需重新批准，下游拆分文档会标"待同步"',
          'REQBOARD_CHANGELOG_REQUIRED',
        )
      }
      // REQ-2d1c74 FR-5：plan path 存在性补齐（现状不查——没落盘的计划也能登记，
      // 用户点看才发现"没有找到文件"）。不存在/伪路径/越界当场拒。
      const openPath = assertArtifactOpenable(deps.docs, path)

      // ── 编号串联门禁（REQ-d3e61a T-4 / FR-2）：serves 不得悬空 ────────────────
      // 悬空（引用了不存在的编号）→ 拒；根编号无下游 → 不拒，随结果返回供看板标红。
      // 放在 mutate 之前：拒绝时不留任何副作用。
      const chain = await checkNumberChainGate(deps.docs, target)
      if (chain.failure !== undefined) {
        reject(chain.failure.message, chain.failure.code)
      }
      // FR-5：每个设计章节都必须标注服务哪条功能点（缺标注 = 孤儿章节）
      const designServes = await checkDesignServesGate(deps.docs, target)
      if (designServes !== undefined) {
        reject(designServes.message, designServes.code)
      }
      // ── 分类文档集（REQ-d3e61a T-13 / FR-15）：立项类型决定要哪些文档、每份写什么必填节 ──
      // 类型只能减少文档**数量**，不能取消**追溯**——故每个类型都要求根文档的必填节。
      {
        const reqDir = 'docs/requirements/' + target.id
        const rootPath = reqDir + '/requirement.md'
        const rootExists = deps.docs.exists(rootPath)
        const rootText = rootExists ? await deps.docs.read(rootPath) : ''
        const designDir = reqDir + '/design'
        const designNames = (deps.docs.list?.(designDir) ?? [])
          .filter(e => e.isFile !== false)
          .map(e => e.name ?? '')
        const missingDocs = missingCategoryDocs({ category: target.category, rootExists, rootText, designNames })
        if (missingDocs.length > 0) {
          // REQ-260924213231-b1c4 FR-2/I-9：文案走统一信封（what —— why。补齐：how），判定不动。
          reject(
            envelope({
              lead: 'reqboard_plan_submit 未执行：',
              what: target.category + ' 类型的必填文档 ' + missingDocs.join('；'),
              why: '该类型的必填文档未交齐（类型只减少文档数量，不取消追溯）',
              how: '按 templates/design/*.md 生成缺失设计文档、并按模板补 requirement.md 必填节，落盘后重调 reqboard_submit(kind=plan)；确实不适用的在需求 front-matter 写 design_exempt=<文件名>=理由',
            }),
            'REQBOARD_MISSING_REQUIRED_DOC',
          )
        }
      }

      // ── FR 覆盖度检查（提交时检查，而非批准时才报错）────────────────────────
      // 如果用户传了 tasks 参数，提前检查 FR 覆盖度，避免提交成功但批准时才发现问题
      const rawTasks = (a.tasks ?? []) as unknown[]
      if (rawTasks.length > 0) {
        const coverageFailure = await assertClauseCoverageGate(deps.docs, target, rawTasks)
        if (coverageFailure !== undefined) {
          reject(coverageFailure.message, coverageFailure.code)
        }
      }

      // ── 超容量软门禁（REQ-261002175818-80a8 t5 / FR-4、FR-5）──────────────────
      // 判定是纯计算、**不落库**（声明会随重交而变，落库的判定立刻过期）。
      // 容量与门禁强度单点在 plugin-config 解析（缺省 = 常量 16 DU + enforce）；
      // 超容量本身**绝不报错**——它是风险不是错误，人仍可知情放行（`success` 保持 true）。
      const capacity = resolveRoundCapacity({ capacity: deps.capacity })
      const overCapacity = overCapacityItemsOf(tasks, capacity.value)
      // 门禁读**实际提交的那份计划**（path 是 agent 可传的）：硬编码 decomposition.md 会让
      // 「提交到别处」静默放行（2026-10-04 复核指出）。
      const marker = await checkOverCapacityMarkerGate(deps.docs, target, overCapacity, markerGateOf({ capacity: deps.capacity }), path)
      // enforce 且有缺口 → 在 mutate 之前拒绝（零副作用）；warn → 不拒绝，但 gaps 进返回体（不静默）
      if (marker.failure !== undefined) reject(marker.failure.message, marker.failure.code)

      const nowTs = deps.clock.now()
      const result = await mutateIfPresent(requirementStoreOf(deps), target.id, (req) => {
        if (prevPlanApproved) {
          // 计划变更 → 下游 decomposition 待同步 + changelog（规则在 domain/workflow/DocSyncSpec.ts，t3）
          applyDocSync(req, 'plan', changeNote, nowTs)
          const downstream = docSyncDownstream('plan', req.artifacts)
          req.comments.push({
            id: deps.ids.comment(),
            body: '[文档变更] 设计（拆分计划）变更：' + changeNote
              + '\n旧批准已作废（需重新批准）；下游待同步：' + (downstream.join('、') || '（暂无）'),
            createdAt: nowTs,
            createdBy: { kind: 'agent', sessionId: windowKey },
          })
        }
        // 销标：plan 重交即完成自身同步
        clearDocSync(req, 'plan')
        req.plan = {
          path: openPath,
          summary,
          tasks,
          submittedAt: nowTs,
          submittedBy: { kind: 'agent', sessionId: windowKey },
        }
        req.comments.push({
          id: deps.ids.comment(),
          body:
            '[计划] 提交拆分计划（' + tasks.length + ' 个任务，待人工批准）：' + path
            + '\n摘要：' + summary
            + '\n' + tasks.map(t => '- ' + t.key + ' ' + t.title + ((t.dependsOn ?? []).length > 0 ? '（依赖 ' + (t.dependsOn ?? []).join(', ') + '）' : '')).join('\n'),
          createdAt: nowTs,
          createdBy: { kind: 'agent', sessionId: windowKey },
        })
        req.updatedAt = nowTs
        req.updatedBy = { kind: 'agent', sessionId: windowKey }
        stampCheckpoint(req, nowTs, 'reqboard_submit')
        return { changed: true }
      })
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_plan_submit 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      // ── 产物登记（REQ-31e11f t4）：拆分计划 = 拆分阶段的 decomposition 产物 ──
      // （2026-09-21：原 stage=design/kind=plan；kind=decomposition 使 G3「批准拆分计划」门
      //   直接锚定本产物——批准计划即落章 decomposition，无需二次确认拆分清单）
      const planArtifact: StageArtifact = {
        stage: 'decomposing',
        kind: 'decomposition',
        path: openPath,
        registeredAt: nowTs,
        registeredBy: { kind: 'agent', sessionId: windowKey },
      }
      await mutateIfPresent(requirementStoreOf(deps), changed.id, (r) => {
        registerArtifact(r, planArtifact)
        return { changed: true }
      })
      notifyArtifactRegistered(deps, changed.id, planArtifact)
      // FR-3 自动唤醒（REQ-260929210741-30ae t4）：计划提交成功 → 后台触发批准弹框（非阻塞）。
      // REQ-261006094052-1da2 t3：同上，已改 async（await 后才是 AutoConfirmResult，不是 Promise）。
      const planAutoConfirm = await triggerAutoConfirm(deps, {
        requirementId: changed.id,
        target: 'plan',
        kind: 'decomposition',
        question: '拆分计划已提交，请批准（批准后自动拆分任务卡并进入实施）',
      }, exec)
      // REQ-261003222428-3556 FR-3：doc↔tasks 依赖一致性警告——文档依赖表声明了依赖而
      // tasks 数组对应 key 全空（agent 漏传 depends_on 的形态）→ 回执点名（不拒，纯文档卡天然无依赖）。
      let dependencyWarnings: string[] = []
      if (tasks.length > 0) {
        try {
          const planDocText = await deps.docs.read(openPath)
          dependencyWarnings = planDependencyWarnings(planDocText, tasks)
        } catch { /* 文档读不到 → 没依据就不说话（不误报） */ }
      }
      return {
        success: true,
        requirement_id: changed.id,
        plan_status: 'pending_approval',
        orphan_clauses: chain.orphans,
        task_count: tasks.length,
        tasks: tasks.map(t => ({ key: t.key, title: t.title, depends_on: [...(t.dependsOn ?? [])] })),
        // 超容量清单恒在场（无超容量卡 = **空数组**，不是缺键——调用方因此只有一种判空写法）；
        // capacityNote 是 FR-3 的「判据自述」：这个数字是常量还是配置，由 source 如实交代。
        overCapacity,
        capacityNote: { source: capacity.source, value: capacity.value, calibrated: false },
        ...(marker.gaps.length > 0 ? { marker_warnings: marker.gaps } : {}),
        ...(dependencyWarnings.length > 0 ? { dependency_warnings: dependencyWarnings } : {}),
        auto_confirm: planAutoConfirm,
        note: '拆分计划已提交' + (tasks.length === 0 ? '（未含任务表——落库时由 reqboard_decompose 传 tasks 创作）' : '（含 ' + tasks.length + ' 张任务卡）')
          + (planAutoConfirm.triggered
            // REQ-261006164732-6503 t8（serves: FR-3）：已自动弹框时不再指向 ask_confirm——见 t8 卡面
            ? '。已自动触发批准弹框（后台非阻塞）——**已有一道门在等：不要重复发起确认**。'
              + '改为调 reqboard_confirm_receipt 取回执，或到看板点「批准计划」；批准即自动拆分落库并进入实施。'
            : '。本次未自动弹框。请人批准二选一：调一次 reqboard_ask_confirm（target=plan），'
              + '或到看板点「批准计划」——批准即自动拆分落库并进入实施，两条通道共用同一落库实现、结果一致'),
      }
    }

// ── kind=prototype：原型登记编排（REQ-261005105032-3b02 FR-2 / FR-4，卡 t10）────────
/**
 * 逐份原型登记态（设计 `interfaces.md` §工具接口：磁盘 / 产物簿 / INDEX / 确认章**四源合成**，
 * 与 `kind=design` 的 `design_docs` 同构——同一件事不因 kind 不同而换一套读法）。
 */
export interface PrototypeDocStatus {
  name: string
  path: string
  on_disk: boolean
  registered: boolean
  confirmed: boolean
  /** 有效豁免理由（front-matter `prototype_exempt`，理由非空 **且** requirement 已落章才注入） */
  exempted?: string
  /** INDEX「状态」列 === 'authoritative' */
  authoritative: boolean
  /** INDEX「被取代于」列（仅 superseded 行有） */
  superseded_by?: string
  /** INDEX「服务条款」列声明的 FR（自然排序） */
  serves: string[]
  /** 抽到的 `id="FR-N"`（自然排序） */
  anchors: string[]
  /** `proto-geometry` 的观测量**名**清单（不含值/阈值——阈值属设计决策，D-10） */
  geometry: string[]
}

/** 任意抛出物的可读文案（登记链多处要把它拼进 warning/blockers）。 */
const errTextOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * `reqboard_submit(kind='prototype')` 的登记编排（六步，见卡 t10）：
 *   ① 路径按**需求目录相对**口径归一（伪路径 / 越界 / 不在原型目录 → 当场拒）；
 *   ② `kindForRelPath` 必须判为 `prototype`（旧路径 `prototype/*.html` 仍识别，只在消息里提示迁移）；
 *   ③ `parsePrototypeMetadata` 抽锚点与几何量（geometry JSON 坏 = 按缺块记录，**不抛、不阻断登记**——
 *      判据留给设计阶段的原型锚点门，那里才需要"恰好一块"）；
 *   ④ `registerArtifact` 幂等（stage+kind+path 去重）并写 `StageArtifact.prototypeMeta`；
 *   ⑤ `triggerAutoConfirm` 请人确认（门禁只要求"已登记"，确认章是可选加强，决议 #13）；
 *   ⑥ `syncRTMYaml('submit:prototype', {paths})` **失败只 warning**（RTM 是增强层，绝不打断登记）。
 *
 * 豁免（front-matter `prototype_exempt`）三态（决议 #7、architecture ⑤）：理由空 → 拒；
 * 理由非空但 requirement 产物**未落章** → 拒（agent 不能自己给自己发豁免）；已落章 → 放行并写一条
 * 需求评论 `[豁免] <理由>`。**登记只校验、绝不改写 INDEX**（决议 #9）——产物内容永远由人/agent 手写。
 */
export async function submitPrototypeArtifacts(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { requirement_id?: unknown; path?: unknown }
  const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
  const explicitPath = normalizeText(a.path, 'path', 400)

  // t8/B11：绑定读走新端口（只读摘要；下游要整条字段，判据过后再取）
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
  if (bound.length === 0) reject('reqboard_submit(kind=prototype) 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
  if (picked === undefined) {
    reject(fmt('reqboard_submit(kind=prototype) 未执行：需求 {id} 不是本窗口绑定的进行中需求', { id: explicitId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // 判据过了才取**整条**（下游要目标需求的 artifacts 判落章、判已登记）；get() 可空 ⇒ 显式守卫
  const target = await requirementStoreOf(deps).get(picked.id)
  if (target === undefined) {
    reject(fmt('reqboard_submit(kind=prototype) 未执行：需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
  }

  // FR-6 二次校正（t5）：需求级 workspaceRoot 优先于会话 cwd（与 requirement/design 路径同口径）。
  syncWorkspaceRootForRequirement(deps, exec, target)

  const nowTs = deps.clock.now()
  const registeredBy = { kind: 'agent' as const, sessionId: windowKey }
  const reqDir = 'docs/requirements/' + target.id
  const protoDir = reqDir + '/prototypes'
  const legacyDir = reqDir + '/prototype'
  const indexPath = protoDir + '/INDEX.md'

  // ── ① 待登记条目：路径口径 + 扫描范围 ─────────────────────────────────────
  // 显式 path：先过既有可打开性校验（伪路径 / 越界 / 不存在当场响亮拒），再按需求目录相对口径
  // 归一（§10 #2）——归一不出（在别的需求目录里）或 kindForRelPath 不判 prototype 即拒。
  // 缺省：扫 `prototypes/*.html`；旧目录 `prototype/*.html` **仍识别**（兼容 REQ-292a 形态），
  // 只在消息里提示迁移——静默丢弃旧路径 = "原型交了却等于没交"，两份真相里最坏的一种。
  const entries: Array<{ path: string; rel: string; legacy: boolean }> = []
  if (explicitPath.length > 0) {
    const openPath = assertArtifactOpenable(deps.docs, explicitPath)
    const rel = toReqRelative(openPath, target.id)
    if (rel === undefined || kindForRelPath(rel) !== 'prototype') {
      reject(
        envelope({
          lead: 'reqboard_submit(kind=prototype) 未执行：',
          what: fmt('路径不是本需求的原型（归一后 rel={rel}）', { rel: rel ?? '（无法归一为需求目录相对路径）' }),
          why: '原型是需求目录内的一等产物：路径必须能归一为「需求目录相对」口径（§10 #2），且文件名须命中原型分类规则',
          how: '把原型放到 ' + protoDir + '/（骨架见 templates/brainstorming/prototype.html）后重调 reqboard_submit(kind=prototype)（requirement_id="' + target.id + '"）',
        }),
        'REQBOARD_INVALID_INPUT',
      )
    }
    entries.push({ path: openPath, rel, legacy: rel.startsWith('prototype/') })
  } else {
    for (const dir of [protoDir, legacyDir]) {
      const legacy = dir === legacyDir
      for (const e of deps.docs.list(dir)) {
        if (e.isFile === false || e.name.startsWith('.') || !e.name.endsWith('.html')) continue
        entries.push({ path: dir + '/' + e.name, rel: (legacy ? 'prototype/' : 'prototypes/') + e.name, legacy })
      }
    }
    // 输出顺序稳定（两次调用逐字节可比）——不依赖 list 的实现顺序
    entries.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0))
  }

  // ── ②③ 抽锚点与几何量（解析绝不外抛）──────────────────────────────────────
  // 坏块按「缺块」记录（parsePrototypeMetadata 的契约）：一个坏 JSON 不该让整次登记失败——
  // 那样 agent 只会看到"登记不了"，却看不到"哪块坏了"；判据留在锚点门报。
  const metas = new Map<string, PrototypeMetadata>()
  const blockers: string[] = []
  for (const e of entries) {
    try {
      metas.set(e.path, parsePrototypeMetadata(await deps.docs.read(e.path)))
    } catch (err) {
      blockers.push(fmt(
        'prototype_missing：{path} 读不出（{err}）——本次不登记该份，也不谎报成功',
        { path: e.path, err: errTextOf(err) },
      ))
    }
  }

  // ── ③ 豁免三态（front-matter prototype_exempt）────────────────────────────
  // 只在**没有原型可登记**时才谈豁免：豁免的语义是"人确认过本需求不要原型"。已有原型可登记时
  // 豁免不参与判定（产物本身已满足义务），否则一句写歪的豁免声明会把正常登记也拦下。
  const reqMdPath = reqDir + '/requirement.md'
  const frontmatter = deps.docs.exists(reqMdPath) ? parseDocument(await deps.docs.read(reqMdPath)).frontmatter : {}
  const exempt = prototypeExemptOf(target, frontmatter)
  const exemptDeclared = Object.prototype.hasOwnProperty.call(frontmatter, 'prototype_exempt')
  if (entries.length === 0 && (exemptDeclared || exempt.reason.length > 0) && !exempt.active) {
    const gap = exempt.reason.length === 0
      ? 'prototype_exempt 的豁免无效：理由为空（豁免要写清为什么不要原型）'
      : 'prototype_exempt 写了理由但豁免无效：requirement 产物未落章（agent 不能自己豁免自己，须先请人确认需求文档）'
    reject(
      envelope({
        lead: 'reqboard_submit(kind=prototype) 未执行：',
        what: fmt('需求 {id} 声明了 prototype_exempt，但没有可登记的原型，且豁免不生效——{gap}', { id: target.id, gap }),
        why: '豁免是「人确认过本需求不要原型」的结论，不是 agent 的自我宣告：理由非空 **且** requirement 产物已落章，两个条件缺一不可',
        how: '要么把原型落到 ' + protoDir + '/（骨架见 templates/brainstorming/prototype.html）后重调 reqboard_submit(kind=prototype)（requirement_id="' + target.id + '"）；'
          + '要么在 requirement.md front-matter 写清 prototype_exempt: <理由> 并先请人确认 requirement 产物（reqboard_ask_confirm 的 target=artifact / kind=requirement）',
      }),
      'REQBOARD_MISSING_PROTOTYPE',
    )
  }

  // ── 无原型、无生效豁免 → 结构化失败（不谎报成功；退出去之前不改台账一个字节）──
  const registrable = entries.filter(e => metas.has(e.path))
  if (registrable.length === 0 && !exempt.active) {
    return {
      success: false,
      requirement_id: target.id,
      registered_count: 0,
      prototypes: [] as PrototypeDocStatus[],
      blockers: blockers.length > 0
        ? blockers
        : [
            fmt('prototype_missing：{dir}/ 内没有 .html 原型（旧目录 {legacy}/ 也没有）——本次登记 0 份', { dir: protoDir, legacy: legacyDir }),
            '补齐：按 templates/brainstorming/prototype.html 落一份权威原型（INDEX「服务条款」列声明的每个 FR 一个 <section id="FR-N">，且恰好一块 <!-- proto-geometry … -->），再调 reqboard_submit(kind=prototype)（requirement_id="' + target.id + '"）',
          ],
      note: '未发现可登记的原型：' + protoDir + '/ 目录不存在、没有 .html，或指定文件不可读——本次未登记任何产物，不谎报成功。'
        + '确需豁免时在 requirement.md front-matter 写 prototype_exempt: <理由>，并经人确认 requirement 产物后再调本工具。',
    }
  }

  // ── ④ 登记（幂等：stage+kind+path 去重；首次登记写 prototypeMeta）────────────
  // 台账以**归一后的工作区相对路径**登记（形态不再漂移）；prototypeMeta 是下游读锚点/几何量的
  // 唯一入口（面板、RTM、验收对照项都读它，不再重解析 HTML）。
  const candidates: StageArtifact[] = registrable.map(e => ({
    stage: 'brainstorming',
    kind: 'prototype',
    path: e.path,
    registeredAt: nowTs,
    registeredBy,
    prototypeMeta: {
      anchors: metas.get(e.path)?.anchors ?? [],
      geometry: metas.get(e.path)?.geometry ?? [],
    },
  }))
  // 「已登记」取**显式登记**口径（FR-1「登记才算数」，判据单点在 prototype-registration）：
  // 自动发现補登的条目不算已登记，本次 submit 会把它**升级**成显式（见 registerArtifact），
  // 因此它必须被算作"本次新登记"——否则升级不带评论/RTM 刷新/自动确认，agent 也读不出发生了什么。
  const priorRegistered = new Set(registeredPrototypesOf(target).map(x => x.path))
  const exemptBody = '[豁免] ' + exempt.reason
    + '\n豁免来源：requirement.md front-matter prototype_exempt（理由原文见上）；'
    + '生效条件：理由非空 + requirement 产物已落章（G1 已确认）——agent 不能自己豁免自己。'
  await mutateIfPresent(requirementStoreOf(deps), target.id, (req) => {
    const added: StageArtifact[] = []
    for (const c of candidates) if (registerArtifact(req, c)) added.push(c)
    // 豁免留痕（§10 #7 / architecture ⑤「登记 / 推进时写需求评论」）：按**理由**判重——
    // 幂等重调不刷屏，但换了理由（= 换了裁定）会再留一条，历史不丢。
    const needExemptComment = exempt.active && !req.comments.some(c => c.body.startsWith('[豁免] ' + exempt.reason))
    if (added.length === 0 && !needExemptComment) return undefined
    if (added.length > 0) {
      req.comments.push({
        id: deps.ids.comment(),
        body: '[原型] 登记 ' + added.length + ' 份原型产物（kind=prototype，stage=brainstorming）：\n'
          + added.map(x => '- ' + x.path).join('\n'),
        createdAt: nowTs,
        createdBy: { kind: 'agent', sessionId: windowKey },
      })
    }
    if (needExemptComment) {
      req.comments.push({
        id: deps.ids.comment(),
        body: exemptBody,
        createdAt: nowTs,
        createdBy: { kind: 'agent', sessionId: windowKey },
      })
    }
    req.updatedAt = nowTs
    req.updatedBy = { kind: 'agent', sessionId: windowKey }
    return { changed: true }
  })
  const added = candidates.filter(c => !priorRegistered.has(c.path))
  for (const art of added) notifyArtifactRegistered(deps, target.id, art)

  // ── ⑤ 不请人确认：原型**登记即生效**（REQ-261005200052-ce40 FR-1）────────────────
  // 修前这里调 `triggerAutoConfirm(kind='prototype')`：它给一个**没有人工确认门**的产物种类
  // （门值域只有 requirement / design / decomposition / verification）登记了一张**真的挂起票**，
  // 而挂起票会拦住**整个窗口**的写路径——实测：登记原型后紧接着的 reqboard_submit 就被
  // REQBOARD_CONFIRM_PENDING 拒，且看板没有该种类的确认控件（人点不掉）、ask_confirm 覆盖又会再钉一张，
  // 只能干等 30 分钟 TTL。通知仍然发（见上方 ④ 之后的 notifyArtifactRegistered），只是不再产生票。
  const autoConfirm = added.length > 0
    ? { triggered: false, reason: '原型登记无需人工确认（kind=prototype 不在人工确认门值域）：登记即生效' }
    : undefined

  // ── ⑥ RTM 触发点 submit:prototype（载荷 paths；失败只 warning）───────────────
  // RTM 是增强层：同步失败绝不改变登记结果，只把原因如实带进返回体（不静默）。
  let rtmWarning: string | undefined
  if (added.length > 0) {
    try {
      const probe = await syncRTMYaml(
        deps,
        await taskStoreOf(deps).listByRequirement(target.id),
        target.id,
        'submit:prototype',
        { paths: added.map(x => x.path) },
      )
      if (probe !== undefined && probe.ok !== true) {
        rtmWarning = fmt('RTM 刷新失败（已忽略，不影响登记）：{err}', { err: probe.error ?? '未知原因' })
      }
    } catch (err) {
      rtmWarning = fmt('RTM 刷新异常（已忽略，不影响登记）：{err}', { err: errTextOf(err) })
    }
  }

  // ── 逐份登记态投影（磁盘 / 产物簿 / INDEX / 确认章四源，I-1 返回体）────────────
  const reqNow = (await requirementStoreOf(deps).get(target.id)) ?? target
  const protoArtifacts = (reqNow.artifacts ?? []).filter(x => x.stage === 'brainstorming' && x.kind === 'prototype')
  // 逐份 `registered` 同取显式登记口径（与存在门同一判据）：自动发现补登的那份 → on_disk=true /
  // registered=false，正是"目录里有文件但没人登记"的如实投影，两处不许各说各话。
  const registeredPaths = new Set(protoArtifacts.filter(isRegisteredArtifact).map(x => x.path))
  const confirmedPaths = new Set(protoArtifacts.filter(x => x.confirmedAt !== undefined).map(x => x.path))
  // INDEX 只读、绝不改写（决议 #9）：读取失败/缺列都只是 gaps，登记不因 INDEX 不完美而失败——
  // "权威唯一"的执法在设计阶段的原型版本门，登记阶段的职责只是把读数如实投影出来。
  const index = deps.docs.exists(indexPath)
    ? parsePrototypeIndex(parseDocument(await deps.docs.read(indexPath)), target.id)
    : { rows: [] as PrototypeIndexRow[], gaps: [] as string[] }
  const prototypes: PrototypeDocStatus[] = entries.map(e => {
    const row = index.rows.find(r => r.path === e.rel)
    const meta = metas.get(e.path)
    return {
      name: e.path.slice(e.path.lastIndexOf('/') + 1),
      path: e.path,
      on_disk: deps.docs.exists(e.path),
      registered: registeredPaths.has(e.path),
      confirmed: confirmedPaths.has(e.path),
      ...(exempt.active ? { exempted: exempt.reason } : {}),
      authoritative: row?.status === 'authoritative',
      ...(row?.supersededBy === undefined ? {} : { superseded_by: row.supersededBy }),
      serves: row?.serves ?? [],
      anchors: naturalSort((meta?.anchors ?? []).map(x => x.fr)),
      geometry: naturalSort((meta?.geometry ?? []).map(x => x.name)),
    }
  })

  const legacyCount = entries.filter(e => e.legacy).length
  const migrationHint = legacyCount > 0
    ? fmt(' 注意：本次含旧目录 {legacy}/ 下的 {n} 份原型——旧路径仍识别，但请迁移到 {dir}/ 并同步 prototypes/INDEX.md 后重跑 reqboard_submit(kind=prototype)', { legacy: legacyDir, n: legacyCount, dir: protoDir })
    : ''
  const ok = blockers.length === 0 && (added.length > 0 || registeredPaths.size > 0 || exempt.active)
  const note = added.length > 0
    ? '已登记 ' + added.length + ' 份原型产物（kind=prototype，stage=brainstorming）。'
      + (autoConfirm?.triggered === true
          ? '已自动触发确认弹框（后台非阻塞）——肯定答复即落章（确认章是可选加强，门禁只要求已登记）。'
          : '下一步：调 reqboard_ask_confirm（target=artifact, kind=prototype）可选请人确认；门禁只要求"已登记"，确认章是可选加强')
    : (registeredPaths.size > 0
        ? '原型此前均已登记（幂等命中，本次新登记 0 份）：台账不重复入簿、INDEX 内容未被改写。下一步：调 reqboard_ask_confirm（target=artifact, kind=prototype）可选请人确认'
        : fmt('本需求已豁免原型（理由：{reason}）——豁免生效 = 理由非空 + requirement 产物已落章；已写一条 [豁免] 需求评论留痕。豁免只放行存在门，不放行权威版本门与锚点门', { reason: exempt.reason }))
  return {
    success: ok,
    requirement_id: target.id,
    registered_count: added.length,
    prototypes,
    ...(blockers.length > 0 ? { blockers } : {}),
    ...(autoConfirm !== undefined ? { auto_confirm: autoConfirm } : {}),
    ...(rtmWarning !== undefined ? { warning: rtmWarning } : {}),
    note: note + migrationHint,
  }
}
