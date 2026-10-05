/**
 * 卡片体量的领域校验与判定（REQ-261002175818-80a8 t1 / FR-1、FR-2、FR-3）。
 *
 * 为什么必须单独成模块（零 IO、零 import 外层）：
 *   体量这条通道要同时在**三处**使用——协议层归一（`normalizePlanTasks`）、
 *   用例层判定（`SubmitArtifact` 的返回体）、弹框层披露（`AskConfirm` 的批准文本）。
 *   三处各写一份「什么算合法、算出来多少」必然漂移（本仓 `requirement_refs` 的教训：
 *   判定散在几处就会各说各话），故把判定收敛成纯函数，三处都只调用它。
 *
 * 口径三条（与 design/data-model.md、design/test-cases.md 逐字对齐）：
 *   ① **未声明是正常态**：`undefined`/`null` → `undefined`，绝不冒充 0
 *      （同 `token-usage.ts` 的「不拿 0 冒充缺失」口径）；
 *   ② 合成量 `detailUnits` 的权重与容量取自 `domain/limits`（单一源，INV-2）；
 *   ③ 声明下限 `files ≥ implementation 里点到的去重路径数` 是**防缩水的下界**，
 *      **不是完整性审计**——允许留余量，只堵「少报」这一个作弊方向：那是唯一能骗过门禁的方向。
 *
 * 2026-10-04 对抗式复核后的四处收紧（缺陷都**先用例钉死再修**，见 tests/round-capacity.test.ts
 * 的「复核回归」节；单跑绿曾掩盖过全部四条）：
 *   · 路径正则加**左边界**、归一化反斜杠、大小写不敏感——原先 `https://…/src/a.ts` 与
 *     `mysrc/a.ts` 被误计（下限虚高 → **硬拒合法计划**），而 `src\a.ts`、`Src/a.ts` 被漏计
 *     （下限为 0 → **FR-2 整条被绕过**）；两个方向都实测过；
 *   · 超容量**比较用原始值**，展示值才取两位小数——原先先取整再比较，
 *     raw∈(16,16.005) 一律误判为不超容量（复核穷举出 2025 个反例）；
 *   · `judgeFootprint` 自己校验入参——原先 `{}` 会静默算出 NaN 并判「不超」，
 *     与模块自称的「不静默」自相矛盾；
 *   · `overCapacitySummary` 带**长度预算**——弹框题干只有 `popupQuestionMax` 字符，
 *     原先 8 张卡就能拼出 264 字符，会把批准文本挤爆。
 *
 * @module dsh-pmboard/domain/task/Footprint
 */
import { LIMITS } from '../limits.js'

/** 卡片体量声明：三个**可数的确定量**（不含主观打分，这是它能进机械门禁的前提）。 */
export interface CardFootprint {
  /** 本次要改/新建的文件数（正整数；不得小于 implementation 里点到的路径数） */
  files: number
  /** 验收锚点数：可执行断言条数（正整数） */
  anchors: number
  /** 实施描述与目标改动量合计字符数（正整数，沿用本仓字符口径） */
  chars: number
}

/**
 * 体量判定结果——**算出来的，不落库**。
 * 落库就会与「声明的量」形成两处真相，而声明会随计划重交而变（判定立刻过期）。
 */
export interface FootprintJudgement {
  /** 合成细节量（展示口径：两位小数）。判定用的是**未取整**的原值，见 judgeFootprint */
  detailUnits: number
  /** 本次生效的容量 */
  capacity: number
  /** 是否超容量。true 只意味着「要标红」，**不意味着「要拒绝」**（软门禁） */
  over: boolean
  /** 建议批数 = ceil(原值 / capacity)，下界 2；仅 over 时给出 */
  suggestedBatches?: number
}

/** 体量声明的错误码（跨包可读：消息末尾也附一份，纯文本通道能识别）。 */
export const FOOTPRINT_ERROR = 'REQBOARD_BAD_FOOTPRINT'

/** 带错误码的体量校验错误（调用方按 `code` 分流）。 */
export class FootprintError extends Error {
  readonly code: string = FOOTPRINT_ERROR
  constructor(message: string) {
    super(message + '（' + FOOTPRINT_ERROR + '）')
    this.name = 'FootprintError'
  }
}

