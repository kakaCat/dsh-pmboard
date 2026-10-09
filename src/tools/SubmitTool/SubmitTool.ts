/**
 * reqboard_submit 工具壳（REQ-47939a t8）——**多个提交工具合一**，按 kind 表驱动分派，
 * 每个分支体只有一行用例调用（设计 §4.3「禁止大 if」）。（不数工具数：数字是派生量，
 * 抄进注释就会漂——REQ-261007200706-89b7 FR-2/FR-3 同款纪律。）
 *
 * kind → 用例：requirement/plan/prototype → SubmitArtifact；verification → SubmitVerification；
 * archive → SubmitArchive；design → SubmitDesignArtifacts。返回体为各用例返回键的并集
 * （穷尽声明，绑定层不拒收）。
 *
 * @module dsh-pmboard/tools/SubmitTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { submitRequirementArtifact, submitPlanArtifact, submitPrototypeArtifacts } from '../../application/use-cases/SubmitArtifact.js'
import { submitVerification } from '../../application/use-cases/SubmitVerification.js'
import { submitArchive } from '../../application/use-cases/SubmitArchive.js'
import { submitDesignArtifacts } from '../../application/use-cases/SubmitDesignArtifacts.js'
import { normalizeText, ALL_TASK_PHASES, ALL_TASK_SIDES, SUBMIT_KINDS } from '../../shared/protocol.js'
import { reject, assertNoPendingConfirm } from '../../application/internal/support.js'
import { LONG_TEXT_ARG_NOTE, renderSmart } from '../shared.js'
import { submitSummary } from '../render-summaries.js'
import { SUBMIT_PROMPT } from './prompt.js'

/** 六个 kind（分派表的键集合；错误消息与自检共用）——权威定义在 shared/protocol（适配层不写状态名字面量）。 */
export { SUBMIT_KINDS }

/** 分派表：kind → 用例（每项一个独立 use-case，禁止写成一个大 if）。 */
const SUBMIT_DISPATCH: Readonly<Record<string, (deps: UseCaseDeps, args: unknown, exec: unknown) => Promise<unknown>>> = {
  requirement: submitRequirementArtifact,
  plan: submitPlanArtifact,
  verification: submitVerification,
  archive: submitArchive,
  design: submitDesignArtifacts,
  prototype: submitPrototypeArtifacts,
}

