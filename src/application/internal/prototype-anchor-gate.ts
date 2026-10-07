/**
 * 原型锚点门（REQ-261005105032-3b02 FR-4）+ 本需求的两问
 * （REQ-261006201649-cc89 FR-1 非骨架判据 / FR-4 几何量证据校验）。
 *
 * ## 为什么锚点门从 prototype-gates.ts 搬到这里
 *
 * 两个理由，都是尺寸与依赖纪律逼出来的：
 *   ① `prototype-gates.ts` 是**尺寸门禁**盯着的文件（≤400 行，`tests/size-budget.test.ts`
 *      的白名单**只收 `client/` 与 `shared/protocol.ts`**，不收 application/）。本需求要往
 *      锚点门里加两问，加在原地必然超标，而往白名单里塞一条正是那道门禁防的滥用形态。
 *   ② 锚点门是**唯一**被本需求改动的门（存在门 / 版本门一字不动）：把它单独放一层，
 *      "本需求改了什么"在目录结构上就看得见——不必读两个门才能确认第三次没被顺手改。
 *
 * 拆分口径与 `content-gates` / `content-trace` / `design-gates` 同款：编排留原处、
 * 判定下沉纯函数、被改的那一道门独立成模块。`prototype-gates.ts` 以 `export { … } from`
 * **再导出**本模块的唯一入口，既有调用点（`content-gate-wiring.ts`）一行不改。
 *
 * ## 门内判定顺序（顺序本身是判据的一部分）
 *
 * ```
 * 权威原型文件不存在        → prototype_anchor_missing（点名路径）
 *   ↓ 存在
 * 非骨架判据（新增）        → 命中 ⇒ prototype_placeholder   ← 必须最先：骨架自带示例锚点
 *   ↓ 未命中（或基线不可得）                                    与示例 geometry 块，天然"锚点齐"，
 * geometry 块数 ≠ 1 / JSON 坏 → prototype_anchor_missing        放后面只会给人误导性的码
 *   ↓ 恰好一块
 * serves 声明的 FR 覆盖      → 缺 ⇒ prototype_anchor_missing
 *   ↓ 覆盖齐
 * 阈值字段命中（D-10）       → prototype_anchor_missing
 *   ↓ 无
 * 几何量证据（新增）         → invalid ⇒ prototype_geometry_unverified
 *   ↓ collected / unverified
 * PASS
 * ```
 *
 * 早退纪律不变（属版本门职责）：INDEX 缺失 / 有解析缺口 / authoritative 条数 ≠ 1 → 返回
 * `undefined`——同一处坏由单点报一次，不让人在两条消息里对齐。
 *
 * ## 存量豁免
 *
 * `createdAt < DOC_QUALITY_RULES_SINCE` 的需求，**两个新判据整段不判**（复用既有常量与
 * 判据函数，不另立日期）；既有锚点/几何量判据照旧——存量需求在旧口径下的行为逐字不变。
 *
 * @module dsh-pmboard/application/internal/prototype-anchor-gate
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import { docQualityRulesApply } from '../../domain/workflow/DocQualityRules.js'
import { fmt } from '../../domain/text/fmt.js'
import { envelope } from './gate-feedback.js'
import type { GateFailure } from './artifact-gates.js'
import { parseDocument, type DocsReader } from './content-gates.js'
import { conditionalStageArtifactsFor, designDocPolicyFrom } from './category-doc-sets.js'
import { parsePrototypeIndex, parsePrototypeMetadata, type ProtoObservation } from './prototype-gates.js'
import { prototypePlaceholderOf } from './prototype-placeholder.js'

/**
 * 原型骨架正文的**取数口**（可注入；未装配 → 非骨架判据不判）。
 *
 * 为什么注入而不是直接 import 模板常量：application 层读模板正文属"环境事实"，
 * 与 `DocsReader` / `NowPort` 同类。注入还有一个可测性收益：测试能构造"基线不可得"，
 * 那是判据契约里明确的降级分支（不判、不假红），不注入就测不到。
 */
export interface PrototypeSkeletonPort {
  /** 骨架正文（`templates/brainstorming/prototype.html` 的逐字内容）；读不出 → undefined */
  skeletonTemplate(): string | undefined
}