/** 声明对象的合法键（严格白名单：未知键一律拒绝，避免"写错字段名却静默生效"）。 */
const FOOTPRINT_KEYS: readonly (keyof CardFootprint)[] = ['files', 'anchors', 'chars']

/**
 * 路径计数正则（2026-10-04 复核后收紧）。
 *
 * 三个细节都是缺陷的产物，别随手删：
 *   · **左边界** `(?<![A-Za-z0-9._-])`：否则 `https://example.com/src/a.ts` 与 `mysrc/a.ts`
 *     会被当成路径计入 → 下限虚高 → **硬拒合法计划**；
 *   · **大小写不敏感** `i`：`Src/a.ts` 也是路径，漏掉就是下限为 0 → **FR-2 被绕过**；
 *   · 反斜杠在计数前统一归一化为 `/`（Windows 写法同样是路径）。
 * 仍是**字面量前缀 + 白名单字符类**（不用用户输入构造正则，避免 ReDoS）；
 * 只有这四类前缀计入——散文里提一句「那个文件」不计入，这是刻意的（见模块注释 ③）。
 */
const PATH_RE = /(?<![A-Za-z0-9._-])(?:src|tests|docs|scripts)\/[A-Za-z0-9._/-]+/gi

/** 值的人读描述（错误消息里用；只描述形态，不回显任意长度内容）。 */
function describe(raw: unknown): string {
  if (raw === null) return 'null'
  if (raw === undefined) return 'undefined'
  if (Array.isArray(raw)) return '数组'
  if (typeof raw === 'object') return '对象'
  return typeof raw + ' ' + String(raw).slice(0, 40)
}

/** 单个数值字段的非法原因（undefined = 合法）。 */
function numberInvalidReason(value: unknown, field: string): string | undefined {
  if (typeof value !== 'number') return field + ' 不是数字（' + describe(value) + '）'
  if (!Number.isFinite(value)) return field + ' 不是有限数（' + String(value) + '）'
  if (!Number.isInteger(value)) return field + ' 必须是整数（收到 ' + String(value) + '）'
  if (value <= 0) return field + ' 必须是正整数（收到 ' + String(value) + '）'
  if (value > LIMITS.footprintValueMax) {
    return field + ' 超过单值上限 ' + String(LIMITS.footprintValueMax) + '（收到 ' + String(value) + '）'
  }
  return undefined
}

/**
 * 单个体量声明的非法原因（undefined = 合法）。给「逐个点名」用，不抛错。
 *
 * **`undefined` / `null` 也算合法**（= 未声明）：本函数回答的是「给了值的话，这个值合法吗」。
 * 若把未声明报成非法，任何 `if (footprintInvalidReason(raw)) reject()` 都会拒掉旧计划，
 * 直接违反 FR-9 与 A7（2026-10-04 复核指出的未爆陷阱）。
 */
export function footprintInvalidReason(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return '不是对象（' + describe(raw) + '）'
  }
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!FOOTPRINT_KEYS.includes(key as keyof CardFootprint)) {
      return '含未知键 ' + key + '（合法键只有 ' + FOOTPRINT_KEYS.join(' / ') + '）'
    }
  }
  for (const key of FOOTPRINT_KEYS) {
    const reason = numberInvalidReason(obj[key], key)
    if (reason !== undefined) return reason
  }
  return undefined
}

/**
 * 规整体量声明。
 *
 * 入参缺省（`undefined` / `null`）⇒ `undefined`——**未声明是正常态，不是错误**
 * （存量计划与旧台账都是这个形状）。形状非法 ⇒ 抛 {@link FootprintError}，
 * 消息点明**哪个字段**、为什么非法（"哪张卡写错了什么"必须一眼可见）。
 */
export function normalizeFootprint(raw: unknown, where = 'footprint'): CardFootprint | undefined {
  if (raw === undefined || raw === null) return undefined
  const reason = footprintInvalidReason(raw)
  if (reason !== undefined) throw new FootprintError(where + ' 非法：' + reason)
  const obj = raw as CardFootprint
  return { files: obj.files, anchors: obj.anchors, chars: obj.chars }
}

