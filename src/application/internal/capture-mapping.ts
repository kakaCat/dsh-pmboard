/**
 * 立项三问 · 题目与答案映射（REQ-e3b6a0 t8 / FR-7）——纯逻辑，零 I/O、零端口。
 *
 * 为什么单独一个模块（而不是留在用例里）：
 *  ① 它是**表单契约**（三问题目 + 答案映射 + 缺项默认），与"弹框 + 创建"的编排正交，
 *     独立后可被用例、测试与输出契约扫描各自引用而不互相牵连；
 *  ② 输出契约静态扫描按"工具 → 响应源文件"逐行抓 return 键（tests/output-contract.test.ts），
 *     编排文件里的内部映射对象会被误判成"未声明的响应字段"——分离即让两件事各归其位。
 *
 * 口径事实源：四问 = 需求名称 / 需求类型 / 提示词难度 / 文档位置（与 CreateTool/prompt.ts、
 * capture-section.ts、QueryState.ts 三处注入文案同一份口径）。
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

/** 五问的稳定 id（答案按 id 回收，不靠顺序）。 */
export const CAPTURE_QUESTION_IDS = {
  name: 'name',
  category: 'category',
  difficulty: 'difficulty',
  doc_location: 'doc_location',
  workspace: 'workspace',
} as const

/** 预定义的文档位置选项 */
export const DOC_LOCATION_OPTIONS = [
  { 
    label: 'docs/requirements/<REQ>/', 
    description: '推荐 - 标准需求目录' 
  },
  { 
    label: 'docs/rfcs/', 
    description: 'RFC 设计提案' 
  },
  { 
    label: 'docs/architecture/', 
    description: '架构文档' 
  },
  { 
    label: 'docs/guides/', 
    description: '操作指南' 
  },
] as const

/** 缺项回落用的既有默认（与 reqboard_create 的 schema 默认一致）。 */
export const CAPTURE_DEFAULTS = {
  category: 'feature' as RequirementCategory,
  difficulty: 'standard' as PromptDifficulty,
  docLocation: 'docs/requirements/<REQ>/',
}

/**
 * 工作区选项的哨兵值（第 5 问，REQ-260929210741-30ae FR-6）。
 * 选项 label 用哨兵而非真实路径——真实路径随会话变化，写死在选项里会过期；
 * 映射时把哨兵解析成当时的路径。自定义输入 = 用户直接填绝对路径。
 */
export const WORKSPACE_SENTINELS = {
  session: 'session-workspace',
  host: 'host-default',
} as const

/** 拒绝立项的标记前缀 */
export const REJECT_PREFIX = '✖️'

/**
 * answers 回执键清单（**单一事实源**，REQ-261003204143-3219 FR-3）。
 *
 * 为什么需要它：第五问「工作区」上线时，CaptureMapping.answers（5 键）与单测都同步了，
 * 唯独 CaptureTool 的 output.schema.answers（手写 4 键 + additionalProperties:false）漏改——
 * 于是每份回执被绑定层拒收（`answers.workspace is not a declared property`，2026-10-03 实测）。
 * 现在三处同源：本常量 → CaptureMapping.answers 类型（tsc 守）→ CaptureTool schema（生成式，
 * 描述表 Record<CaptureAnswerKey> 缺键即 tsc 错）→ tests/capture-output-contract.test.ts 键集断言守运行时。
 */
export const CAPTURE_ANSWER_KEYS = ['title', 'category', 'difficulty', 'docLocation', 'workspace'] as const
export type CaptureAnswerKey = (typeof CAPTURE_ANSWER_KEYS)[number]

/** 类型中文名（弹框选项 description 展示）。
 *  label 必须保持枚举原值——mapCaptureAnswers 按严格相等校验 selected[0]，
 *  label 改了（如 feature（功能））就会校验失败、静默回落默认值。 */
export const CATEGORY_ZH: Readonly<Record<RequirementCategory, string>> = {
  feature: '功能（新增能力）',
  bug: '缺陷（修复线上/代码问题）',
  doc: '文档（只改文档，不产代码）',
  refactor: '重构（行为不变的结构调整）',
  spike: '调研（产出是结论，不是留下的代码）',
  chore: '杂项（维护性小改）',
}

