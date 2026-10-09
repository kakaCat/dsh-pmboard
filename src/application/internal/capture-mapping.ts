/**
 * 立项弹框 · 题目与答案映射（REQ-e3b6a0 t8 / FR-7；REQ-261007223647-da5d t1/t2 重构）——纯逻辑，零 I/O、零端口。
 *
 * 为什么单独一个模块（而不是留在用例里）：
 *  ① 它是**表单契约**（问题目 + 答案映射 + 缺项默认），与"弹框 + 创建"的编排正交，
 *     独立后可被用例、测试与输出契约扫描各自引用而不互相牵连；
 *  ② 输出契约静态扫描按"工具 → 响应源文件"逐行抓 return 键（tests/output-contract.test.ts），
 *     编排文件里的内部映射对象会被误判成"未声明的响应字段"——分离即让两件事各归其位。
 *
 * 口径事实源：问数**只由本文件的 CAPTURE_QUESTION_IDS 记账**（当前 4 项 = 名称 / 类型 / 算力档位 /
 * 文件落点）；agent 可见文案一律**不数问数**，所以别再往文案里抄数字或承诺"几处同一口径"
 * ——那是派生量，抄一处就会漂一处（REQ-261007200706-89b7 FR-2）。
 *
 * 2026-10-07 重构（REQ-261007223647-da5d FR-3/FR-4，D-6/D-8/D-9）：
 *  - 推荐标记改为**选项 label 后缀**「（推荐）」——宿主只认这个（`dsh-client-ui-user-questions`
 *    的 `/\s*(?:\((?:recommended|推荐)\)|（…）)\s*$/i`），且**只看首项**；description 里的推荐字样
 *    宿主完全不看（这正是"死弹框/推荐不生效"的根因）；
 *  - 名称候选首项带后缀、✖️ 固定末位（不再占首项默认位）、新增「⚡ 全部按推荐值立项」一键过；
 *  - 第二段由 4 问收到 3 问：文档位置 + 工作区**合并为「文件落点」一问**，选项直接给拼好的
 *    绝对路径预览（方案 A，D-8），由 mapCaptureAnswers 拆回 (workspaceRoot, docBasePath)；
 *  - 答案值带后缀 ⇒ 映射必须先剥后缀再严格相等校验，否则静默回落默认（DM-1 警告的坑）。
 *
 * @module dsh-pmboard/application/internal/capture-mapping
 */
import type { AskAnswer, AskQuestion } from '../ports.js'
import {
  ALL_PROMPT_DIFFICULTIES,
  ALL_REQ_CATEGORIES,
  type PromptDifficulty,
  type RequirementCategory,
} from '../../shared/protocol.js'
import { LIMITS } from '../../domain/limits.js'
import { pmHeader } from '../../domain/text/pm-badge.js'

/** 四问的稳定 id（答案按 id 回收，不靠顺序）。 */
export const CAPTURE_QUESTION_IDS = {
  name: 'name',
  category: 'category',
  difficulty: 'difficulty',
  location: 'location',
} as const

/** 缺项回落用的既有默认（与 reqboard_create 的 schema 默认一致）。 */
export const CAPTURE_DEFAULTS = {
  category: 'feature' as RequirementCategory,
  difficulty: 'standard' as PromptDifficulty,
  docLocation: 'docs/requirements/<REQ>/',
}

/**
 * 工作区哨兵值（**内部契约**，不再作为面向用户的选项 label——2026-10-07 前它直接显示成
 * `session-workspace`，是"弹框内容有问题"的实锤之一）。选项现在给绝对路径预览，
 * 映射时按已知根前缀反解回哨兵。
 */
export const WORKSPACE_SENTINELS = {
  session: 'session-workspace',
  host: 'host-default',
} as const

/** 拒绝立项的标记前缀 */
export const REJECT_PREFIX = '✖️'

/** 一键过（全部按推荐值立项）的标记前缀 */
export const RECOMMEND_ALL_PREFIX = '⚡'