/** 几何量证据端口（窄面：文件在不在 / 摘要多少；未装配 → 记未采集并放行）。 */
export interface PrototypeEvidencePort {
  /** 工作区相对路径是否指向一个真实文件 */
  shotExists(relPath: string): boolean
  /** 该文件的 sha256（64 位小写十六进制）；读不出 → undefined */
  sha256Of(relPath: string): Promise<string | undefined>
}

/** 锚点门的可选依赖（都不传 = 只有既有判据生效，行为与改动前逐字一致）。 */
export interface AnchorGateDeps {
  skeleton?: PrototypeSkeletonPort
  evidence?: PrototypeEvidencePort
}

function reqDir(reqId: string): string {
  return 'docs/requirements/' + reqId
}

// ── 纯函数：几何量证据的复核结论 ──────────────────────────────────────────────
/** 单条观测量的证据复核结论。 */
export type ObservationEvidence =
  | { state: 'collected' }
  | { state: 'unverified' }
  | { state: 'invalid'; reason: string }

/**
 * sha256 的形态判据：**64 位十六进制**（大小写都收）。
 *
 * 为什么收大写：hex 摘要的大写写法语义完全相同（比较时统一转小写），
 * 把大写判成"形态不合法"是**格式洁癖冒充判据**——它拦不住任何真问题，
 * 只会让照 `shasum` 输出粘贴的人白返工一次。
 */
const SHA256_RE = /^[0-9a-fA-F]{64}$/

/** 工作区相对路径口径（与 `toReqRelative` 的"伪路径/越界/`..`"纪律同源）。 */
function workspaceRelative(raw: string): boolean {
  const p = raw.trim()
  if (p === '') return false
  if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) return false
  if (p.split('/').includes('..')) return false
  return true
}

/**
 * 逐条观测量的证据校验（唯一判据）。
 *
 * 判定表（与 design/interfaces.md 逐行对应）：
 * | `shot` | `shotSha256` | 文件存在 | 摘要匹配 | 结论 |
 * |---|---|---|---|---|
 * | 缺 | 缺 | — | — | `unverified`（放行，存量口径） |
 * | 有 | 缺 | — | — | `invalid`（缺 sha256，无法复核） |
 * | 缺 | 有 | — | — | `invalid`（缺截图路径） |
 * | 有 | 有 | 否 | — | `invalid`（点名路径） |
 * | 有 | 有 | 是 | 否 | `invalid`（给期望与实际前 12 位） |
 * | 有 | 有 | 是 | 是 | `collected` |
 */
export async function observationEvidenceOf(
  o: ProtoObservation,
  deps: PrototypeEvidencePort | undefined,
): Promise<ObservationEvidence> {
  const shot = o.shot?.trim()
  const sha = o.shotSha256?.trim()
  if ((shot === undefined || shot === '') && (sha === undefined || sha === '')) return { state: 'unverified' }
  if (shot === undefined || shot === '') return { state: 'invalid', reason: '缺 shot（截图路径）' }
  if (sha === undefined || sha === '') return { state: 'invalid', reason: '缺 shotSha256（无法复核截图内容）' }
  if (!workspaceRelative(shot)) {
    return { state: 'invalid', reason: fmt('shot 路径口径不合法：{shot}（须为工作区相对路径）', { shot }) }
  }
  if (!SHA256_RE.test(sha)) {
    return { state: 'invalid', reason: fmt('shotSha256 形态不合法：{sha}（须为 64 位十六进制）', { sha }) }
  }
  if (deps === undefined) return { state: 'unverified' } // 端口未装配：只告警不阻断
  if (!deps.shotExists(shot)) return { state: 'invalid', reason: fmt('截图不在：{shot}', { shot }) }
  const actual = await deps.sha256Of(shot)
  if (actual === undefined) return { state: 'unverified' } // 读不出摘要：不把"读不到"当"错了"
  // 两边都转小写再比：hex 摘要大小写语义相同（形态判据已放宽到大写，比较口径必须跟上，
  // 否则"允许大写"只做了一半——这是自测里真被抓住的一次）
  if (actual.toLowerCase() !== sha.toLowerCase()) {
    return {
      state: 'invalid',
      reason: fmt('截图摘要不符：期望 {want}…，实际 {got}…（截图不是本次交付的那张）', {
        want: sha.slice(0, 12), got: actual.slice(0, 12),
      }),
    }
  }
  return { state: 'collected' }
}

