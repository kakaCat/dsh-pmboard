/**
 * 捕获引导段文本组装（REQ-47939a t9 ← host/capture.ts）——systemPrompt 组装处按窗口条件取文本。
 *
 * 为什么在 application：这些函数是**纯文本编排**（给 LLM 看的过程纪律与立项引导文案），
 * 只读台账视图 + 窗口投影，无 I/O、无 ctx、不碰 fs。规则（窗口绑定/pending 判定）在
 * application/internal/window.ts，阶段提示词常量在 domain/stage/StagePromptSpec.ts。
 *
 * 搬迁口径（t9）：文本逐字保持（含全部中文字面量），既有 capture.test.ts /
 * stage-prompts.test.ts / acceptance-criteria.test.ts 的断言语义不变，仅 import 路径改到本模块。
 *
 * @module dsh-pmboard/application/internal/capture-section
 */

import { PM_BADGE_PREFIX } from '../../domain/text/pm-badge.js'
import type { ReqboardLedger, TaskRecord } from '../../shared/protocol.js'
import { captureDiag } from './diag-log.js'
import { stageEnabledFor } from '../../shared/protocol.js'
import type { StageKey } from '../../domain/requirement/RequirementStatus.js'
import { resolveStagePrompt, isPromptStage } from '../../domain/prompt/index.js'
import { difficultyFromDeclaredPrompt } from '../../domain/prompt/difficulty-mapping.js'
import {
  injectionLogInputFromResolved,
  type InjectionLogPort,
} from './injection-log.js'
import { isImplementing } from '../../domain/status/Predicates.js'
import { isInProgressTask } from '../../domain/status/Predicates.js'
import { factsOf, type RequirementFacts } from '../../domain/requirement/RequirementSummary.js'
import {
  windowKeyFromContext,
  isWindowBoundFromFacts,
  openPromptFactsFor,
} from './window.js'

/**
 * 待捕获消息登记（确定性消息 hook 写入、capture section 消费的瞬态信号）。
 * 不进台账——它是「用户消息刚到达、窗口需要走立项评估」的一次性触发信号，
 * turn/end 后由 hook 清除（消费完毕）。
 */
export interface PendingCaptureMessage {
  windowKey: string
  /** 清洗后的用户消息文本（供注入引用；纯系统块/噪声消息不会登记）。 */
  text: string
  capturedAt: number
}

/**
 * 该窗口的捕获引导 section 文本（乙：提示 agent 识别新工作 → 调 reqboard_capture
 * 弹立项三问（名称/类型/难度）并在同一次调用内创建即立项）。bound / 已有遗留 pending / 无法取 windowKey →
 * 返回 ''（零噪音）。永不返回 undefined。
 *
 * 第三参 pending 为确定性消息 hook 登记的本窗口「待捕获候选」：命中时返回
 * 引用该用户消息原文的针对性立项提示（用户裁定：消息到达 → hook 检查窗口是否
 * 需要立项捕获 → 注入提示词让 LLM 调 reqboard_capture 弹三问 → 直接建 REQ），未命中维持静态引导。
 * 向后兼容：不传 pending 时行为与旧版完全一致（capture.test.ts 三分支不变）。
 */
export function captureSectionText(
  ledger: ReqboardLedger,
  context: unknown,
  pending?: PendingCaptureMessage | undefined,
): string {
  return captureSectionTextFrom(ledger.requirements.map(factsOf), context, pending)
}

/**
 * 同一段的**窄投影实现**（B12 阶段①-a）：吃 `RequirementFacts[]` 而不是整册 `ReqboardLedger`。
 *
 * 为什么要这一步：这一段服务于 `systemPrompt.section` 的 `text` 回调——**同步**、
 * 每回合执行、且过期不致命（端口注释已划定许可区）。旧路径要 `deps.store.snapshot`（同步整册镜像，
 * 正是本需求要消灭的形态），而它实际只读 `status` 与 `sourceSessionId`。
 * ⇒ 改由 `RequirementStore.peekFacts()` 供数，同步缝不再依赖桥。
 *
 * 与 `captureSectionText(ledger, …)` 的关系：后者是**投影壳**（把整册投影成窄投影再调本函数），
 * 只为尚未搬迁的调用方（测试）保留，随 B12 删桥一并删除。
 */
