/**
 * Decompose 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineDecomposeTool / reqboard_decompose 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/Decompose
 */
import type { UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import {
  normalizePlanTasks,
  normalizeText,
  planApproved,
  type PlanTask,
} from '../../shared/protocol.js'
import { checkDecomposeIdempotency } from '../../domain/workflow/DecomposeSpec.js'
import { fmt } from '../../domain/text/fmt.js'
import { describeConflicts, findWorkSurfaceConflicts } from '../internal/conflict-check.js'
import { assertClauseCoverageGate } from '../internal/content-gate-wiring.js'
import { assertGranularityGates } from '../internal/plan-granularity.js'
import { refsForLanding, unrefedKeys } from '../internal/plan-refs.js'
import { reject, agentIdFromExec, requireLiveDriver } from '../internal/support.js'
import { landPlanTasks, type PlanTaskDraft } from '../internal/plan-landing.js'
import { cancelStaleReworkCards } from '../internal/stale-rework.js'
import { queueRelativePath } from '../../domain/queue/queuePath.js'
import { requirementStoreOf, taskStoreOf } from './queue-access.js'

export async function executeDecompose(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; tasks?: unknown }
      if (a.tasks !== undefined && (!Array.isArray(a.tasks) || a.tasks.length === 0)) {
        reject('reqboard_decompose 未执行：tasks 传了就必须是非空数组（不传 = 直接落库已批准的计划）', 'REQBOARD_INVALID_INPUT')
      }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)

      // t8/B11：绑定读走新端口（只读摘要）
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) {
        reject('reqboard_decompose 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      }
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      if (picked === undefined) {
        reject(
          'reqboard_decompose 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求（只能拆自己的需求）',
          'REQBOARD_NOT_BOUND_TO_WINDOW',
        )
      }
      // 判据过了才取**整条**（下游要整条字段）；get() 可空 ⇒ 显式守卫
      const target = await requirementStoreOf(deps).get(picked.id)
      if (target === undefined) {
        reject(fmt('需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }
      
      // ── REQ-260925212722-96e7 FR-8：Dive armed 检查 ──────────────────────
      // Dive 模式 armed 时，禁止手动调用拆分工具（自动流程接管）
      if (target.dive?.activation === 'armed') {
        reject(
          'reqboard_decompose 未执行：需求 ' + target.id + ' 的 Dive 自动流程已启用，不允许手动拆分。若需手动操作，请先调用 reqboard_clear_pause() 解除锁定。',
          'REQBOARD_DIVE_ARMED'
        )
      }
      
      if (target.status === 'draft') {
        reject('reqboard_decompose 未执行：需求还在立项态，先 reqboard_move 到 brainstorming（方案确认后）再拆', 'REQBOARD_BAD_STATUS')
      }
      if (target.status === 'done' || target.status === 'archived' || target.status === 'canceled') {
        reject('reqboard_decompose 未执行：需求已处于 ' + target.status + '，不能再拆分', 'REQBOARD_BAD_STATUS')
      }
      // ── 幂等守卫（REQ-2e9473 t01）────────────────────────────────────────
      // 事故 B（REQ-6f39b5）：拆分成功落库后同程序内 move 被闸门拒绝 → agent 不知已拆
      // 成功，重试 decompose → 幽灵任务双倍落库、rollup 永久卡死。两道防线：
      //  ① 状态已**越过**拆分（实施/验收中）→ 说明已拆过，拒绝；
      //  ② 台账已有该需求的未取消任务 → 拒绝并返回已有清单（防状态异常时的漏网）。
      // 2026-09-17 修正（本需求自身实测触发）：原守卫把 decomposing 也当作"已拆过"，但计划
      // 批准（reqboard_ask_confirm target=plan）会**自动**把 design → decomposing，于是正常
      // 路径必然先到 decomposing 再调 decompose → 被自己的守卫拒死，审批流水线自锁。
      // 正解：幽灵任务的唯一判据是"已有任务"（防线②），状态只用于区分"是否已越过拆分"。
      // 两道防线的判定在 domain/workflow/DecomposeSpec.ts（REQ-47939a t3）。
      // 任务已迁出台账（v9）：幂等守卫的"已有任务"判据改读队列。
      const existingTasks = (await taskStoreOf(deps).listByRequirement(target.id)).filter(t => t.status !== 'canceled')
      // 回退态（REQ-261003204149-1e80 FR-4）：`rollback.to === 当前阶段` = 上次回退就退到这里、还没重走上来。
      // 只认这个窄判据——非回退态的重复拆分仍被拒（事故 B 的幽灵任务防线不动）。
      const rollbackTo = target.rollback?.to === target.status ? target.rollback.to : undefined
      const idempotency = checkDecomposeIdempotency(target.status, existingTasks, { rollbackTo })
      if (!idempotency.ok) {
        reject('reqboard_decompose 未执行：' + idempotency.reason, idempotency.code)
      }

      // ── 计划闸门（plan mode 的代码级 HARD GATE）──────────────────────────
      // 拆分不是自由创作：落库的必须是**人已经批准过**的那张任务表。没有计划或计划未
      // 批准 → 直接拒绝（agent 无法自行越过；人批准是唯一钥匙）。
      if (!planApproved(target)) {
        reject(
          'reqboard_decompose 未执行：该需求还没有已批准的拆分计划。'
          + '拆分计划属拆分阶段（2026-09-21 用户裁定）：先 reqboard_submit(kind=plan) 提交拆分计划'
          + '（decomposition.md + 摘要 + 任务表），请人在项目看板点「批准计划」（或弹框批准），批准后才能拆分落库',
          'REQBOARD_PLAN_NOT_APPROVED',
        )
      }
      const planTasks: PlanTask[] = target.plan?.tasks ?? []
      // ── W7 阶段产物边界（REQ-2e9473 t17）：两条路径 ─────────────────────
      //  路径 A（创作型，W7 新语义）：计划只含设计（tasks 空）→ decompose 承担任务卡
      //   创作，必须显式传 tasks；任务卡质量（implementation/可证伪 acceptance）由
      //   normalizePlanTasks 强制，人工把关在「拆分确认门」（decomposing→implementing）。
      //  路径 B（计划携带任务表，兼容旧流程）：落库以批准的计划为准；显式传 tasks 时
      //   key 集合必须一致（防「批了 A、落库 B」）。
      let draft: PlanTaskDraft[]
      if (planTasks.length === 0) {
        if (a.tasks === undefined || !Array.isArray(a.tasks) || a.tasks.length === 0) {
          reject(
            'reqboard_decompose 未执行：设计未含任务表（W7 新语义）——请传入 tasks 创作任务卡'
            + '（每张卡必须含 implementation 与可证伪 acceptance；decompose 即任务卡创作口）',
            'REQBOARD_TASKS_REQUIRED',
          )
        }
        const creative = normalizePlanTasks(a.tasks)
        draft = creative.map(t => ({
          key: t.key,
          title: t.title,
          description: t.description ?? '',
          phase: t.phase ?? 'implement',
          side: t.side ?? 'fullstack',
          acceptance: t.acceptance ?? '',
          implementation: t.implementation ?? '',
          context: '',
          dependsOn: [...(t.dependsOn ?? [])],
          // 子卡段控制（REQ-260928185112-e20d）：两条路径（创作型 tasks / 计划携带任务表）都要透传，
          // 否则拆分节点写了 stages/skipIntegration，落库时照样丢。
          ...(t.stages !== undefined ? { stages: [...t.stages] } : {}),
          ...(t.skipIntegration === true ? { skipIntegration: true } : {}),
          // 模板引用键透传（REQ-261003203909-55f2 FR-4）：链已在 normalizePlanTasks 解析进 stages。
          ...(t.template !== undefined ? { template: t.template } : {}),
          // 体量声明透传（REQ-261002175818-80a8 t2 / FR-7）：创作型 tasks 这条路径同样要带上，
          // 否则「计划层有、落库卡上没有」，与 stages 踩过的是同一个坑。
          ...(t.footprint !== undefined ? { footprint: t.footprint } : {}),
          // 原型锚点 / 关联 D-x 透传（REQ-261005105032-3b02 FR-5、FR-9 / t12）：同上，
          // 未申报不带键（缺省 = 未采集，不冒充空数组）。
          ...(t.prototypeRefs !== undefined && t.prototypeRefs.length > 0 ? { prototypeRefs: [...t.prototypeRefs] } : {}),
          ...(t.decisionRefs !== undefined && t.decisionRefs.length > 0 ? { decisionRefs: [...t.decisionRefs] } : {}),
        }))
      } else {
        // 显式传 tasks 时，key 集合必须与批准的计划一致——防止「批了 A、落库 B」
        if (a.tasks !== undefined) {
          const givenKeys = new Set(
            (a.tasks as unknown[]).map((raw, i) => {
              const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
              return normalizeText(o.key, 'tasks[].key', 40) || 'k' + (i + 1)
            }),
          )
          const planKeys = new Set(planTasks.map(t => t.key))
          const same = givenKeys.size === planKeys.size && [...givenKeys].every(k => planKeys.has(k))
          if (!same) {
            reject(
              'reqboard_decompose 未执行：传入的任务表与已批准计划不一致（批准的是 '
              + [...planKeys].join(', ') + '）。要改拆分方案请重新 reqboard_plan_submit 并让人重新批准',
              'REQBOARD_PLAN_MISMATCH',
            )
          }
        }
        // 落库内容以批准的计划为准
        draft = planTasks.map(t => ({
          key: t.key,
          title: t.title,
          description: t.description ?? '',
          phase: t.phase ?? 'implement',
          side: t.side ?? 'fullstack',
          acceptance: t.acceptance ?? '',
          implementation: t.implementation ?? '',
          context: '',
          dependsOn: [...(t.dependsOn ?? [])],
          // 子卡段控制（REQ-260928185112-e20d）：两条路径（创作型 tasks / 计划携带任务表）都要透传，
          // 否则拆分节点写了 stages/skipIntegration，落库时照样丢。
          ...(t.stages !== undefined ? { stages: [...t.stages] } : {}),
          ...(t.skipIntegration === true ? { skipIntegration: true } : {}),
          // 模板引用键透传（REQ-261003203909-55f2 FR-4）：链已在 normalizePlanTasks 解析进 stages。
          ...(t.template !== undefined ? { template: t.template } : {}),
          // 体量声明透传（REQ-261002175818-80a8 t2 / FR-7）：计划携带任务表这条路径也要带上。
          ...(t.footprint !== undefined ? { footprint: t.footprint } : {}),
          // 原型锚点 / 关联 D-x 透传（REQ-261005105032-3b02 FR-5、FR-9 / t12）：计划携带任务表
          // 这条路径是**主路径**（人批准的就是这张表），漏传等于锚点进不了台账。
          ...(t.prototypeRefs !== undefined && t.prototypeRefs.length > 0 ? { prototypeRefs: [...t.prototypeRefs] } : {}),
          ...(t.decisionRefs !== undefined && t.decisionRefs.length > 0 ? { decisionRefs: [...t.decisionRefs] } : {}),
        }))
      }
      // 薄卡检测（REQ-2e9473 t04）：新计划在 plan_submit 已被强制要求 implementation（t03），
      // 这里拦的是"规则生效前已被人工批准的历史计划"——人看过这张薄卡并批了，硬拒会锁死
      // 存量需求（REQ-2e9473 自身即是），故不硬拦、返回 thin_cards 警告提示补实施卡。
      const thinCards = draft.filter(d => d.implementation.length === 0).map(d => d.key + ' ' + d.title)

      // ── 冲突拦截（REQ-4842fe t9/FR-10 主防线）────────────────────────────
      // 互无依赖的父卡若声明同一文件，并行跑会互相覆盖 → 拆分阶段即拒（比运行期事后发现便宜）。
      const conflicts = findWorkSurfaceConflicts(draft)
      if (conflicts.length > 0) {
        reject(fmt('reqboard_decompose 未执行：互无依赖的任务卡声明了同一文件（并行会互相覆盖）——{list}。请重划范围或建立依赖', { list: describeConflicts(conflicts) }), 'REQBOARD_FILE_CONFLICT')
      }

      // ── 覆盖门禁（REQ-d3e61a T-3 / FR-1）：需求里每条根编号必须有落点 ──────────
      // 落点 = 被某张任务卡用 requirement_refs 接收，或在该条款旁显式标「本轮不做」。
      // 拦的是"无记录"，不是"不许多做少做"（这正是 R9 静默丢失的堵口）。
      // 刻意放在 mutate 之前：拒绝时不留任何副作用。
      // 任务↔需求编号的绑定**不落库**（TaskRecord 无该字段），故随 decomposition.md 的 RTM
      // 覆盖表持久化——它本就是规范里的 RTM 核心，且不必改被占用的 protocol.ts。
      const rawTaskInputs = [
        ...((a.tasks as unknown[] | undefined) ?? []),
        ...(planTasks as readonly unknown[]),
      ]
      // 覆盖门禁（硬）：每个 FR 必须有落点。两道门的分工在 REQ-261002164800-d8f2 FR-1 定死——
      // 这里只查"条款有没有人接"，不再查"每张卡有没有条款"（后者会把纯文档卡整批拒掉）。
      const coverageFailure = await assertClauseCoverageGate(deps.docs, target, rawTaskInputs)
      if (coverageFailure !== undefined) {
        reject(coverageFailure.message, coverageFailure.code)
      }
      // ── 粒度门禁（REQ-261007125552-32cb FR-2/FR-4/FR-5）：与 submit 同一判定单点 ──
      // 刻意放在 mutate 之前：拒绝时不留任何副作用（与覆盖门同位置）。读**批准的那份计划**
      // （target.plan.path），创作型 tasks 也过同一道（本工具即任务卡创作口）。
      const granularity = await assertGranularityGates(deps.docs, target, (a.tasks as unknown[] | undefined) ?? planTasks, target.plan?.path ?? '')
      if (granularity.failure !== undefined) {
        reject(granularity.failure.message, granularity.failure.code)
      }
      // refs 取数**单点**（FR-3）：显式优先 → 文档覆盖表兜底 → 两处皆无则点名。
      // 此前本路径自己拼 refs 且不读文档表，与批准路径落出的卡引用不一致（实测 277d 全空）。
      const { refsByKey } = await refsForLanding({
        req: target,
        plan: target.plan,
        explicitTasks: a.tasks as readonly unknown[] | undefined,
        docs: deps.docs,
      })
      const unrefed = unrefedKeys(draft.map(d => d.key), refsByKey)

      const nowTs = deps.clock.now()
      // REQ-261003204149-1e80 FR-4：回退态下、新计划落库**之前**，先收掉上一轮物化的重做卡。
      // 它们已被新计划取代；留着就是「重做卡 + 新计划卡」双份活卡（幽灵卡的另一种形态）。
      // REQ-261005122915-9f90 t2 / FR-2：判定收成**单一实现**（`internal/stale-rework`）——
      // 此前这段只写在本路径，两条批准路径都没有 ⇒ 三处漂移，实测「23 卡计划 0 张落库」。
      if (rollbackTo !== undefined) {
        await cancelStaleReworkCards({
          deps,
          requirementId: target.id,
          nowTs,
          actor: { kind: 'agent', sessionId: windowKey },
        })
      }
      try {
        const tools = (exec as { tools?: { todo_write?: (a: unknown) => Promise<unknown> } } | undefined)?.tools
        const landed = await landPlanTasks(deps, {
          requirementId: target.id,
          windowKey,
          nowTs,
          draft,
          refsByKey,
          tools,
        })
        const created = landed.created
        const rtmData = landed.rtm
        // t11（REQ-260927202051-f6df FR-1）：拆分后任务落在哪份队列文件——返回体必须给出**非空**
        // `queue_file`，否则调用方无从得知"台账没长东西，那卡去哪了"。
        // 路径口径的**单一事实源在 domain**（`domain/queue/queuePath.ts`，零 import，application 可直接用）；
        // 基础设施层的 `QueueRepository.queueRelativePath` 只是它的再导出，两份实现复活即契约测试红。
        const queueFile = queueRelativePath(target.id)
        return {
          success: true,
          requirement_id: target.id,
          requirement_status: landed.requirement?.status ?? target.status,
          queue_file: queueFile,
          tasks_created: landed.createdIds.length,
          created,
          ...(rtmData !== undefined
            ? {
                task_coverage: rtmData.task_coverage,
                coverage_check: rtmData.coverage_check,
                ...(rtmData.coverage_check.unreceived_clauses.length > 0
                  ? { warning: '⚠️ 部分 FR 未被任务覆盖：' + rtmData.coverage_check.unreceived_clauses.join(', ') + '（覆盖率 ' + rtmData.coverage_check.coverage_rate + '%）' }
                  : {}),
              }
            : {}),
          ...(thinCards.length > 0
            ? {
                thin_cards: thinCards,
                warning: '⚠️ ' + thinCards.length + ' 张薄卡缺实施方案（历史批准计划）：' + thinCards.join('；')
                  + '。开工前请先在任务卡补齐「实施方案」段（新计划在 plan_submit 已强制要求）',
              }
            : {}),
          // FR-3 / FR-6：卡级无落点**不拒绝**，但必须可见（人看返回体与需求评论就知道哪张卡缺引用）
          ...(unrefed.length > 0
            ? {
                unrefed_cards: unrefed,
                refs_warning: '⚠️ ' + unrefed.length + ' 张卡没有需求条款落点（' + unrefed.join('、') + '）——卡已落库，'
                  + '但 RTM 的 serves 会缺这几条；补法：在计划文档覆盖对照表补「FR-N ↔ 计划 key」，或用补写入口给卡补 requirement_refs',
              }
            : {}),
          // 粒度门禁警告（REQ-261007125552-32cb FR-5 + 豁免/降级披露）：非空才给键
          ...(granularity.warnings.length > 0 ? { granularity_warnings: granularity.warnings } : {}),
          note: '已落库 ' + created.length + ' 个任务。拆分计划已获批准（decomposition 产物已落章）——需求可推进到 implementing（reqboard_move；经批准弹框路径会自动推进）；任务开工/完成用 reqboard_task_move（任务全部完成后需求自动进入验收）',
        }
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'REQBOARD_INVALID_INPUT'
        reject('reqboard_decompose 未执行：' + ((err as Error).message ?? String(err)), code)
      }
    }