/** 事实性锚点（任一命中即算"给了事实"）。 */
const FACT_ANCHORS: readonly RegExp[] = [
  /[^\s/]+\/[^\s]*\.[A-Za-z0-9]+/,            // 路径形态：a/b.png
  /\.(png|jpe?g|webp)\b/i,                     // 截图/图片
  /\b(npx|pnpm|git|node)\s/,                   // 命令
  /#FR-\d+/,                                   // 原型锚点
  /prototypes\//,                              // 原型路径
  /\d+\s*屏/,                                  // 屏位（界面位置）
]

/**
 * `needsHuman` 的理由是否**给了可核对的事实**。
 *
 * 只回答"有没有给事实"，**不判**理由是否成立——判断"这个理由站得住吗"是人的事。
 * 反例（必须拒）：`不好看` / `不一致` / `视觉上不对` / 空串 / 纯标点。
 * 正例（必须放行）：`见 evidence/gate-1280.png 右侧卡片` / `跑 npx vitest run tests/x.test.ts`
 * / `详情页 #FR-4 第三个格子`。
 */
export function humanReasonHasFact(reason: string): boolean {
  const text = reason.trim()
  if (text === '') return false
  if (!/[\p{L}\p{N}]/u.test(text)) return false // 纯标点/符号不算事实
  return FACT_ANCHORS.some(re => re.test(text))
}

// ── 门的组装 ──────────────────────────────────────────────────────────────────
const LEAD = 'brainstorming → design 推进未执行：'
const HOW_PROTOTYPE = 'templates/brainstorming/prototype.html'

interface GateContext { frontmatter: Record<string, string>; applies: boolean }

/** 读 requirement.md（取数）。返回 undefined = 本需求不走原型门（存量 / 非 UI）。 */
async function contextOf(docs: DocsReader, req: RequirementRecord): Promise<GateContext | undefined> {
  if (req.artifacts === undefined || req.artifacts.length === 0) return undefined
  const reqPath = reqDir(req.id) + '/requirement.md'
  const requirementText = docs.exists(reqPath) ? await docs.read(reqPath) : ''
  const frontmatter = parseDocument(requirementText).frontmatter
  const sides = designDocPolicyFrom(frontmatter).sides
  const applies = conditionalStageArtifactsFor(req.category, sides)
    .some(c => c.stage === 'brainstorming' && c.kind === 'prototype')
  return { frontmatter, applies }
}

/**
 * 锚点门（含本需求新增两问）。
 *
 * `deps` 全缺省时：非骨架判据与几何量证据**都不判**（基线不可得 / 端口未装配），
 * 门的行为与改动前逐字一致——这是零回归的前提，也是 t2 之前调用点的兼容保证。
 */
export async function checkPrototypeAnchorsGate(
  docs: DocsReader,
  req: RequirementRecord,
  deps: AnchorGateDeps = {},
): Promise<GateFailure | undefined> {
  const ctx = await contextOf(docs, req)
  if (ctx === undefined || !ctx.applies) return undefined
  const indexPath = reqDir(req.id) + '/prototypes/INDEX.md'
  if (!docs.exists(indexPath)) return undefined // 版本门职责
  const index = parsePrototypeIndex(parseDocument(await docs.read(indexPath)), req.id)
  if (index.gaps.length > 0) return undefined // 版本门职责（缺列 / 路径口径坏）
  const auth = index.rows.filter(r => r.status === 'authoritative')
  const row = auth.length === 1 ? auth[0] : undefined
  if (row === undefined) return undefined // 版本门职责
  const htmlPath = reqDir(req.id) + '/' + row.path
  if (!docs.exists(htmlPath)) {
    return anchorFailure(req, [fmt('权威原型 {path} 不在需求目录内（磁盘上找不到 {abs}）', { path: row.path, abs: htmlPath })], row.path)
  }
  const html = await docs.read(htmlPath)

  // 新判据整段受存量豁免（与既有 DocQualityRules 同源，不另立日期）
  const newChecksApply = docQualityRulesApply(req.createdAt)
  const baseline = newChecksApply ? deps.skeleton?.skeletonTemplate() : undefined
  if (baseline !== undefined && baseline.trim() !== '') {
    const placeholder = prototypePlaceholderOf(html, baseline)
    if (placeholder !== undefined) return placeholderFailure(req, row.path, placeholder)
  }

  const meta = parsePrototypeMetadata(html)
  const gaps: string[] = []
  if (meta.blocks !== 1) {
    gaps.push(meta.blocks === 0
      ? fmt('{path} 缺 proto-geometry 块（须有恰好一块 <!-- proto-geometry … --> 观测注释）', { path: row.path })
      : fmt('geometry 块 ×{n}（必须恰好一块，§10 #4）', { n: meta.blocks }))
  }
  if (meta.parseError !== undefined) gaps.push(fmt('proto-geometry 块内 JSON 解析失败（按缺块处理）：{err}', { err: meta.parseError }))
  for (const fr of row.serves) {
    if (!meta.anchors.some(a => a.fr === fr)) gaps.push(fmt('{path} 缺 id="{fr}" 区块（INDEX「服务条款」列声明了它）', { path: row.path, fr }))
  }
  gaps.push(...meta.violations)
  if (gaps.length > 0) return anchorFailure(req, sorted(gaps), row.path)

  if (newChecksApply && deps.evidence !== undefined) {
    for (const o of meta.geometry) {
      const verdict = await observationEvidenceOf(o, deps.evidence)
      if (verdict.state === 'invalid') return geometryFailure(req, row.path, o.name, verdict.reason)
    }
  }
  return undefined
}