/** 一键过选项 label（答案值；映射按前缀识别）。 */
export const RECOMMEND_ALL_LABEL = '⚡ 全部按推荐值立项'

/** 文件落点自定义输入的 label（答案值；映射按它识别为"用户自填"）。 */
export const LOCATION_CUSTOM_LABEL = '自定义路径'

/**
 * 推荐标记后缀（**宿主契约**）：`dsh-client-ui-user-questions` 的 parseRecommendedLabel
 * 用同一形状，且**只检查 options[0]**；命中即预选为草稿并自绘标记。改这里等于改宿主协议。
 */
const RECOMMEND_SUFFIX_RE = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i

/** 去除推荐后缀（幂等；无后缀原样返回）。答案值消费方**必须先过这一步**再严格相等校验。 */
export function stripRecommendSuffix(label: string): string {
  return label.replace(RECOMMEND_SUFFIX_RE, '')
}

/** 给 label 加推荐后缀（**只应加在首项 label 上**——宿主只看首项）。 */
export function withRecommendLabel(label: string): string {
  return label + '（推荐）'
}

/**
 * answers 回执键清单（**单一事实源**，REQ-261003204143-3219 FR-3；2026-10-07 起 4 键）：
 * 本常量 → CaptureMapping.answers 类型（tsc 守）→ CaptureTool schema（生成式）→
 * tests/capture-output-contract.test.ts 键集断言守运行时。
 */
export const CAPTURE_ANSWER_KEYS = ['title', 'category', 'difficulty', 'location'] as const
export type CaptureAnswerKey = (typeof CAPTURE_ANSWER_KEYS)[number]

/** 类型中文名（弹框选项 description 展示）。
 *  label 必须保持枚举原值（可加推荐后缀，由 stripRecommendSuffix 剥离）——
 *  mapCaptureAnswers 按严格相等校验 selected[0]。 */
export const CATEGORY_ZH: Readonly<Record<RequirementCategory, string>> = {
  feature: '功能（新增能力）',
  bug: '缺陷（修复线上/代码问题）',
  doc: '文档（只改文档，不产代码）',
  refactor: '重构（行为不变的结构调整）',
  spike: '调研（产出是结论，不是留下的代码）',
  chore: '杂项（维护性小改）',
}

/** 算力档位的中文说明（D-6：这四档直接影响 LLM 投入的算力，别再只给四个裸词）。 */
export const DIFFICULTY_ZH: Readonly<Record<PromptDifficulty, string>> = {
  simple: '轻量提示词、最少检查，算力最省；适合小改/快任务',
  standard: '完整流程纪律，算力与质量平衡；适合大多数需求',
  advanced: '更细的提示词与检查点，算力更高；适合复杂需求',
  expert: '最严纪律、最多检查，算力最高；适合高风险改动',
}

/** 文件名（落点预览用：`<root>/docs/requirements/<REQ>/`）。 */
const DEFAULT_DOC_DIR = 'docs/requirements/<REQ>/'

/**
 * 第 1 段：立项意愿 + 需求名称（选项顺序即推荐顺序：**首个 = 推荐位**，宿主据此预选）。
 * **「✖️ 不需要立项」在这一段就必须能被消费**——它决定要不要再问第二段
 * （REQ-260924002956-f37c BUG-1：拒绝语义原本只是第 1 问的一个选项，弹框只好一路问完）。
 *
 * 2026-10-07（FR-3）：✖️ 从首位挪到**末位**（首项让给推荐候选，宿主才会预选）；
 * 题干带一句话立项理由（agent 已传 reason/summary，此前弹框一个字都没显示——"死弹框"感来源）；
 * 新增「⚡ 全部按推荐值立项」一键过（选中则第二段整段跳过，后 3 问走默认并记 defaults_used）。
 */
