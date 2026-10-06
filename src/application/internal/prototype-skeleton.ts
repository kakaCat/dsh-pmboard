/**
 * 原型骨架幂等落盘（REQ-261005105032-3b02 t11 · FR-2 / FR-4）。
 *
 * 为什么需要：原型**存在门**只会拦人——没人给模板时它就是"交不上就出不去"的死结。故进入需求阶段时
 * 先幂等落一份**可填**骨架（每个 FR 一个区块位 + 恰好一块 geometry 观测量位 + INDEX 四列权威清单）。
 * 三条纪律：① **永不覆盖**——目标文件已存在就一个字节都不写（骨架是 agent 的草稿起点，
 * 回退后再进入需求阶段绝不能把已填内容冲掉）；② **只告警不阻断**——落盘失败（端口没装配 /
 * 无权限 / 磁盘满）只留痕，转移照常完成（落不下脚手架 ≠ 需求推进不了）；③ **判不了不发明**——
 * UI 判定只走 `requiredStageArtifactKinds` 一处口径，读不到 requirement.md 时按该类型模板的
 * 缺省 sides（{@link CATEGORY_DEFAULT_SIDES}）判，不另立一套"什么算 UI 需求"。
 *
 * IO 全走注入端口（application 层禁 `import node:`）：端口窄面 = exists/read/write，生产实现
 * `FileDocRepository` 结构化满足（其 `write` 自带 `mkdir -p`）。骨架正文（数据）在
 * `prototype-skeleton-template.ts`，本模块只做编排。
 *
 * @module dsh-pmboard/application/internal/prototype-skeleton
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import { parseDocument } from './content-gates.js'
import { designDocPolicyFrom, requiredStageArtifactKinds } from './category-doc-sets.js'
import { PROTOTYPE_HTML_SKELETON, prototypeIndexSkeleton } from './prototype-skeleton-template.js'

/** 骨架模板（相对包根）：门禁 how 文案与本模块**同址**，避免两处地址各写一遍后漂移。 */
export const PROTOTYPE_TEMPLATE_REL = 'templates/brainstorming/prototype.html'
/** 原型落点目录（需求目录相对）；`INDEX.md` 是四列表格的唯一载体。 */
export const PROTOTYPE_DIR = 'prototypes'
/** 骨架文件名（agent 可改名；改名后 INDEX「路径」列须同步）。 */
export const DEFAULT_PROTOTYPE_NAME = 'detail.html'
/** 权威清单文件名（`PROTOTYPE_DIR` 内；四列表格的唯一载体）。 */
export const PROTOTYPE_INDEX_NAME = 'INDEX.md'

/**
 * 读不到 requirement.md 时按**类型**取的缺省端侧声明。
 *
 * 为什么需要：`reqboard_create` 立项那一刻需求文档还没落盘（它是 brainstorming 阶段的产物），
 * 而"立项即落骨架"必须有判据。判据不是拍脑袋——feature 的文档模板
 * （`templates/brainstorming/feature.md`）front-matter 就写着 `sides: [frontend, backend]`，
 * 那就是**平台对新 feature 需求的缺省声明**；此处登记同一份值，并由用例断言两者逐字一致。
 * 其余类型模板不声明 sides → 空（未声明 ≠ 声明了前端，故不落）。
 */
export const CATEGORY_DEFAULT_SIDES: Readonly<Record<string, readonly string[]>> = {
  feature: ['frontend', 'backend'],
}

/** 落盘端口窄面（`DocRepository` 三方法同形，结构化满足，不必新适配器）。 */
export interface PrototypeSkeletonPort {
  exists(relPath: string): boolean
  read(relPath: string): Promise<string>
  write(relPath: string, content: string): Promise<void>
}
export interface PrototypeSkeletonOptions {
  /** 显式端侧声明（调用方已知时给；不给 = 读 requirement.md front-matter）。 */
  sides?: readonly string[]
  /** 当前时间（毫秒）：`{{DATE}}` 由它渲染——时间源仍单点在 `deps.clock`，本模块不碰 `Date.now()`。 */
  nowMs: number
  /** 骨架文件名（缺省 {@link DEFAULT_PROTOTYPE_NAME}）。 */
  fileName?: string
  /** 留痕通道（缺省 `console.warn`）。 */
  warn?: (message: string) => void
}
export interface PrototypeSkeletonResult {
  /** 本次是否真写了文件（false = 不落 / 已存在 / 失败，原因见 `reason`）。 */
  landed: boolean
  /** 本次新写出的工作区相对路径（幂等命中 = 空数组）。 */
  files: string[]
  reason: 'landed' | 'already-exists' | 'not-ui' | 'exempt' | 'error'
}
/** 渲染三个占位符。替换值走函数形态：需求标题里的 `$&` 之类不会被当成替换模式解释。 */
function render(text: string, req: RequirementRecord, date: string): string {
  return text
    .replaceAll('{{TITLE}}', () => req.title)
    .replaceAll('{{REQ_ID}}', () => req.id)
    .replaceAll('{{DATE}}', () => date)
}

/** 幂等落盘骨架，返回本次真正写了哪些文件（幂等命中 → 空数组）。**从不抛错**：端口缺失或写失败
 * 一律降级成 `reason='error'` + 一条 warning（纪律②）。 */
export async function landPrototypeSkeleton(
  ports: PrototypeSkeletonPort,
  req: RequirementRecord,
  opts: PrototypeSkeletonOptions,
): Promise<PrototypeSkeletonResult> {
  const warn = opts.warn ?? ((message: string): void => { console.warn(message) })
  const dir = 'docs/requirements/' + req.id + '/' + PROTOTYPE_DIR
  try {
    const docPath = 'docs/requirements/' + req.id + '/requirement.md'
    let exempt = ''
    let declared: readonly string[] | undefined
    if (ports.exists(docPath)) {
      const frontmatter = parseDocument(await ports.read(docPath)).frontmatter
      exempt = (frontmatter['prototype_exempt'] ?? '').trim()
      declared = designDocPolicyFrom(frontmatter).sides
    }
    // 已声明不要原型（理由要待人确认才"生效"，但骨架此刻就该让位）：不硬塞脚手架。
    if (exempt !== '') return { landed: false, files: [], reason: 'exempt' }
    const sides = opts.sides ?? declared ?? CATEGORY_DEFAULT_SIDES[req.category ?? ''] ?? []
    if (!requiredStageArtifactKinds('brainstorming', req.category, sides).includes('prototype')) {
      return { landed: false, files: [], reason: 'not-ui' }
    }
    const name = opts.fileName ?? DEFAULT_PROTOTYPE_NAME
    const date = new Date(opts.nowMs).toISOString().slice(0, 10)
    const planned: readonly (readonly [string, string])[] = [
      [dir + '/' + name, render(PROTOTYPE_HTML_SKELETON, req, date)],
      [dir + '/' + PROTOTYPE_INDEX_NAME, render(prototypeIndexSkeleton(name), req, date)],
    ]
    const files: string[] = []
    for (const [rel, body] of planned) {
      if (ports.exists(rel)) continue // 纪律①：已存在就一个字节都不写
      await ports.write(rel, body)
      files.push(rel)
    }
    return files.length > 0
      ? { landed: true, files, reason: 'landed' }
      : { landed: false, files, reason: 'already-exists' }
  } catch (err) {
    warn('[prototype-skeleton] 原型骨架落盘失败（只告警，不阻断阶段转移）：' + (err instanceof Error ? err.message : String(err)))
    return { landed: false, files: [], reason: 'error' }
  }
}