/** implementation 里点到的**去重路径**（原样保留大小写，供错误消息点名）。 */
function countedPaths(implementation: string | undefined): string[] {
  if (typeof implementation !== 'string' || implementation.length === 0) return []
  // ① 先抹掉 URL：`https://example.com/src/a.ts` 里的 `src/a.ts` 不是本仓文件，
  //    而左边界挡不住它（`src` 前面是 `/`）——复核实测过这条会虚高下限、硬拒合法计划。
  // ② 反斜杠归一化：Windows 写法同样是路径，漏计会让 FR-2 的下限归零。
  const text = implementation.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ').replace(/\\/g, '/')
  const re = new RegExp(PATH_RE.source, 'gi')
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) found.add(m[0])
  return [...found]
}

/**
 * 声明下限：implementation 正文里点到的**去重路径数**。
 *
 * 为什么是「去重」而不是「出现次数」：同一文件写两遍不该让下限翻倍。
 * 为什么只认四类前缀：这是**下界**，宁可漏（上限留给人看）也不误伤散文。
 */
export function declaredFilesFloorFrom(implementation: string | undefined): number {
  return countedPaths(implementation).length
}

/**
 * 声明不得小于证据（FR-2）。未声明 ⇒ 直接返回（不判定）。
 *
 * 单向约束：允许声明留余量（`files` 大于路径数），**不允许缩水**——
 * 缩水是唯一能骗过容量门禁的方向，而留余量只是让人看见更保守的估计。
 *
 * 消息里**列出被计到的路径**：下限一旦被误计（复核实测过 URL 误计），
 * 不列路径使用者就只能猜自己哪里写错了。
 */
export function assertFootprintFloor(
  fp: CardFootprint | undefined,
  implementation: string | undefined,
  where = 'footprint',
): void {
  if (fp === undefined) return
  const paths = countedPaths(implementation)
  if (fp.files >= paths.length) return
  throw new FootprintError(
    where + ' 声明小于证据：files=' + String(fp.files)
    + ' 但 implementation 里点到 ' + String(paths.length) + ' 个路径（' + paths.join('、') + '）'
    + '——把漏列的文件补进 implementation，或把 files 改成实际值（允许留余量，不允许缩水）',
  )
}

/** 合成细节量的**原始值**（判定用；不取整，避免把 16.0005 抹成 16 而漏判超容量）。 */
function rawDetailUnitsOf(fp: CardFootprint): number {
  return fp.files * LIMITS.detailWeightPerFile
    + fp.anchors * LIMITS.detailWeightPerAnchor
    + fp.chars / LIMITS.detailCharsPerUnit
}

/** 合成细节量（展示口径：保留两位小数，避免浮点噪声进返回体与留痕）。 */
export function detailUnitsOf(fp: CardFootprint): number {
  return Math.round(rawDetailUnitsOf(fp) * 100) / 100
}

/** 建议批数 = ceil(detailUnits / capacity)，下界 2（调用方仅在 over 时使用）。 */
export function suggestedBatchesOf(detailUnits: number, capacity: number): number {
  return Math.max(2, Math.ceil(detailUnits / capacity))
}

/**
 * 判定：合成量 + 与容量比对。**严格大于**才算超容量（等于容量不算超）。
 *
 * 三条纪律（复核实测后收紧）：
 *   · 比较用**原始值**，展示值才取整——先取整会把 raw∈(16,16.005) 全判成不超；
 *   · 体量对象非法**响亮报错**（`{}` 曾静默算出 NaN 并判「不超」）；
 *   · 容量非法同样报错，不静默按 0 处理（否则每张卡都被判超，门禁变成噪音源）。
 */
export function judgeFootprint(fp: CardFootprint, capacity: number): FootprintJudgement {
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity <= 0) {
    throw new FootprintError('容量非法：必须是正的有限数（收到 ' + String(capacity) + '）')
  }
  if (fp === undefined || fp === null) {
    throw new FootprintError('体量未声明：无法判定（调用方应先判 undefined，再决定是否判定）')
  }
  const reason = footprintInvalidReason(fp)
  if (reason !== undefined) throw new FootprintError('体量非法：' + reason)
  const raw = rawDetailUnitsOf(fp)
  const over = raw > capacity
  return {
    detailUnits: Math.round(raw * 100) / 100,
    capacity,
    over,
    ...(over ? { suggestedBatches: suggestedBatchesOf(raw, capacity) } : {}),
  }
}