export function defineSubmitTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_submit',
    description: SUBMIT_PROMPT,
    parameters: {
      kind: {
        type: 'string',
        description: '提交类型：requirement=需求文档 / plan=拆分计划 / verification=验收材料 / archive=归档材料 / design=设计文档登记（扫 design/ 或单份） / prototype=原型登记（扫 prototypes/*.html 或单份，抽锚点与几何量写产物元数据）',
        required: true,
        enum: [...SUBMIT_KINDS],
      },
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；不传默认本窗口绑定的需求' },
      path: { type: 'string', description: '文档路径（kind=requirement/plan/design/prototype）：工作区相对路径；design 缺省 = 扫 docs/requirements/<REQ>/design/*.md；prototype 缺省 = 扫 docs/requirements/<REQ>/prototypes/*.html（旧目录 prototype/*.html 仍识别并提示迁移）' },
      summary: { type: 'string', description: '摘要：requirement=一句话摘要；plan=目标+做法；verification=交付结论（≤2000 字符）；' + LONG_TEXT_ARG_NOTE },
      change_note: { type: 'string', description: '变更原因（已确认/已批准后重交时必填）：改了什么/为什么，下游标"待同步"' },
      tasks: {
        type: 'array',
        // REQ-261008020552-4aa0 FR-4：逐字段细则已下沉到各门禁拒绝回执（细则之家有门禁测试逐条钉住），
        // 这里只留一句话——参数形状（键名/类型/枚举/additionalProperties）逐字不动。
        description: 'kind=plan 的任务表（可选，1-50 项）；每项须含 implementation 与可证伪 acceptance；逐字段细则见各门禁拒绝回执',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', description: '计划内引用键（如 t1；depends_on 用它引用）' },
            requirement_refs: { type: 'array', items: { type: 'string' }, description: '本卡承接的需求条款（如 ["FR-1"]）；落库供 RTM/覆盖度取数' },
            // 原型锚点 / 关联 D-x（REQ-261005105032-3b02 FR-5、FR-9 / t12）：**必须**在这里声明——
            // 本 schema 是 additionalProperties:false，未声明的键被绑定层直接拒收（或按丢失处理），
            // 于是"计划携带任务表"这条通道的锚点与裁定的引用恒空（requirement_refs 栽过同款）。
            prototypeRefs: { type: 'array', items: { type: 'string' }, description: 'UI 卡原型锚点（如 ["prototypes/detail.html#FR-4"]）；必填条件见锚点门禁回执' },
            decisionRefs: { type: 'array', items: { type: 'string' }, description: '本卡承接的裁定编号（如 ["D-1"]）；落库供 RTM covers_decisions' },
            title: { type: 'string', description: '任务标题（动词开头，≤120 字符）' },
            description: { type: 'string', description: '任务说明（改哪些文件/接口）' },
            phase: { type: 'string', description: '阶段（受控枚举）', enum: [...ALL_TASK_PHASES] },
            side: { type: 'string', description: '端侧（受控枚举）', enum: [...ALL_TASK_SIDES] },
            stages: {
              type: 'array',
              description: '本卡子卡段（受控枚举，与 template 二选一）；不填按卡 phase、其次需求分类兜底；合法值见非法值回执',
              items: { type: 'string' },
            },
            template: {
              type: 'string',
              description: '子卡链模板键（与 stages 二选一，可与 skipIntegration 叠加）；非法键回执列全部合法键',
            },
            skipIntegration: { type: 'boolean', description: '本卡无接口可联调时设 true（必须同时给理由）' },
            // 理由载体（2026-10-06）：砍联调段是减法，批的人要能复核依据。两种拼法都声明——
            // 本 schema 是 additionalProperties:false，只声明一种 = 另一种写法被绑定层**拒收**
            // （比静默丢弃更难查：agent 会以为是参数名写错而不是被门禁拦）。
            skip_integration_reason: { type: 'string', description: '为什么没接口面（skipIntegration=true 时必填，一句话）；snake/camel 等价' },
            skipIntegrationReason: { type: 'string', description: '同上（camel 拼法，两者都认）' },
            // 粒度豁免（REQ-261007125552-32cb FR-4）：一卡多接口确属合理（契约卡/聚合卡）时必填理由——
            // 本 schema 是 additionalProperties:false，不声明 = 绑定层直接拒收（footprint 栽过同款）。
            granularity_exempt: { type: 'string', description: '粒度豁免理由（一卡多接口确需时必填，≤300 字符）；snake/camel 等价' },
            granularityExempt: { type: 'string', description: '同上（camel 拼法，两者都认）' },
            dep_reasons: {
              type: 'array',
              items: { type: 'string' },
              // 写法细则（key=理由 格式、为什么不是 map）已下沉到 plan-deps-check 的伪依赖回执（FR-4）。
              description: '依赖理由（零交集边必填）：形如 "t2=一句话理由"；写法细则见伪依赖回执；snake/camel 等价',
            },
            depReasons: {
              type: 'array',
              items: { type: 'string' },
              description: '同上（camel 拼法，合并取并集）',
            },
            depends_on: { type: 'array', description: '依赖的计划内 key', items: { type: 'string' } },
            acceptance: { type: 'string', description: '验收标准（可验证：跑什么、看到什么算过；空话/缺锚点打回）' },
            implementation: { type: 'string', description: '实施方案（必填：改哪些文件、步骤、验证方式——拆分卡≠实施卡）' },
            // 体量声明（REQ-261002175818-80a8 t3 / FR-1）：本键**必须**在这里声明，否则绑定层
            // 按 additionalProperties:false 直接拒收，产品主入口的体量通道永远打不通
            // （t2 的健康检查用例刻意绕过壳层，于是这条 P0 当时没有任何用例能发现）。
            footprint: {
              type: 'object',
              additionalProperties: false,
              description: '卡片体量声明（可选）；三量口径见校验回执',
              properties: {
                files: { type: 'number', description: '要改/新建的文件数' },
                anchors: { type: 'number', description: '验收锚点数' },
                chars: { type: 'number', description: '实施描述与改动量字符数' },
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
      // REQ-261006092213-4f5b FR-1 / D-3 / D-4：**逐项实测结果**（提交那一刻一次闭环落章）。
      // 为什么必须在这里显式声明：本 schema 是 additionalProperties:false，未声明的键会被绑定层
      // 直接拒收——`footprint` / `prototypeRefs` 都栽过同一形态（本仓已踩过三次）。
      results: {
        type: 'array',
        description: 'kind=verification：逐项实测结果（可选；传了就必须**逐项交代**——漏项 / 坏 ref / 空结果会被拒并点名）。'
          + 'ref 与验收项来源同构：{kind:"task",taskId} / {kind:"requirement"} / {kind:"prototype-compare",prototypePath} / {kind:"decision-compare",decisionIds}；'
          + '每项二选一：给 result（命令+输出摘要，≤500 字符）或标 needsHuman:true + humanReason（界面视觉 / 线下流程这类只能人看的项）。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ref: {
              type: 'object',
              additionalProperties: false,
              description: '引用键：与验收项来源同构（不发明第二套键，也不依赖提交后才生成的验收项 id）；kind 必填',
              properties: {
                kind: { type: 'string', enum: ['task', 'requirement', 'prototype-compare', 'decision-compare'] },
                taskId: { type: 'string', description: 'kind=task：顶层父卡任务 id' },
                prototypePath: { type: 'string', description: 'kind=prototype-compare：原型页面路径（与验收单同值）' },
                decisionIds: { type: 'array', items: { type: 'string' }, description: 'kind=decision-compare：本轮裁定的 D-x 编号' },
              },
            },
            result: { type: 'string', description: '命令 + 输出摘要（≤500 字符，超长截断）' },
            needsHuman: { type: 'boolean', description: 'true = 该项只能人看（agent 跑不了）' },
            humanReason: { type: 'string', description: 'needsHuman=true 时必填：为什么必须人看（无理由即拒）' },
          },
        },
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
        // 出处（agent 不可见）：REQ-261004183621-de3f。
        description: 'kind=archive：未列且不打算收进清单的文件的显式豁免声明（path + reason）。未覆盖全部未列文件 → 拒绝',
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
          // 2026-10-06 文档质量门禁加固：条款级判据软门禁（只提示不拦）——每条条款的定义行块内
          // 找不到可核验判据（命令 / 断言 / 可读数 / 明确取值）时逐条点名。
          // 与 readability_warnings 同口径：非空才出键（缺省 = 整体省略）。
          clause_criteria_warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'kind=requirement：无可执行判据的条款逐条点名（软提示，不阻断提交）',
          },
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
          // 任务表列齐全（2026-10-06）：硬判（文档里有没有任务表、表里的 key 覆不覆盖 tasks[].key）
          // 走 GateFailure（不通过就没有返回体）；**软判**（表头缺「验收标准」/「工作量(S/M/L)」这类
          // 该有的列）不拒，只在这里点名——列是给批准人读的，缺列会让「批准所见 ≠ 文档所见」。
          plan_doc_warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'kind=plan：提交的那份计划文档里任务表的**缺列**点名（软提示，不阻断提交）',
          },
          // 粒度门禁（REQ-261007125552-32cb FR-2/FR-4/FR-5）：软门与豁免/降级披露——
          // 硬门（对照表缺失 / 一卡多接口无豁免）走 GateFailure 没有返回体；
          // 这里只承载「放行但必须让人看见」的部分（与 marker_warnings 同口径）。
          granularity_warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'kind=plan：粒度门禁的警告（files 超形态软上限 / UI 卡一卡多锚点 / granularity_exempt 豁免生效理由 / 对照表门降级原因）——只披露不拒绝',
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
          registered_count: { type: 'number', description: 'kind=design/prototype：本次新登记条数（幂等命中不计数）' },
          prototypes: {
            type: 'array',
            description: 'kind=prototype：逐份原型登记态（磁盘 / 产物簿 / INDEX / 确认章四源合成，与 design_docs 同构）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', description: '文件名（如 detail.html）' },
                path: { type: 'string', description: '工作区相对路径' },
                on_disk: { type: 'boolean', description: '磁盘上是否真实存在' },
                registered: { type: 'boolean', description: '产物簿是否有该条（stage=brainstorming + kind=prototype）' },
                confirmed: { type: 'boolean', description: '是否已落章（confirmedAt !== undefined）；门禁只要求已登记，确认章是可选加强' },
                exempted: { type: 'string', description: '有效豁免理由（front-matter prototype_exempt，理由非空且 requirement 已落章才注入）' },
                authoritative: { type: 'boolean', description: 'INDEX「状态」列 === authoritative' },
                superseded_by: { type: 'string', description: 'INDEX「被取代于」列（仅 superseded 行有）' },
                serves: { type: 'array', items: { type: 'string' }, description: 'INDEX「服务条款」列声明的 FR' },
                anchors: { type: 'array', items: { type: 'string' }, description: '抽到的 id="FR-N" 锚点' },
                geometry: { type: 'array', items: { type: 'string' }, description: 'proto-geometry 的观测量名（不含值/阈值）' },
              },
            },
          },
          status: { type: 'string', description: '提交后的需求状态（accepting / archived 等）' },
          tasks_done: { type: 'number', description: 'kind=verification：已完成任务数' },
          tasks_total: { type: 'number', description: 'kind=verification：任务总数' },
          sheet_version: { type: 'number', description: 'kind=verification：验收单版本（v1/v2…）' },
          sheet_items: { type: 'number', description: 'kind=verification：本轮验收项数' },
          // REQ-261006092213-4f5b FR-1 / FR-2：逐项交代的回执（`bound` 取 changed、`matched` 作诊断）。
          results_bound: { type: 'number', description: 'kind=verification：真正写进台账的逐项结果条数（= applyStructuredResults 的 changed；人填过的 result 受保护 → 命中但不计；同值重写仍计入）' },
          results_matched: { type: 'number', description: 'kind=verification：命中可预见项的 results 条数（诊断「命中但没改动」）' },
          results_unmatched: { type: 'array', items: { type: 'string' }, description: 'kind=verification：无法归属的键（坏 ref 已被拒；此处为 evidence 里「id :: 结果」老写法的未命中键）——不再静默' },
          results_out_of_scope: { type: 'array', items: { type: 'string' }, description: 'kind=verification：本版验收单不含但确实存在的 ref（返工续版的正常情形）——如实报告、不拒' },
          results_coverage: { type: 'string', description: 'kind=verification：complete=已逐项交代；legacy=未传 results（老调用方）或回滚开关 DSH_REQBOARD_NO_ITEM_RESULT 生效' },
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
                // 2026-10-06 实测补声明：值里一直带着 reason / at（DocSyncPending 的形状），
                // 而 schema 只声明了 source/downstream ⇒ 每次「有文档待同步」的 submit 都在**返回体**
                // 被绑定层判 `value.doc_sync_pending[0].reason is not a declared property`，
                // 产物其实已落库、agent 却只拿到一条 invalid output（本仓已踩过的同款形态）。
                reason: { type: 'string', description: '变更原因（人读）' },
                at: { type: 'number', description: '标记时间（毫秒时间戳）' },
              },
            },
          },
          doc_sync_warning: { type: 'string', description: '下游待同步警告' },
          // blockers 是**两种形状**，因为两种 kind 说的是两件事：
          //   · kind=prototype（REQ-261005105032-3b02 §1）：未登记/不可登记的原因 → **字符串清单**
          //     （人读的补齐指引，如 prototype_missing 点名目录与骨架路径）；
          //   · kind=verification：rollup 阻塞 → 结构化对象（id/title/status，看板要按 id 跳转）。
          // 一个 additionalProperties:false 的对象壳装不下两种形状，故用 oneOf 声明（不合并语义、
          // 不把一方的读数降级成字符串）。
          blockers: {
            description: 'kind=verification：rollup 阻塞（未完成任务清单，需求未进验收的原因）；kind=prototype：未登记/不可登记的原因字符串清单',
            oneOf: [
              { type: 'array', items: { type: 'string' } },
              {
                type: 'array',
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
            ],
          },
          required_docs: { type: 'array', items: { type: 'string' }, description: 'kind=archive：该需求类型的必填文档' },
          unlisted_files: { type: 'array', items: { type: 'string' }, description: 'kind=archive：目录内未列入归档清单的文件（漏登警告）' },
          reconcile: {
            type: 'object',
            additionalProperties: false,
            description: 'kind=archive：清单对账三分类与生效闸门',
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
          resolved_targets: {
            type: 'object',
            additionalProperties: false,
            description: 'kind=archive：本次判据的生效根与逐条读数——'
              + 'merged_into 的存在性与字节数、manual_anchors 的锚点可达性。用途：复核「在哪个根上判的」。',
            properties: {
              root: { type: 'string', description: '实际用于探测的工作区根（绝对路径）' },
              by: { type: 'string', description: '根判定来源：project-id / path-fallback / unknown' },
              attributed: { type: 'boolean', description: 'true = 根来自项目身份（权威值）；false = 路径兜底（须如实标注）' },
              merged_into: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    path: { type: 'string' },
                    ok: { type: 'boolean' },
                    bytes: { type: 'number', description: '实测字节数（缺失 ≠ 0）' },
                  },
                },
              },
              manual_anchors: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { path: { type: 'string' }, anchor: { type: 'string' }, ok: { type: 'boolean' } },
                },
              },
            },
          },
          archive_manifest: {
            type: 'object',
            additionalProperties: false,
            description: 'kind=archive：归档渲染物 <dir>/archive.md 的落点与本次是否写盘——'
              + 'written=false 表示内容与盘上一致、未重写（幂等命中，保留盘上首次的「渲染时刻」）。',
            properties: {
              path: { type: 'string', description: '渲染物工作区相对路径（= <dir>/archive.md）' },
              written: { type: 'boolean', description: 'true = 本次写了盘；false = 剔除「渲染时刻」行后逐字节相同、未重写' },
              bytes: { type: 'number', description: '渲染文本的 UTF-8 字节数' },
            },
          },
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