export function captureSectionTextFrom(
  facts: readonly RequirementFacts[],
  context: unknown,
  pending?: PendingCaptureMessage | undefined,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (!windowKey) {
    // 【诊断日志-节点5】返回空串原因：windowKey undefined
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns '' (reason: windowKey=undefined)`);
    return '';
  }
  if (isWindowBoundFromFacts(facts, windowKey)) {
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns '' (reason: windowBound=true, windowKey=${windowKey.slice(0, 16)})`);
    return '';
  }
  if (pending && pending.windowKey === windowKey && pending.text.trim().length > 0) {
    const promptText = capturePromptForMessage(windowKey, pending.text);
    // 【诊断日志-节点5】返回动态提示词
    captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns DYNAMIC PROMPT (windowKey=${windowKey.slice(0, 16)}, text.length=${promptText.length}, pending.text.length=${pending.text.length})`);
    return promptText;
  }
  const guidanceText = captureGuidanceText(windowKey);
  captureDiag(`reqboard-capture [NODE-5]: captureSectionText returns STATIC GUIDANCE (windowKey=${windowKey.slice(0, 16)}, text.length=${guidanceText.length})`);
  return guidanceText;
}

/**
 * 绑定窗口的「推进纪律」段 —— 本窗口已绑定进行中需求时注入；未绑定 → ''。
 *
 * 为什么需要：此前 bound 窗口的 section 返回 ''（零噪音），窗口 agent 根本不知道
 * 自己名下有需求、更不知道可以推进状态 → 需求建卡后只能等人点按钮（用户反馈
 * 「agent 自己不能推进吗，还需要用户手动推进」）。本段把「状态由窗口自己维护」
 * 变成提示词里的明确纪律，窗口在里程碑处主动调 reqboard_move。
 *
 * @param tasks 队列任务快照（REQ-260927202051-f6df）。**三态**（Lead D17 硬要求）：
 *   - `undefined` = 任务**尚未加载**（缓存首帧）→ 略过"当前任务"块，**不**断言"没有任务"；
 *   - `[]` = 已加载且该需求确无在制任务（同样略过，不产生错误文字）；
 *   - 非空 = 正常渲染。
 *
 * **本函数必须保持同步**：它服务于 system-prompt section 的 `text` provider，而 DSH 的
 * `SectionSpec.text` 类型是 `string | ((context) => string)`（**同步，不能 await**，实测
 * `@deepseek-ai/dsh-system-prompt/lib/types/index.d.ts:60`）。故任务由调用方以**同步可得
 * 的缓存快照**传入（见 `gate-wiring.ts` 里 `taskStore.subscribe` 维护的缓存）。
 */
export function boundSectionText(
  ledger: ReqboardLedger,
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  injectionLog?: InjectionLogPort,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  return boundSectionTextFrom(ledger.requirements.map(factsOf), tasks, context, injectionLog)
}

/**
 * 同一段的**窄投影实现**（B12 阶段①-a）——见 `captureSectionTextFrom` 的说明。
 *
 * 本段比捕获段多要一个字段：`description`（`resolveStagePrompt` 用它推断提示词难度，FR-16）。
 * 这也是"看板摘要（`RequirementSummary`）不能直接拿来用"的原因——见 `RequirementFacts` 的注释。
 */
export function boundSectionTextFrom(
  facts: readonly RequirementFacts[],
  tasks: readonly TaskRecord[] | undefined,
  context: unknown,
  injectionLog?: InjectionLogPort,
): string {
  const windowKey = windowKeyFromContext(context as { agent?: { id?: unknown }; scope?: unknown })
  if (windowKey === undefined) return ''
  const open = openPromptFactsFor(facts, windowKey)
  if (open.length === 0) return ''
  // 基础需求列表
  const lines: string[] = [
    `${PM_BADGE_PREFIX}项目看板（reqboard · 本窗口 ${windowKey.slice(0, 16)} 已绑定需求）`,
    '',
    '本窗口名下有进行中的需求：',
    ...open.map(r => `- ${r.id}《${r.title}》当前状态：${r.status}`),
    '',
  ]
  
  // ========== implementing 阶段注入当前任务执行指引 ==========
  const implementingReq = open.find(isImplementing)
  // 三态契约（Lead D17 硬要求）：`tasks === undefined` = 队列任务**尚未加载**（缓存首帧）→
  // **整体略过**本块。绝不能把它当成"当前没有任务"来渲染 —— 那是**错误断言**（未加载 ≠ 已加载且为空）。
  // `[]` = 已加载且确无任务（略过即可，同样不产生错误文字）。
  if (implementingReq && tasks !== undefined) {
    const inProgressTasks = tasks.filter(
      t => t.requirementId === implementingReq.id && isInProgressTask(t)
    )
    
    if (inProgressTasks.length > 0) {
      const task = inProgressTasks[0]
      lines.push('## 【当前任务执行中】')
      lines.push('')
      lines.push(`任务：${task.title}`)
      lines.push('')
      lines.push('**任务说明**：')
      lines.push(task.description || '（无）')
      lines.push('')
      lines.push('**需求背景**：')
      lines.push(task.context || '（无）')
      lines.push('')
      lines.push('**验收标准**：')
      lines.push(task.acceptance || '（无）')
      lines.push('')
      lines.push(`**阶段**：${task.phase} | **端侧**：${task.side}`)
      lines.push('')
      lines.push('---')
      // 卡片层契约（2026-09-28）：合法边由**卡片角色**决定——父卡（有子卡）与子卡只有
      // todo→in_progress→done（TaskStatus 的 PARENT_/SUBTASK_TRANSITIONS 对 integrating/
      // testing/in_review 无出边），照旧文案推进必吃 invalid_transition；只有存量卡走五段。
      const hasKids = (tasks ?? []).some(t => t.parentId === task.id)
      const isSubtask = task.parentId !== undefined
      lines.push('请按照任务说明执行。完成后推进任务状态：')
      if (hasKids || isSubtask) {
        lines.push(`- 完成 → reqboard_task_move({ task_id: '${task.id}', to: 'done', reason: '...' })`)
        lines.push('  （本卡是父卡/子卡：合法边只有 todo → in_progress → done；联调/复核/测试由子卡链各阶段承载）')
      } else {
        lines.push(`- 开发完成 → reqboard_task_move({ task_id: '${task.id}', to: 'integrating', reason: '...' })`)
        lines.push(`- 联调完成 → reqboard_task_move({ task_id: '${task.id}', to: 'testing', reason: '...' })`)
        lines.push(`- 测试通过 → reqboard_task_move({ task_id: '${task.id}', to: 'in_review', reason: '...' })`)
        lines.push('  （本卡是存量卡：无子卡链，走五段状态机）')
      }
      lines.push('')
      lines.push('查看所有任务：reqboard_status()')
      lines.push('')
    }
  }
  // ========== 任务执行指引结束 ==========
  
  // ========== 阶段提示词注入（REQ-31e11f t5：按当前阶段注入纪律提示词）==========
  // 被分类档案跳过的阶段（stageEnabledFor=false）不注入——跳过阶段不产生物、不设门、
  // 不注入提示词。同一窗口多个 open 需求时，取最近更新的那条。
  const stageReq = [...open].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (stageReq !== undefined) {
    const stage = stageReq.status
    // draft/done/canceled 不是可注入节点（types.ts）：先过闸，避免只捞到 ⑤ 铁律而被当成有提示词。
    if (isPromptStage(stage) && stageEnabledFor(stageReq.category, stage as StageKey)) {
      // INV-1：取词唯一入口（分片库 + 回退链 + 预算）；不再直取常量表。
      // FR-16：带上需求实质，让唯一取词入口按它推断难度（动架构 / 跨子系统 / 改数据模型 → heavy），
      // 不再静默回落缺省 light——REQ-c9f899 被注入轻档提示词的根因就在这一行。
      // REQ-261005154851-8512 FR-2：把**声明难度**带上——注入组装是同步缝，读不到台账，
      // 故它必须由 facts 投影带进来（FR-1）。未声明 → 不传该键，回落文本推断（与改造前逐字相同）。
      const declared = difficultyFromDeclaredPrompt(stageReq.promptDifficulty)
      const resolved = resolveStagePrompt({
        stage,
        category: stageReq.category,
        requirement: { title: stageReq.title, description: stageReq.description },
        ...(declared === undefined ? {} : { declaredDifficulty: declared }),
      })
      if (resolved.text.length > 0) {
        lines.push('')
        lines.push(resolved.text)
        // INV-6：注入即留痕（本次到底注入了什么，可被看板/人核查）。
        // FR-9（t-cc7233）：这一处是**每轮系统提示词的装配**——正文确实进了会话，
        // 故 delivered=true、origin='system-prompt'（设计稿只列了三个写入点，这是实施发现的第四处）。
        injectionLog?.record(injectionLogInputFromResolved(resolved, windowKey, {
          origin: 'system-prompt',
          delivered: true,
        }))
      }
    }
  }
  // ========== 阶段提示词注入结束 ==========

  lines.push(
    '流水线（状态就是阶段，从立项一路走到交付）：',
    '- draft 立项 → brainstorming 需求分析（探边界/方案）→ design 设计（只写设计文档）→',
    '  decomposing 拆分（写拆分计划 → 人批准 → 落库任务 DAG）→ implementing 执行 → accepting 验收 → done 完成；',
    '- 方案谈定 → reqboard_move 到 design（设计属于这个阶段）；',
    '',
    '设计阶段（2026-09-21 用户裁定：只写设计文档，不写计划）：',
    '- 把设计写进 docs/requirements/<REQ>/design/ 目录（按类型模板：架构/接口/数据模型等）；',
    '- 写完先调 reqboard_submit(kind=design) 登记设计文档（缺省扫全目录，也可指定单份 path）；',
    '- 由你发起确认：**先看登记回执**——若它已写明「已有一道门在等 / 已自动触发确认弹框」，'
      + '就**不要再调 reqboard_ask_confirm**（那会开出第二个框）；改为读确认态或取回执'
      + '（reqboard_status / reqboard_confirm_receipt）。确认后自动进入拆分；',
    '',
    '拆分阶段（拆分计划在这里写 · 唯一需要人点头的地方）：',
    '- 把设计落成拆分计划 → reqboard_submit(kind=plan)（path = docs/requirements/<REQ>/decomposition.md，',
    '  summary = 一段人能读懂的目标+做法，tasks = 将来要落库的任务表：',
    '  key/title/phase/side/depends_on/acceptance，粒度与依赖在这里定死）；',
    '- 提交后**先看回执**：已写明「已有一道门在等 / 已自动触发批准弹框」时**不要重复发起**'
      + '（reqboard_ask_confirm 会复用同一道门，但没必要再发一次）；只有回执说没弹框时才调一次；',
    '  ——未批准时 reqboard_decompose 被代码级拒绝（看板「批准计划」同样有效）；',
    '- 批准后自动落库任务卡并进入实施（不传 tasks = 直接落库批准的计划；',
    '  传了 tasks 则必须与计划 key 一致，防止「批了 A 落库 B」）；',
    '- 计划要改 → 重新 reqboard_submit(kind=plan)（旧批准自动作废，需重新批准）。',
    '',
    '状态推进纪律（计划批准之后，其余都由窗口自己维护，不需要用户手动点按钮）：',
    '- 方案敲定 → reqboard_decompose 把需求拆成任务 DAG 落库（真拆分：写台账任务卡，',
    '  看板「任务」页与甘特图据此渲染；depends_on 用批次内 key 引用同批任务）；',
    '- 拆分后需求会自动进入拆分态；任务开工/完成用 reqboard_task_move 推进',
    '  （父卡/子卡：todo → in_progress → done；存量卡：todo → in_progress → testing → in_review → done；',
    '  开工时会自动记一段执行时间）；',
    '- 任务全部 done 时系统自动把需求推进到 accepting（验收）；交付并自检通过后',
    '  用 reqboard_move 自行推进到 done。',
    '- 只有「取消需求/归档/取消任务」必须人操作（agent 调用会被代码级拒绝）。',
    '- 推进时用 reason 写清做了什么（进需求留痕，供复盘与验收）。',
    '',
    '验收阶段（人工审核，agent 不自己判过）：',
    '- 交付完成 → reqboard_submit(kind=verification) 提交验收材料',
    '  （summary = 交付结论；evidence = 可复核证据：命令+输出摘要/报告路径/截图路径）；',
    '- 提交后需求进入 accepting 态，等待人工逐项验收（看板验收单页面）；',
    '- 验收通过 → 准备归档材料；被退回 → 按人的意见返工后重新提交验收。',
    '',
    '归档阶段（先提交材料，人工归档）：',
    '- 验收通过后 → reqboard_submit(kind=archive) 提交归档材料',
    '  （需求目录、目录内文档清单、合并去向 merged_into、一句话索引条目）；',
    '- 提交后在看板归档页面等待人工最终归档确认。',
    '- 合并去向与必填文档按需求类型限定（feature→architecture/guides，bug→known-issues，',
    '  spike→research，refactor→architecture/work-logs，chore→work-logs），规范见',
    '  agent-dh/docs/architecture/requirement-archive.md；缺项会被代码级拒绝；',
    '- 归档材料里写了的合并去向，必须真的把那部分结论写进对应的项目文档；',
    '- 金字塔生长：feature/refactor/spike 必须在材料里申报 manual_updates（更新了哪份文档的哪一节、',
    '  多了什么认知），说明书是 docs/architecture/project-manual.md；bug/doc/chore 写 manual_note 说明即可；',
    '- docs 按 wiki 维护：新页面要有 front-matter 并挂进首页/上层页，未写的主题进首页「待写页」；',
    '  收工前可跑 python3 agent-dh/scripts/wiki_probe.py 自检死链/孤儿页。',
  )
  
  return lines.join('\n')
}

/**
 * 针对性立项提示（消息事件 hook 命中时注入）：引用刚到达的用户消息原文，
 * 指示 LLM 判断该输入是否值得立项——值得则【调 reqboard_capture（pm 专有立项弹框）
 * 一次完成「立项三问 + 创建 + 绑定」】：三问为「需求名称」（候选由本条消息上下文
 * 推导、最贴切一项置首推荐、允许自定义输入）「需求类型」（feature/bug/doc/refactor/
 * spike/chore）「提示词难度」（simple/standard/advanced/expert）；**用户作答即立项确认**，
 * 工具在同一次调用内创建 REQ 并绑定本窗口（创建即立项，无待归类/建议卡中间态，看板
 * 立即可见）。
 *
 * **措辞已硬化（2026-09-20 t-3e11bf E2E 走查后的返工）**：走查实测（窗口 session-361c2879，
 * 15:23–15:30 四个回合）——hook 登记、pending 命中、本段注入**全部正常**，但窗口内 35 次
 * PTC 子调用只有 read/grep，**零次 reqboard_capture**；其中"修复 FR-6 任务状态机"这种
 * 明确工作意图也被模型判成"对当前审查的追问"而跳过。根因：原文案是"请先判断**可能**包含
 * 值得立项的意图 / 只是闲聊则正常回复"——二元裁量 + 零后果，模型默认选"先答问题"。
 * 故改为：①必须显式裁定（判不准按值得立项处理）②值得立项时**本回合第一个工具调用**即
 * reqboard_capture ③不立项时必须在回复首行写明理由（把沉默变成可审计表态）。
 * 判定仍留给 LLM（窗口 agent 自身回合），hook 只保证确定性触发。全部字面量。
 */
export function capturePromptForMessage(windowKey: string, text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  const snippet = trimmed.slice(0, 300)
  return [
    `${PM_BADGE_PREFIX}项目捕获（reqboard · 本窗口 ${windowKey.slice(0, 16)} 检测到用户新输入）`,
    '',
    '用户刚发来一条消息。**本回合你必须先做一次显式裁定、再回答用户**——沉默跳过等于',
    '本回合未完成（会被留痕，走查时按失败计）。',
    '',
    '**第一步：判断消息类型**',
    '',
    'A. **直接执行**——用户已给出精确修改值 + 执行指令，如：',
    '   - "改成 500"、"设为 200"、"提高到 1000"',
    '   - "修改"、"执行"、"apply"、"直接改"',
    '   - 改动范围单一明确（一个文件/一个配置项）',
    '   → **立即执行 edit/write，不弹框、不立项**',
    '',
    'B. **值得立项**——用户提出新工作意图，但未给出精确值，如：',
    '   - "帮我做个功能"、"修复这个 bug"、"重构某模块"',
    '   - 需要拆解的复杂需求、需要追踪的改动',
    '   → **本回合第一个工具调用必须是 reqboard_capture**',
    '',
    'C. **不立项**——纯提问、咨询、闲聊，如：',
    '   - "dsh 支持吗"、"进度如何"、"谢谢"',
    '   → **回复第一行写明「本条不立项：<理由>」**',
    '',
    '**第二步：执行对应动作**',
    '',
    'A. 直接执行时：',
    '   - 立即调 edit/write 修改代码',
    '   - 回复用户执行结果',
    '   - 绝对禁止调 reqboard_capture（这不是立项，是干活）',
    '',
    'B. 值得立项时：',
    '   - 本回合第一个工具调用必须是 reqboard_capture',
    '   - 问题一「需求名称」：候选标题经 title_options 传入（最多 3 个），最贴切的置首',
    '   - 问题二「需求类型」：feature / bug / doc / refactor / spike / chore',
    '   - 问题三「提示词难度」：simple / standard / advanced / expert',
    '   - 用户作答后同一次调用内创建并绑定本窗口',
    '',
    'C. 不立项时：',
    '   - 回复第一行写明「本条不立项：<一句话理由>」',
    '   - 然后正常回答用户',
    '',
    '**绝对禁止（违反 = 逻辑错误）**：',
    '- 写了「本条不立项」后又调 reqboard_capture',
    '- 调了 reqboard_capture 又写「本条不立项」',
    '- 用户已给出精确值仍弹框立项',
    '',
    '本次待裁定的用户消息（节选，最多 300 字）：',
    '',
    `> ${snippet}${trimmed.length > 300 ? '…' : ''}`,
  ].join('\n')
}

/** 引导文本（纯字面量）。窗口已完成/取消/归档全部需求后重新变为 unbound → 引导复现。 */
export function captureGuidanceText(windowKey: string): string {
  // 全部字面量，无 {{变量}}。短小精炼，避免挤占上下文预算。
  return [
    `${PM_BADGE_PREFIX}项目捕获（reqboard · 本窗口 ${windowKey.slice(0, 16)} 未绑定需求）`,
    '',
    '本窗口当前没有进行中的需求记录。若用户在本窗口提出了新的工作意图',
    '（新功能 / 缺陷修复 / 文档 / 重构 / 技术调研 / 维护事项），且该工作值得立项，',
    '直接调 reqboard_capture（pm 专有立项弹框）——一次调用弹出「立项三问」并在同一次调用内',
    '完成创建与窗口绑定：问题一「需求名称」（可经 title_options 传候选，最贴切一项推荐置首，',
    '允许自定义输入）；问题二「需求类型」（feature / bug / doc / refactor / spike / chore）；',
    '问题三「提示词难度」（simple / standard / advanced / expert）。用户作答即立项确认',
    '（创建即立项，无待归类/建议卡中间态），**不需要**再补调 reqboard_create。',
    '弹框通道不可用时该工具返回 fallback=board：此时改为文字向用户取值后再调 reqboard_create',
    '（title / category / prompt_difficulty / summary / reason）。',
    '',
    '判不准是否值得立项时按"值得"处理——直接调 reqboard_capture 弹框问用户（框里可以选"不需要"，',
    '比沉默跳过安全）；仅闲聊或询问已有需求进度时无需弹框、无需立项。',
  ].join('\n')
}