export function buildCaptureIntentQuestions(
  titleOptions: readonly string[],
  ctx: { reasonLine?: string } = {},
): AskQuestion[] {
  const candidates = titleOptions
    .map(label => label.trim())
    .filter(label => label.length > 0)
    .slice(0, 3)

  // ⚠️ 绝不能写 `description: i === 0 ? '…' : undefined`（2026-10-08 实测）：值为 undefined
  // 的键在 JSON 往返里会消失 ⇒ 宿主 api gateway 判 `not lossless JSON data` 并**拒收整条
  // 弹框请求**（浏览器侧收不到，错误还被误报成「用户取消」）。有条件才展开键。
  const nameOptions: Array<{ label: string; description?: string }> = candidates.map((label, i) => ({
    label: i === 0 ? withRecommendLabel(label) : label,
    ...(i === 0 ? { description: 'agent 推荐 · 最贴近本次意图' } : {}),
  }))
  if (candidates.length > 0) {
    nameOptions.push({
      label: RECOMMEND_ALL_LABEL,
      description: '名称/类型/算力档位/文件落点全走推荐值，一次点击完成立项（记 defaults_used）',
    })
  }
  // 拒绝项**固定末位**：它不再占默认高亮位，且写明收益（30 分钟不再弹）——引导用选项终止，
  // 而不是关弹框（关弹框不留痕 ⇒ 下次还会被弹，正是 2026-10-07 用户现场）。
  nameOptions.push({
    label: `${REJECT_PREFIX} 不需要立项`,
    description: '本次不创建；30 分钟内本窗口不再弹立项框',
  })

  const reason = (ctx.reasonLine ?? '').trim()
  const question = candidates.length > 0 && reason.length > 0
    ? `建议立项：《${candidates[0]}》——${reason}`
    : candidates.length > 0
      ? '需求名称（可选候选、自定义输入，或选择「不需要立项」）'
      : '需求名称（自定义输入，或选择「不需要立项」）'

  return [
    {
      id: CAPTURE_QUESTION_IDS.name,
      header: pmHeader('立项确认'),
      question,
      options: nameOptions,
    },
  ]
}

/** 落点选项的 label（绝对路径预览；首项带推荐后缀）。 */
function locationLabel(absPath: string, recommended: boolean): string {
  const withSlash = absPath.endsWith('/') ? absPath : absPath + '/'
  return recommended ? withRecommendLabel(withSlash) : withSlash
}

/** 去掉尾斜杠（拼绝对预览用）。 */
function trimSlash(p: string): string {
  return p.replace(/\/+$/, '')
}

/**
 * 第 2 段：立项明细（类型 / 算力档位 / 文件落点）。只在第一段未拒绝、未走一键过时下发。
 *
 * 2026-10-07（D-8 方案 A）：「文档位置」与「工作区」两问**合并为一问**——选项直接给拼好的
 * 绝对路径预览，用户作答那一刻就看到文件会落在哪（此前两问分离，任何一问都看不到合成落点）。
 */
export function buildCaptureDetailQuestions(workspaceOptions: {
  sessionCwd: string
  hostCwd: string
}): AskQuestion[] {
  const sessionBase = trimSlash(workspaceOptions.sessionCwd) + '/' + DEFAULT_DOC_DIR
  const hostBase = trimSlash(workspaceOptions.hostCwd) + '/' + DEFAULT_DOC_DIR
  return [
    {
      id: CAPTURE_QUESTION_IDS.category,
      header: pmHeader('需求类型'),
      question: '需求类型',
      options: ALL_REQ_CATEGORIES.map((label, i) => ({
        label: i === 0 ? withRecommendLabel(label) : label,
        description: CATEGORY_ZH[label],
      })),
    },
    {
      id: CAPTURE_QUESTION_IDS.difficulty,
      header: pmHeader('算力档位'),
      question: '立项后 agent 在这条需求上投入多少 LLM 算力（提示词详略与检查强度）',
      options: ALL_PROMPT_DIFFICULTIES.map(label => ({
        label: label === CAPTURE_DEFAULTS.difficulty ? withRecommendLabel(label) : label,
        description: DIFFICULTY_ZH[label],
      })),
    },
    {
      id: CAPTURE_QUESTION_IDS.location,
      header: pmHeader('文件落点'),
      question: '这条需求的文档与产物文件创建到哪里（选项即拼好的绝对路径）',
      options: [
        { label: locationLabel(sessionBase, true), description: '当前工作区 · 标准需求目录' },
        { label: locationLabel(hostBase, false), description: '宿主默认工作区 · 标准需求目录' },
        { label: LOCATION_CUSTOM_LABEL, description: '输入绝对路径（须已存在），或相对目录（相对当前工作区）' },
      ],
    },
  ]
}

