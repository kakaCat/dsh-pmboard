/**
 * rtm-design.yml 生成（REQ-260926140539-457b FR-2 触发点 4）。
 *
 * 产出：设计章节（含 serves 标注）、FR → 设计映射、设计覆盖度。
 *
 * REQ-261005105032-3b02 起两处扩展（决议 `#18` / `#49`）：
 *   - `serves` 允许引用 `D-x` 裁定编号（与 FR 同为可引用编号，FR-9）；
 *   - 原型锚点（`\S+#FR-\d+`）**不进 serves**，走独立字段 `DesignSection.protoRefs`——
 *     锚点是页面区块定位符，混进 serves 会让覆盖度虚高（§7.3 实测缺陷）。
 *
 * @module @pi-investment/reqboard/rtm/design-generator
 */
import { getRTMPath, readRTM, writeRTM } from './file-io.js'
import type { RTMContext } from './context.js'
import { parseDesignSections, type ParseFile } from './parser.js'
import { buildFRToDesign } from './traceability-builder.js'
import { calculateDesignCoverage } from './coverage-calculator.js'
import { RTM_SCHEMA_VERSION, type DesignSection, type FR, type RTMBrainstorming, type RTMDesign } from './types.js'

/** 取本需求的 FR：优先 brainstorming RTM，退回实时解析 requirement.md。 */
export function effectiveFRs(ctx: RTMContext, reqId: string): FR[] {
  const brain = readRTM<RTMBrainstorming>(getRTMPath(ctx.reqDir(reqId), 'rtm-brainstorming.yml'))
  const cached = brain?.outputs?.requirements
  if (Array.isArray(cached) && cached.length > 0) return cached
  return ctx.requirementFRs(reqId)
}

/**
 * 锚点形态与占位符：`\S+#FR-\d+` → `<proto-anchor>`（决议 `#6`）。
 *
 * 为什么本包自己写一份而不是调宿主的 `stripPrototypeAnchors`：那个函数住在
 * `src/application/internal/content-gates.ts`，而 vendor/reqboard 是**独立可发布包**，
 * 不得反向 import dsh-pmboard（模块边界见 context.ts）。此处**逐字复刻同一正则与同一固定 token**
 * ——形态只有一处定义（决议 `#6`），两处实现由各自的回归用例锁死（本包见
 * tests/rtm-prototype-sections.test.ts；宿主见 tests/content-gates.test.ts）。
 */
const PROTO_ANCHOR_RE = /\S+#FR-\d+/g
const PROTO_ANCHOR_TOKEN = '<proto-anchor>'

/** 抹掉原型锚点引用（同 `stripPrototypeAnchors`）。 */
function stripPrototypeAnchors(text: string): string {
  return text.replace(PROTO_ANCHOR_RE, PROTO_ANCHOR_TOKEN)
}

