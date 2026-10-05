/**
 * reqboard_submit 工具壳（REQ-47939a t8）——**4 个提交工具合一**，按 kind 表驱动分派，
 * 每个分支体只有一行用例调用（设计 §4.3「禁止大 if」）。
 *
 * kind → 用例：requirement/plan → SubmitArtifact；verification → SubmitVerification；
 * archive → SubmitArchive；design → SubmitDesignArtifacts。返回体为五个用例返回键的并集
 * （穷尽声明，绑定层不拒收）。
 *
 * @module dsh-pmboard/tools/SubmitTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { submitRequirementArtifact, submitPlanArtifact } from '../../application/use-cases/SubmitArtifact.js'
import { submitVerification } from '../../application/use-cases/SubmitVerification.js'
import { submitArchive } from '../../application/use-cases/SubmitArchive.js'
import { submitDesignArtifacts } from '../../application/use-cases/SubmitDesignArtifacts.js'
import { normalizeText, ALL_TASK_PHASES, ALL_TASK_SIDES, SUBMIT_KINDS } from '../../shared/protocol.js'
import { STAGE_KINDS, SUBTASK_TEMPLATES } from '../../domain/task/SubtaskTemplate.js'
import { reject, assertNoPendingConfirm } from '../../application/internal/support.js'
import { renderSmart } from '../shared.js'
import { submitSummary } from '../render-summaries.js'
import { SUBMIT_PROMPT } from './prompt.js'

/** 五个 kind（分派表的键集合；错误消息与自检共用）——权威定义在 shared/protocol（适配层不写状态名字面量）。 */
export { SUBMIT_KINDS }

/** 分派表：kind → 用例（每项一个独立 use-case，禁止写成一个大 if）。 */
const SUBMIT_DISPATCH: Readonly<Record<string, (deps: UseCaseDeps, args: unknown, exec: unknown) => Promise<unknown>>> = {
  requirement: submitRequirementArtifact,
  plan: submitPlanArtifact,
  verification: submitVerification,
  archive: submitArchive,
  design: submitDesignArtifacts,
}

