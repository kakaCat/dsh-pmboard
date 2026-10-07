/**
 * 粒度判定（REQ-261007125552-32cb FR-4 / FR-5）——拆分粒度的**纯函数判定单点**。
 *
 * 为什么独立成模块（而不塞进 Footprint.ts）：Footprint 管「一轮装不装得下」（容量），
 * 本模块管「拆得够不够细」（形态）——两个问题的阈值与豁免语义都不同，混在一个文件里
 * 迟早互相污染。domain 层纪律：零 IO、不碰时间与随机数。
 *
 * 词法契约的唯一权威描述在 docs/requirements/REQ-261007125552-32cb/design/interfaces.md
 * §接口声明词法；改这里必须同步该节（反之亦然）。
 *
 * @module dsh-pmboard/domain/task/Granularity
 */
import { LIMITS } from '../limits.js'
import { fmt } from '../text/fmt.js'

/**
 * HTTP 路由声明：`POST /api/x`（反引号可有可无；动词必须全大写、紧跟空格与 `/` 开头路径）。
 * 刻意不认小写动词与无路径的裸动词——散文里的「post 一下」不算接口声明（防误报）。
 */
const HTTP_ROUTE_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w./:@{}-]+)/g

/** 工具定义声明：`tool: reqboard_xxx` / `工具：reqboard_xxx`（半角/全角冒号都认）。 */
const TOOL_DECL_RE = /(?:tool|工具)\s*[:：]\s*([a-z][\w-]*)/gi

/**
 * 从实施描述（implementation）中提取接口声明清单（去重、自然序）。
 *
 * 只认**声明式写法**——描述性文字（散文里的「接口」「API」字样）不算；
 * 同一声明重复出现（正文 + 示例各一次）按去重后计数。
 */
export function countInterfaceDeclarations(implementation: string): string[] {
  const found = new Set<string>()
  for (const m of implementation.matchAll(HTTP_ROUTE_RE)) {
    found.add(m[1] + ' ' + m[2])
  }
  for (const m of implementation.matchAll(TOOL_DECL_RE)) {
    found.add('tool: ' + (m[1] ?? ''))
  }
  return [...found].sort()
}

/** 粒度警告判定的最小入参（不依赖 PlanTask 全型——调用方按需取字段，保持纯函数可单测）。 */
export interface GranularityCardLike {
  key: string
  side?: string | undefined
  footprint?: { files?: number | undefined } | undefined
  prototypeRefs?: readonly string[] | undefined
}

/**
 * 形态软门（FR-5，恒 warn）：只产出点名文案，**绝不**拒绝——与超容量门同哲学
 * （超了是风险不是错误，人可知情放行）。
 *
 * 两维：
 *  ① 文件面过宽：footprint.files > LIMITS.footprintFilesSoftMax；
 *  ② 一卡多锚点：side=frontend 且 prototypeRefs.length > 1（UI 卡应一卡一组件锚点）。
 *
 * 未声明 footprint 的卡不判第一维（未声明 ≠ 0，与 Footprint 判定同款口径）。
 */
export function granularityWarningsOf(card: GranularityCardLike): string[] {
  const out: string[] = []
  const files = card.footprint?.files
  if (typeof files === 'number' && files > LIMITS.footprintFilesSoftMax) {
    out.push(
      fmt('卡 {key} 文件面过宽（footprint.files={n} > {max}）：请按接口/组件切小；确属聚合/迁移类卡可知情放行（软门，不拒）', {
        key: card.key,
        n: String(files),
        max: String(LIMITS.footprintFilesSoftMax),
      }),
    )
  }
  const anchors = card.prototypeRefs?.length ?? 0
  if (card.side === 'frontend' && anchors > 1) {
    out.push(
      fmt('卡 {key} 一卡多锚点（prototypeRefs={n} 条）：UI 卡应一卡一组件锚点，请按组件树切小（软门，不拒）', {
        key: card.key,
        n: String(anchors),
      }),
    )
  }
  return out
}