/** 超容量摘要输入（只要 key 与可选体量；不设 `title`，避免与调用方模板双写）。 */
export interface FootprintSummaryInput {
  key: string
  footprint?: CardFootprint
}

/** 超长就截断并显式标出省略（只在本模块内使用，保证「不超预算」这条性质不被绕过）。 */
function clip(text: string, maxChars: number): string {
  if (maxChars <= 1) return text.slice(0, Math.max(0, maxChars))
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1) + '…'
}

/**
 * 超容量摘要（弹框与看板评论**共用同一份文本**，避免两处措辞漂移）。
 *
 * **无超容量卡时返回空串**——调用方因此可以无条件拼接，而既有文本逐字节不变。
 *
 * `maxChars` 是**硬预算**（缺省 `LIMITS.footprintSummaryMaxChars`）：批准弹框的题干总共只有
 * `popupQuestionMax` 字符，摘要必须有界（复核实测：8 张卡 + 24 字符 key 会拼出 264 字符）。
 * 截断时如实写明省略了几张——**声称省略就必须真的省略**，反之不许出现省略号。
 * 看板评论想要更长文本，由调用方显式传入更大的预算（不是把约束删掉）。
 *
 * 文本自带 `超容量：` / `超容量 N 张：` 标签：调用方**不要**再拼一遍标签（会双写）。
 */
export function overCapacitySummary(
  tasks: readonly FootprintSummaryInput[],
  capacity: number,
  // 显式标注 `number`（REQ-261004222448-292a 基线修复）：默认值是 `LIMITS.*` 的 const 字面量，
  // 不标注就会被推断成字面量类型 `120`，于是「调用方显式传更大预算」（本函数文档明写的用法）
  // 在类型上被禁止。标注后签名与本函数文档一致，运行期一字未改。
  maxChars: number = LIMITS.footprintSummaryMaxChars,
): string {
  const over: { key: string; units: number; batches: number }[] = []
  for (const t of tasks) {
    if (t.footprint === undefined) continue
    const j = judgeFootprint(t.footprint, capacity)
    if (!j.over) continue
    over.push({ key: t.key, units: j.detailUnits, batches: j.suggestedBatches ?? 2 })
  }
  if (over.length === 0) return ''

  if (over.length === 1) {
    const one = over[0]!
    const full = '超容量：' + one.key + '（' + String(one.units) + ' DU / 容量 ' + String(capacity)
      + '，建议 ' + String(one.batches) + ' 批）'
    if (full.length <= maxChars) return full
    return clip('超容量：' + one.key + '(建议' + String(one.batches) + '批)', maxChars)
  }

  const header = '超容量 ' + String(over.length) + ' 张：'
  const items = over.map(x => x.key + '(建议' + String(x.batches) + '批)')
  const shown: string[] = []
  for (let i = 0; i < items.length; i += 1) {
    const rest = items.length - (i + 1)
    const candidate = header + [...shown, items[i]!].join('、') + (rest > 0 ? '…等 ' + String(rest) + ' 张' : '')
    if (candidate.length > maxChars) break
    shown.push(items[i]!)
  }
  if (shown.length === items.length) return header + shown.join('、')
  const rest = over.length - shown.length
  if (shown.length === 0) return clip(header + items[0]! + '…等 ' + String(rest) + ' 张', maxChars)
  // 2026-10-04（t6 复核上报、本窗口实测复核后补）：最终串也过 clip，让**预算这条承诺无条件成立**。
  // 实测 n=2…20 的常见形状并未越界（循环拒绝的候选比最终串长一项，故最终通常更短）；
  // 残余风险只在余数跨位数时（「等 9 张」→「等 10 张」）多出 1 个字符——概率低但不是零，
  // 而「声称有硬预算」的函数不该留这种口子。clip 在未超时是恒等操作，无副作用。
  return clip(header + shown.join('、') + '…等 ' + String(rest) + ' 张', maxChars)
}