/**
 * 第 1 段：立项意愿 + 需求名称（选项顺序即推荐顺序：首个 = 推荐位）。
 * **「✖️ 不需要立项」在这一段就必须能被消费**——它决定要不要再问第二段
 * （REQ-260924002956-f37c BUG-1：拒绝语义原本只是第 1 问的一个选项，弹框只好一路问完）。
 */
export function buildCaptureIntentQuestions(titleOptions: readonly string[]): AskQuestion[] {
  // 需求名称选项：拒绝选项 + 用户候选
  const nameOptions = [
    // 特殊选项：拒绝立项（放在首位）
    {
      label: `${REJECT_PREFIX} 不需要立项`,
      description: '⚠️ 选择此项将取消本次立项'
    },
    // 用户提供的候选名称
    ...titleOptions
      .map(label => label.trim())
      .filter(label => label.length > 0)
      .slice(0, 3)
      .map((label, i) => ({ label, ...(i === 0 ? { description: '推荐' } : {}) })),
  ]

  return [
    {
      id: CAPTURE_QUESTION_IDS.name,
      header: pmHeader('需求名称'),
      question: titleOptions.length > 0
        ? '需求名称（可选候选、自定义输入，或选择"不需要立项"）'
        : '需求名称（自定义输入，或选择"不需要立项"）',
      options: nameOptions,
    },
  ]
}

/** 第 2 段：立项明细（类型 / 难度 / 文档位置 / 工作区）。只在第一段未拒绝时下发。 */
export function buildCaptureDetailQuestions(workspaceOptions: {
  sessionCwd: string
  hostCwd: string
}): AskQuestion[] {
  return [
    {
      id: CAPTURE_QUESTION_IDS.category,
      header: pmHeader('需求类型'),
      question: '需求类型',
      options: ALL_REQ_CATEGORIES.map((label, i) => ({
        label,
        description: (i === 0 ? '推荐 · ' : '') + CATEGORY_ZH[label],
      })),
    },
    {
      id: CAPTURE_QUESTION_IDS.difficulty,
      header: pmHeader('提示词难度'),
      question: '提示词难度',
      options: ALL_PROMPT_DIFFICULTIES.map(label => ({
        label,
        ...(label === CAPTURE_DEFAULTS.difficulty ? { description: '推荐' } : {}),
      })),
    },
    {
      id: CAPTURE_QUESTION_IDS.doc_location,
      header: pmHeader('需求文档位置'),
      question: '需求文档存放位置（选择预设路径或自定义输入）',
      options: DOC_LOCATION_OPTIONS.map((opt, i) => ({
        ...opt,
        ...(i === 0 ? {} : {}), // 首个已有"推荐"标记
      })),
    },
    {
      id: CAPTURE_QUESTION_IDS.workspace,
      header: pmHeader('工作区'),
      question: '需求的工作区（该需求所有文件操作以此根拼接相对路径；自定义输入须为已存在的绝对路径）',
      options: [
        {
          label: WORKSPACE_SENTINELS.session,
          description: '当前会话空间（Recommended）—— ' + workspaceOptions.sessionCwd,
        },
        {
          label: WORKSPACE_SENTINELS.host,
          description: '宿主默认工作区 —— ' + workspaceOptions.hostCwd,
        },
        {
          label: '自定义路径',
          description: '自定义输入（绝对路径，须已存在）',
        },
      ],
    },
  ]
}

/**
 * 兼容导出：一次五问（= 两段拼接，内容与顺序逐字一致）。
 * 保留它让既有调用点/测试继续用"五问"口径，不必感知分段实现。
 */
export function buildCaptureQuestions(titleOptions: readonly string[], workspaceOptions: {
  sessionCwd: string
  hostCwd: string
}): AskQuestion[] {
  return [...buildCaptureIntentQuestions(titleOptions), ...buildCaptureDetailQuestions(workspaceOptions)]
}