/**
 * 兼容导出：一次四问（= 两段拼接，内容与顺序逐字一致）。
 * 保留它让既有调用点/测试继续用"四问"口径，不必感知分段实现。
 */
export function buildCaptureQuestions(
  titleOptions: readonly string[],
  workspaceOptions: { sessionCwd: string; hostCwd: string },
  ctx: { reasonLine?: string } = {},
): AskQuestion[] {
  return [
    ...buildCaptureIntentQuestions(titleOptions, ctx),
    ...buildCaptureDetailQuestions(workspaceOptions),
  ]
}

/** 四问作答 → 创建参数的映射结果（defaultsUsed = 走了默认值的问项 id，回执里如实说明）。 */
export interface CaptureMapping {
  title: string
  category: RequirementCategory
  difficulty: PromptDifficulty
  /** 工作区相对的需求文档目录（台账 docBasePath）。 */
  docLocation: string
  /** 工作区原始作答（哨兵值或自定义绝对路径；解析成绝对路径由用例负责，那里才有 fs 访问）。 */
  workspace: string
  rejected: boolean
  /** 选中「⚡ 全部按推荐值立项」：第二段未下发，后 3 问全走默认。 */
  acceptAllRecommended: boolean
  /** 回执 answers：键集由 CAPTURE_ANSWER_KEYS 派生（FR-3）——加问项先加常量，类型当场报错。 */
  answers: Record<CaptureAnswerKey, string>
  defaultsUsed: string[]
}

/** 解析根（拆分「文件落点」绝对路径预览用）。缺省 = 无从拆分，绝对路径整体当工作区。 */
export interface CaptureRoots {
  sessionCwd: string
  hostCwd: string
}

/** 单问取值：自定义输入优先，否则取首个选项（推荐后缀在此剥离——答案值消费的唯一入口）。 */
export function pickAnswer(answers: readonly AskAnswer[], id: string): string {
  const answer = answers.find(a => a.id === id)
  const custom = (answer?.custom ?? '').trim()
  if (custom.length > 0) return stripRecommendSuffix(custom).trim()
  return stripRecommendSuffix(((answer?.selected ?? [])[0] ?? '').trim()).trim()
}

/** 判断是否为绝对路径（POSIX / Windows 盘符）。 */
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

/**
 * 「文件落点」作答 → (workspace, docLocation) 拆分（IF-2）。
 *
 * 规则：
 *  ① 空 → 会话工作区哨兵 + 默认目录（记 defaultsUsed）；
 *  ② 命中已知根前缀（会话 / 宿主）→ 对应哨兵 + 余下相对段；
 *  ③ 绝对路径但不含已知根 → 整体当工作区根 + 默认目录（记 defaultsUsed：目录部分走了默认值）；
 *  ④ 相对路径 → 会话工作区哨兵 + 该相对路径（高级用法：docs/rfcs/ 等）。
 */