// 与 parser.ts 的 HEADING / SERVES_INLINE / 行内 serves 正则同源：本文件只补"parser 抽不出"的两类
// 编号（D-x）与"parser 会误算"的一类文本（锚点），故必须按 parser 的同一套行扫描规则切块。
const HEADING = /^(#{2,6})\s+(.+?)\s*$/
const SERVES_INLINE = /serves\s*[:：]\s*([^。；;]*)/g
const SERVES_LINE = /serves\s*[:：]\s*(.+)$/
const FR_TOKEN = /FR-\d+/g
const D_TOKEN = /D-\d+/g

/** 一个"章节作用域"：serves 声明原文 + 章节全文（锚点取数用）。 */
interface SectionScope {
  /** serves 声明拼文（标题行内 + 后续 serves 行），按声明顺序换行拼接。 */
  decl: string
  /** 章节全文（含标题行，到下一个标题行为止）。 */
  text: string
}

/** slug 化（与 parser.ts 的 slugify 逐字同源：无编号标题的 ref 口径必须一致，否则挂不上）。 */
function slugify(title: string): string {
  return title
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/** 是否为代码围栏行（``` 开头）。 */
function isFence(line: string): boolean {
  const t = line.trimStart()
  return t.charCodeAt(0) === 96 && t.charCodeAt(1) === 96 && t.charCodeAt(2) === 96
}

/**
 * 按 parser 的同一套规则把设计文档切成 `ref → 章节作用域`。
 *
 * 为什么需要它：`parseDesignSections` 只收 `FR-\d+` 且不区分锚点，本卡又不许改 parser.ts
 * （范围只含本生成器）——故在此**按同一 ref 口径**再扫一遍文档，只补 D-x 与锚点两件事。
 * 口径漂移由用例守住：`tests/rtm-prototype-sections.test.ts` 断言本扫描的 ref 集合与
 * `parseDesignSections` 的 ref 集合**逐项相等**（不一致即红）。
 */
function sectionScopes(files: readonly ParseFile[]): Map<string, SectionScope> {
  const out = new Map<string, SectionScope>()
  for (const file of files) {
    let ref: string | null = null
    let decl: string[] = []
    let text: string[] = []
    let fence = false
    let frontMatter = false
    const flush = (): void => {
      if (ref === null) return
      const prev = out.get(ref)
      if (prev === undefined) out.set(ref, { decl: decl.join('\n'), text: text.join('\n') })
      else {
        prev.decl = `${prev.decl}\n${decl.join('\n')}`
        prev.text = `${prev.text}\n${text.join('\n')}`
      }
      ref = null
    }
    const lines = file.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      if (i === 0 && line.trim() === '---') {
        frontMatter = true
        continue
      }
      if (frontMatter) {
        if (line.trim() === '---') frontMatter = false
        continue
      }
      if (isFence(line)) {
        fence = !fence
        continue
      }
      if (fence) continue
      const h = HEADING.exec(line)
      if (h !== null) {
        flush()
        const raw = h[2] ?? ''
        const serves: string[] = []
        SERVES_INLINE.lastIndex = 0
        let mm: RegExpExecArray | null
        while ((mm = SERVES_INLINE.exec(raw)) !== null) serves.push(mm[1] ?? '')
        const titleText = raw.replace(/serves\s*[:：][^。；;]*/g, '').trim()
        const num = /^(\d+(?:\.\d+)*)[.、]?\s*(.*)$/.exec(titleText)
        const section = num !== null ? (num[1] as string) : slugify(titleText)
        if (section.length === 0) continue
        ref = `${file.path}#${section}`
        decl = serves
        text = [line]
        continue
      }
      if (ref === null) continue
      text.push(line)
      const sv = SERVES_LINE.exec(line)
      if (sv !== null) decl.push(sv[1] ?? '')
    }
    flush()
  }
  return out
}

/**
 * 把 D-x / 锚点两处补丁打到 parser 产出的章节上：
 *   ① `serves` 里由**锚点**带进来的 FR 编号删掉（假引用，§7.3）；
 *   ② serves 声明里的 `D-x` 加进 `serves`（FR-9：与 FR 同为可引用编号）；
 *   ③ 章节文本里的锚点原文进 `protoRefs`（单独统计，不与 FR 引用混算）。
 * 采用"补丁"而非"重算 serves"：parser 已认的编号一律保留，避免本地扫描漏一种声明形态就丢引用。
 */
export function applyPrototypeRefs(
  sections: readonly DesignSection[],
  files: readonly ParseFile[],
): DesignSection[] {
  const scopes = sectionScopes(files)
  return sections.map(s => {
    const scope = scopes.get(s.ref)
    if (scope === undefined) return s // 无本地作用域 = 无可补，原样保留（不猜）
    const anchorFrIds = new Set((scope.decl.match(PROTO_ANCHOR_RE) ?? []).flatMap(a => a.match(FR_TOKEN) ?? []))
    const serves = [
      ...s.serves.filter(id => !anchorFrIds.has(id)),
      ...(stripPrototypeAnchors(scope.decl).match(D_TOKEN) ?? []),
    ]
    const protoRefs = [...new Set(scope.text.match(PROTO_ANCHOR_RE) ?? [])]
    return {
      ...s,
      serves: [...new Set(serves)],
      ...(protoRefs.length > 0 ? { protoRefs } : {}),
    }
  })
}

/** 生成/更新 rtm-design.yml。 */
export function generateDesignRTM(ctx: RTMContext, reqId: string): RTMDesign {
  const filePath = getRTMPath(ctx.reqDir(reqId), 'rtm-design.yml')
  const existing = readRTM<RTMDesign>(filePath)
  const frs = effectiveFRs(ctx, reqId)
  const files = ctx.designFiles(reqId)
  const sections = applyPrototypeRefs(parseDesignSections(files), files)
  const frToDesign = buildFRToDesign(frs, sections)
  const data: RTMDesign = {
    metadata: ctx.metadata('design', reqId, existing, { rtm_version: RTM_SCHEMA_VERSION }),
    inputs: { requirements: frs },
    outputs: { design_sections: sections },
    traceability: { fr_to_design: frToDesign },
    coverage: { design: calculateDesignCoverage(frs, frToDesign) },
  }
  writeRTM(filePath, data)
  return data
}