const sorted = (items: readonly string[]): string[] => [...new Set(items)].sort()

function placeholderFailure(
  req: RequirementRecord,
  path: string,
  hit: { reading: { lineRatio: number; markers: string[] }; hits: readonly { kind: string; marker?: string; ratio?: number }[] },
): GateFailure {
  const causes = hit.hits.map(h => h.kind === 'marker'
    ? fmt('占位标记「{marker}」', { marker: h.marker ?? '' })
    : fmt('与模板行重合率 {pct}%（> 90% 即命中）', { pct: Math.round((h.ratio ?? 0) * 1000) / 10 }))
  return {
    code: 'prototype_placeholder',
    kind: 'prototype',
    gaps: [fmt('权威原型 {path} 仍是模板骨架：{causes}', { path, causes: causes.join('；') })],
    message: envelope({
      lead: LEAD,
      what: fmt('权威原型 {path} 仍是模板骨架（没有填过内容）——{causes}', { path, causes: causes.join('；') }),
      why: '它不是设计结论，占权威位等于「照模板实现」；原型面的门此前只查锚点与几何量块，查不出「一个字没填」',
      how: '把每个 FR 区块的界面结构 / 关键控件 / 交互路径填成真实设计，或换一份填过的原型并把 '
        + reqDir(req.id) + '/prototypes/INDEX.md 的 authoritative 指过去（骨架见 ' + HOW_PROTOTYPE
        + '），再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）重新登记',
    }),
  }
}

function geometryFailure(req: RequirementRecord, path: string, name: string, reason: string): GateFailure {
  return {
    code: 'prototype_geometry_unverified',
    kind: 'prototype',
    gaps: [fmt('{path} 的观测量 {name} 读数无法复核：{reason}', { path, name, reason })],
    message: envelope({
      lead: LEAD,
      what: fmt('权威原型 {path} 的观测量 {name} 读数无法复核：{reason}', { path, name, reason }),
      why: '几何量读数是「实现与原型一致」的唯一机器读数；没有截图与摘要，验收只能凭提交者自述',
      how: '在该观测量上补 shot（截图路径，工作区相对，如 ' + reqDir(req.id) + '/evidence/x.png）与 shotSha256（该文件 sha256）——两键都要对；确实没截图时两键都留空（记 unverified，放行）；再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）重新登记',
    }),
  }
}

function anchorFailure(req: RequirementRecord, gaps: readonly string[], path: string): GateFailure {
  return {
    code: 'prototype_anchor_missing',
    kind: 'prototype',
    gaps: [...gaps],
    message: envelope({
      lead: LEAD,
      what: fmt('权威原型 {path}：{list}', { path, list: gaps.join('；') }),
      why: '权威原型缺机器可判读的 FR 锚点 / 唯一一块 proto-geometry，或几何量里出现阈值字段（阈值属设计决策，D-10）',
      how: '按 ' + HOW_PROTOTYPE + ' 补每个「服务条款」声明 FR 的 <section id="FR-N"> 与**恰好一块** <!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->，只留观测量名与实测值（阈值移到 design/frontend.md），再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）重新登记',
    }),
  }
}