export function splitLocationAnswer(
  raw: string,
  roots: CaptureRoots,
): { workspace: string; docLocation: string; usedDefaultDoc: boolean } {
  const answer = stripRecommendSuffix(raw).trim()
  if (answer.length === 0 || answer === LOCATION_CUSTOM_LABEL) {
    return { workspace: WORKSPACE_SENTINELS.session, docLocation: CAPTURE_DEFAULTS.docLocation, usedDefaultDoc: true }
  }
  const sessionRoot = trimSlash(roots.sessionCwd)
  const hostRoot = trimSlash(roots.hostCwd)
  const under = (root: string): string | undefined => {
    if (root.length === 0) return undefined
    return answer === root ? '' : answer.startsWith(root + '/') ? answer.slice(root.length + 1) : undefined
  }
  const underSession = under(sessionRoot)
  if (underSession !== undefined) {
    const doc = trimSlash(underSession)
    return { workspace: WORKSPACE_SENTINELS.session, docLocation: doc.length > 0 ? doc : CAPTURE_DEFAULTS.docLocation, usedDefaultDoc: doc.length === 0 }
  }
  const underHost = under(hostRoot)
  if (underHost !== undefined) {
    const doc = trimSlash(underHost)
    return { workspace: WORKSPACE_SENTINELS.host, docLocation: doc.length > 0 ? doc : CAPTURE_DEFAULTS.docLocation, usedDefaultDoc: doc.length === 0 }
  }
  if (isAbsolutePath(answer)) {
    const doc = trimSlash(answer)
    return { workspace: doc, docLocation: CAPTURE_DEFAULTS.docLocation, usedDefaultDoc: true }
  }
  return { workspace: WORKSPACE_SENTINELS.session, docLocation: trimSlash(answer), usedDefaultDoc: false }
}

/**
 * 答案映射契约（FR-7 第 4 条）：名称优先 custom；类型/难度取选项，非法或缺失回落既有默认
 * 并记进 defaultsUsed。**不猜名称**——名称为空即由调用方响亮失败（没有可回落的默认）。
 *
 * 2026-10-07：全部选项值先 stripRecommendSuffix（宿主会把带后缀的原始 label 原样回传——
 * 不剥就严格相等校验失败、静默回落默认，REQ-260929210741 类事故）；「文件落点」按 roots 拆分。
 */
export function mapCaptureAnswers(answers: readonly AskAnswer[], roots?: CaptureRoots): CaptureMapping {
  const rawTitle = pickAnswer(answers, CAPTURE_QUESTION_IDS.name)
  const acceptAllRecommended = rawTitle.startsWith(RECOMMEND_ALL_PREFIX)
  const rejected = rawTitle.startsWith(REJECT_PREFIX)
  // 一键过/拒绝：名称题选的是控制项而非名称——名称由调用方用 titleOptions[0] 补（一键过）
  // 或直接不立项（拒绝），此处一律回空串，绝不把控制项 label 当需求名。
  const title = acceptAllRecommended || rejected ? '' : rawTitle.slice(0, LIMITS.titleMax)

  const rawCategory = pickAnswer(answers, CAPTURE_QUESTION_IDS.category)
  const categoryOk = (ALL_REQ_CATEGORIES as readonly string[]).includes(rawCategory)
  const rawDifficulty = pickAnswer(answers, CAPTURE_QUESTION_IDS.difficulty)
  const difficultyOk = (ALL_PROMPT_DIFFICULTIES as readonly string[]).includes(rawDifficulty)

  const rawLocation = pickAnswer(answers, CAPTURE_QUESTION_IDS.location)
  const split = splitLocationAnswer(
    rawLocation,
    roots ?? { sessionCwd: '', hostCwd: '' },
  )

  const defaultsUsed: string[] = []
  if (!categoryOk) defaultsUsed.push(CAPTURE_QUESTION_IDS.category)
  if (!difficultyOk) defaultsUsed.push(CAPTURE_QUESTION_IDS.difficulty)
  if (rawLocation.length === 0 || split.usedDefaultDoc) defaultsUsed.push(CAPTURE_QUESTION_IDS.location)

  return {
    title,
    category: categoryOk ? (rawCategory as RequirementCategory) : CAPTURE_DEFAULTS.category,
    difficulty: difficultyOk ? (rawDifficulty as PromptDifficulty) : CAPTURE_DEFAULTS.difficulty,
    docLocation: split.docLocation,
    workspace: split.workspace,
    rejected,
    acceptAllRecommended,
    answers: {
      title,
      category: categoryOk ? rawCategory : CAPTURE_DEFAULTS.category,
      difficulty: difficultyOk ? rawDifficulty : CAPTURE_DEFAULTS.difficulty,
      location: rawLocation,
    },
    defaultsUsed,
  }
}