export function defineSubmitTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_submit',
    description: SUBMIT_PROMPT,
    parameters: {
      kind: {
        type: 'string',
        description: '提交类型：requirement=需求文档 / plan=拆分计划 / verification=验收材料 / archive=归档材料 / design=设计文档登记（扫 design/ 或单份）',
        required: true,
        enum: [...SUBMIT_KINDS],
      },
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；不传默认本窗口绑定的需求' },
      path: { type: 'string', description: '文档路径（kind=requirement/plan/design）：工作区相对路径；design 缺省 = 扫 docs/requirements/<REQ>/design/*.md' },
      summary: { type: 'string', description: '摘要：requirement=一句话摘要；plan=目标+做法；verification=交付结论（≤2000 字符）；写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号；文本过大拆成多次调用' },
      change_note: { type: 'string', description: '变更原因（已确认/已批准后重交时必填）：改了什么/为什么，下游标"待同步"' },
      tasks: {
        type: 'array',
        description: 'kind=plan 的任务表（可选，1-50 项）；每项须含 implementation 与可证伪 acceptance；'
          + '另可用 stages / skipIntegration 精确控制该卡的子卡段（不填 = 按卡 phase、其次需求分类的默认模板）；'
          + '可用 footprint 声明本卡体量（files/anchors/chars），供超容量软门禁给分批建议',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', description: '计划内引用键（如 t1；depends_on 用它引用）' },
            requirement_refs: { type: 'array', items: { type: 'string' }, description: '本卡承接的需求条款（如 ["FR-1","FR-2"]）；落库写入 TaskRecord.requirementRefs，供 RTM/覆盖度统计' },
            title: { type: 'string', description: '任务标题（动词开头，≤120 字符）' },
            description: { type: 'string', description: '任务说明（改哪些文件/接口）' },
            phase: { type: 'string', description: 'doc / ui / analysis / implement / test / review / merge', enum: [...ALL_TASK_PHASES] },
            side: { type: 'string', description: 'frontend / backend / fullstack / doc', enum: [...ALL_TASK_SIDES] },
            stages: {
              type: 'array',
              description: '本卡的子卡段（可选，覆盖默认模板）：受控枚举 ' + STAGE_KINDS.join('/ ')
                + '；不填 = 按卡 phase（doc→研发+复核、test→研发+复核+测试…）、其次按需求分类兜底；与 template 二选一',
              items: { type: 'string' },
            },
            template: {
              type: 'string',
              description: '引用子卡链模板键（可选，与 stages 二选一）：' + Object.keys(SUBTASK_TEMPLATES).join('/')
                + '——如 change-only=研发+复核（文案契约类）、acceptance=校验单段（链尾总验收卡）、ops=运维五段；可与 skipIntegration 叠加',
            },
            skipIntegration: { type: 'boolean', description: '本卡无接口可联调时设 true → 不落联调子卡（可选）' },
            depends_on: { type: 'array', description: '依赖的计划内 key', items: { type: 'string' } },
            acceptance: { type: 'string', description: '验收标准（可验证：跑什么、看到什么算过；空话/缺锚点打回）' },
            implementation: { type: 'string', description: '实施方案（必填：改哪些文件、步骤、验证方式——拆分卡≠实施卡）' },
            // 体量声明（REQ-261002175818-80a8 t3 / FR-1）：本键**必须**在这里声明，否则绑定层
            // 按 additionalProperties:false 直接拒收，产品主入口的体量通道永远打不通
            // （t2 的健康检查用例刻意绕过壳层，于是这条 P0 当时没有任何用例能发现）。
            footprint: {
              type: 'object',
              additionalProperties: false,
              description: '卡片体量声明（可选）：三个可数的确定量，用于「一轮装不装得下」的软门禁',
              properties: {
                files: { type: 'number', description: '要改/新建的文件数；不得小于 implementation 里点到的路径数（允许留余量，不允许缩水）' },
                anchors: { type: 'number', description: '验收锚点数：可执行断言条数' },
                chars: { type: 'number', description: '实施描述与目标改动量合计字符数' },
              },
            },
          },
        },
      },
      evidence: {
        type: 'array',
        description: 'kind=verification 的证据清单（1-20 条；命令+结果摘要 / 报告路径 / 截图路径）',
        items: { type: 'string' },
      },
      dir: { type: 'string', description: 'kind=archive 的需求目录（工作区相对路径，如 docs/requirements/REQ-xxxxxx）' },
      docs: {
        type: 'array',
        description: 'kind=archive 的需求目录内文档清单',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', description: 'requirement / plan / verification / retro / notes' },
            path: { type: 'string', description: '文件路径（工作区相对路径）' },
          },
        },
      },
      merged_into: {
        type: 'array',
        description: 'kind=archive 的合并去向（1-10 条，按需求类型限定在 docs/adr|architecture|guides|rfcs|work-logs|strategy-research）',
        items: { type: 'string' },
      },
      index_entry: { type: 'string', description: 'kind=archive 的一句话结论（进归档索引）' },
      manual_updates: {
        type: 'array',
        description: 'kind=archive 的项目说明书更新点（feature/refactor/spike 必填）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: '文档路径（如 docs/architecture/project-manual.md）' },
            section: { type: 'string', description: '章节标题' },
            summary: { type: 'string', description: '一句话：这一节现在多了什么认知' },
          },
        },
      },
      manual_note: { type: 'string', description: 'kind=archive 无手册更新时的理由（bug/doc/chore 可只写这条）' },
      unlisted_ack: {
        type: 'array',
        description: 'kind=archive：未列且不打算收进清单的文件的显式豁免声明（path + reason）。未覆盖全部未列文件 → 拒绝（REQ-261004183621-de3f）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: '未列文件路径（工作区相对路径）' },
            reason: { type: 'string', description: '为什么不收进清单（必填）' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // 不是 boolean！真实形状是 application/internal/auto-confirm.ts 的 AutoConfirmResult
          // （`{ triggered: boolean; reason?: string }`）。此前声明成 `type:'boolean'` ⇒ 每次 submit
          // 都被绑定层判 `value.auto_confirm must be a boolean`：产物登记了、确认门也挂上了，
          // agent 却只拿到一条 invalid output（2026-10-03 实测；kind=requirement 与 kind=plan 同源）。
          // reason 仅在 triggered=false 时出现，缺值走**整体省略**（不是发 null / undefined）。
          auto_confirm: {
            type: 'object',
            additionalProperties: false,
            description: '自动确认回执：{triggered, reason?}——对象，不是布尔',
            properties: {
              triggered: { type: 'boolean', description: '是否已触发后台确认弹框（false 时看 reason）' },
              reason: { type: 'string', description: '仅 triggered=false 时给出（弹框通道不可用，需手动 ask_confirm）' },
            },
          },
          readability_warnings: { type: 'array', items: { type: 'string' }, description: '可读性告警' },
          // REQ-261003222428-3556 FR-3：doc↔tasks 依赖一致性警告——计划文档依赖表声明了依赖
          // 而 tasks 数组对应 key 全空（agent 漏传 depends_on 的形态），点名不拒。
          // 仅在有时出现；缺省 = 整体省略键（无损 JSON 纪律）。
          dependency_warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'kind=plan：文档依赖表与 tasks 数组不一致的点名（漏传 depends_on 防线）',
          },
          // REQ-261002175818-80a8 t5 / FR-5 的灰度路径（capacity.markerGate='warn'）：
          // **不拒绝但也不静默**——计划文档里缺标记／批数写错的卡照样点名进返回体。
          // enforce 路径上键整体省略（有缺口时那份提交已被拒，根本没有返回体）。
          marker_warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'kind=plan：markerGate=warn 时，计划文档缺/错「⚠️超容量(建议N批)」标记的卡（只披露不拒绝）',
          },
          success: { type: 'boolean', description: '是否成功' },
          requirement_id: { type: 'string', description: '需求 id' },
          plan_status: { type: 'string', description: 'kind=plan：pending_approval' },
          task_count: { type: 'number', description: 'kind=plan：任务表条数' },
          orphan_clauses: {
            type: 'array',
            description: 'kind=plan：无任何下游引用的根编号（需求里有、没人接）——应在看板标红；不阻断提交',
            items: { type: 'string' },
          },
          // 超容量软门禁的出参（REQ-261002175818-80a8 t3 / FR-4）：**超容量不是错误**——
          // success 仍为 true，这两项只负责把「哪张卡装不下、建议切几批」说清楚。
          // 与返回体同批声明：output.schema 也是 additionalProperties:false，
          // 值算出来了却没声明 → 调用方只看到一条 invalid output（本仓已踩过三次）。
          overCapacity: {
            type: 'array',
            description: 'kind=plan：超容量卡清单（无 = 空数组；软门禁只标红与给分批建议，不拒绝提交）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string', description: '计划内引用键' },
                title: { type: 'string', description: '卡片标题（批准人不必回查计划）' },
                detailUnits: { type: 'number', description: '合成细节量（展示口径，两位小数）' },
                capacity: { type: 'number', description: '本轮生效的一轮容量' },
                suggestedBatches: { type: 'number', description: '建议批数（≥2）' },
                hint: { type: 'string', description: '一句话切分建议（按目录 / 按接口）' },
              },
            },
          },
          capacityNote: {
            type: 'object',
            additionalProperties: false,
            description: '判据自述：容量是**我们的常量**，不是运行时读数——防止把余量参考当判据',
            properties: {
              source: { type: 'string', description: 'constant=内置常量；config=插件配置覆盖' },
              value: { type: 'number', description: '本次生效的容量值' },
              calibrated: { type: 'boolean', description: '是否经过真实数据标定（当前恒为 false，标定闭环另立需求）' },
            },
          },
          tasks: {
            type: 'array',
            description: 'kind=plan：计划任务表（key/title/depends_on）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                title: { type: 'string' },
                depends_on: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          artifact: {
            type: 'object',
            additionalProperties: false,
            description: 'kind=requirement：登记的产物（stage/kind/path）',
            properties: {
              stage: { type: 'string' },
              kind: { type: 'string' },
              path: { type: 'string' },
            },
          },
          registered: { type: 'boolean', description: 'kind=requirement：false = 幂等命中（此前已登记）' },
          design_docs: {
            type: 'array',
            description: 'kind=design：逐份登记态（磁盘 / 产物簿 / 确认章三源合成）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', description: '文件名（如 architecture.md）' },
                path: { type: 'string', description: '工作区相对路径' },
                on_disk: { type: 'boolean', description: '磁盘上是否真实存在' },
                registered: { type: 'boolean', description: '产物簿是否有该条（kind=design）' },
                confirmed: { type: 'boolean', description: '是否已落章（confirmedAt !== undefined）' },
                exempted: { type: 'string', description: '有效豁免理由（front-matter design_exempt）' },
                conditional: { type: 'string', description: '条件必交标记：frontend / backend' },
              },
            },
          },
          registered_count: { type: 'number', description: 'kind=design：本次新登记条数（幂等命中不计数）' },
          status: { type: 'string', description: '提交后的需求状态（accepting / archived 等）' },
          tasks_done: { type: 'number', description: 'kind=verification：已完成任务数' },
          tasks_total: { type: 'number', description: 'kind=verification：任务总数' },
          sheet_version: { type: 'number', description: 'kind=verification：验收单版本（v1/v2…）' },
          sheet_items: { type: 'number', description: 'kind=verification：本轮验收项数' },
          rework_only: { type: 'boolean', description: 'kind=verification：本轮是否只含上版未过项（返工续验）' },
          acceptance_tracking_count: { type: 'number', description: 'kind=verification：验收追踪条目数' },
          doc_sync_pending: {
            type: 'array',
            description: '待同步的下游文档（重交下游产物后销标）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string' },
                downstream: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          doc_sync_warning: { type: 'string', description: '下游待同步警告' },
          blockers: {
            type: 'array',
            description: 'kind=verification：rollup 阻塞（未完成任务清单，需求未进验收的原因）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string' },
              },
            },
          },
          required_docs: { type: 'array', items: { type: 'string' }, description: 'kind=archive：该需求类型的必填文档' },
          unlisted_files: { type: 'array', items: { type: 'string' }, description: 'kind=archive：目录内未列入归档清单的文件（漏登警告）' },
          reconcile: {
            type: 'object',
            additionalProperties: false,
            description: 'kind=archive：清单对账三分类与生效闸门（REQ-261004183621-de3f）',
            properties: {
              gate: { type: 'string', description: 'enforce / warn' },
              listed: { type: 'array', items: { type: 'string' } },
              exempted: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { path: { type: 'string' }, rule: { type: 'string' } },
                },
              },
              unlisted: { type: 'array', items: { type: 'string' } },
              acknowledged: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { path: { type: 'string' }, reason: { type: 'string' } },
                },
              },
            },
          },
          warning: { type: 'string', description: '漏洞/阻塞等非阻断警告' },
          note: { type: 'string', description: '下一步指引' },
        },
      },
      render: renderSmart(submitSummary),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    execute: async (args: unknown, exec: ToolRunContext) => {
      // FR-9：本窗口有未作答的挂起确认时，写路径一律停手
      await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      const kind = normalizeText(((args ?? {}) as { kind?: unknown }).kind, 'kind', 32)
      const run = SUBMIT_DISPATCH[kind]
      if (run === undefined) {
        reject('reqboard_submit 未执行：kind 必须是 ' + SUBMIT_KINDS.join(' / '), 'REQBOARD_INVALID_INPUT')
      }
      return run(deps, args, exec)
    },
  } as any)
}