/** 五问作答 → 创建参数的映射结果（defaultsUsed = 走了默认值的问项 id，回执里如实说明）。 */
export interface CaptureMapping {
  title: string
  category: RequirementCategory
  difficulty: PromptDifficulty
  docLocation: string
  /** 工作区原始作答（哨兵值或自定义路径；解析成绝对路径由用例负责，那里才有 fs 访问）。 */
  workspace: string
  rejected: boolean
  /** 回执 answers：键集由 CAPTURE_ANSWER_KEYS 派生（FR-3）——加问项先加常量，类型当场报错。 */
  answers: Record<CaptureAnswerKey, string>
  defaultsUsed: string[]
}

/** 单问取值：自定义输入优先，否则取首个选项。 */
export function pickAnswer(answers: readonly AskAnswer[], id: string): string {
  const answer = answers.find(a => a.id === id)
  const custom = (answer?.custom ?? '').trim()
  if (custom.length > 0) return custom
  return ((answer?.selected ?? [])[0] ?? '').trim()
}

/**
 * 答案映射契约（FR-7 第 4 条）：名称优先 custom；类型/难度取选项，非法或缺失回落既有默认
 * 并记进 defaultsUsed。**不猜名称**——名称为空即由调用方响亮失败（没有可回落的默认）。
 * 新增：检测拒绝立项标记、处理文档位置。
 */
export function mapCaptureAnswers(answers: readonly AskAnswer[]): CaptureMapping {
  const rawTitle = pickAnswer(answers, CAPTURE_QUESTION_IDS.name)
  const title = rawTitle.slice(0, LIMITS.titleMax)
  
  // 检测是否选择拒绝立项
  const rejected = title.startsWith(REJECT_PREFIX)
  
  const rawCategory = pickAnswer(answers, CAPTURE_QUESTION_IDS.category)
  const categoryOk = (ALL_REQ_CATEGORIES as readonly string[]).includes(rawCategory)
  const rawDifficulty = pickAnswer(answers, CAPTURE_QUESTION_IDS.difficulty)
  const difficultyOk = (ALL_PROMPT_DIFFICULTIES as readonly string[]).includes(rawDifficulty)
  
  // 文档位置：自定义输入或选项，缺失时回落默认
  const rawDocLocation = pickAnswer(answers, CAPTURE_QUESTION_IDS.doc_location)
  const docLocation = rawDocLocation.length > 0 ? rawDocLocation : CAPTURE_DEFAULTS.docLocation

  // 工作区：自定义输入优先（真实绝对路径），否则取哨兵值；缺失回落会话哨兵（用例侧解析）
  const rawWorkspace = pickAnswer(answers, CAPTURE_QUESTION_IDS.workspace)
  const workspace = rawWorkspace.length > 0 ? rawWorkspace : WORKSPACE_SENTINELS.session

  const defaultsUsed: string[] = []
  if (!categoryOk) defaultsUsed.push(CAPTURE_QUESTION_IDS.category)
  if (!difficultyOk) defaultsUsed.push(CAPTURE_QUESTION_IDS.difficulty)
  if (rawDocLocation.length === 0) defaultsUsed.push(CAPTURE_QUESTION_IDS.doc_location)
  if (rawWorkspace.length === 0) defaultsUsed.push(CAPTURE_QUESTION_IDS.workspace)

  return {
    title,
    category: categoryOk ? (rawCategory as RequirementCategory) : CAPTURE_DEFAULTS.category,
    difficulty: difficultyOk ? (rawDifficulty as PromptDifficulty) : CAPTURE_DEFAULTS.difficulty,
    docLocation,
    workspace,
    rejected,
    answers: {
      title,
      category: categoryOk ? rawCategory : rawCategory.length > 0 ? rawCategory : CAPTURE_DEFAULTS.category,
      difficulty: difficultyOk ? rawDifficulty : rawDifficulty.length > 0 ? rawDifficulty : CAPTURE_DEFAULTS.difficulty,
      docLocation,
      workspace,
    },
    defaultsUsed,
  }
}